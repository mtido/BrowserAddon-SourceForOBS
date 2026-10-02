// Service worker: reacts to tab/window events, renders the overlay and writes the files.
import {
  getSettings, getState, patchState, sanitizeFolder, isExcluded, isLocalHost,
  reduceUrl, composeText, t, DEFAULTS
} from './common.js';
import {
  loadFavicon, renderOverlay, transparentPng, blobToDataUrl, drawIcon
} from './render.js';

let timer = null;
let queue = Promise.resolve();
let lastWritten = null; // { png, text, folder }
let lastStatusSig = '';
let delayMs = DEFAULTS.delay;

// ---------- scheduling ----------

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, delayMs);
}

function run() {
  clearTimeout(timer);
  queue = queue.then(evaluate).catch((e) => console.error('[StreamSourceURL]', e));
  return queue;
}

// ---------- file writing (downloads API, overwrite in place) ----------

const waiters = new Map();
chrome.downloads.onChanged.addListener((d) => {
  if (d.state && d.state.current !== 'in_progress' && waiters.has(d.id)) {
    waiters.get(d.id)();
  }
});

async function waitDone(id) {
  const [item] = await chrome.downloads.search({ id });
  if (!item || item.state !== 'in_progress') return;
  await new Promise((resolve) => {
    const to = setTimeout(resolve, 5000);
    waiters.set(id, () => { clearTimeout(to); resolve(); });
  });
  waiters.delete(id);
}

async function writeFile(s, name, url) {
  const id = await chrome.downloads.download({
    url,
    filename: `${sanitizeFolder(s.folder)}/${name}`,
    conflictAction: 'overwrite',
    saveAs: false
  });
  await waitDone(id);
  if (s.eraseHistory) await chrome.downloads.erase({ id });
}

async function writeOutput(s, pngDataUrl, text) {
  await writeFile(s, 'current.txt', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  await writeFile(s, 'current.png', pngDataUrl);
}

async function applyDownloadUi(s) {
  try {
    if (chrome.downloads.setUiOptions) {
      await chrome.downloads.setUiOptions({ enabled: !s.hideDownloadUi });
    }
  } catch { /* permission missing or another extension owns the UI */ }
}

// ---------- status / icon ----------

async function publishStatus(kind, extra = {}) {
  const status = { kind, ...extra };
  const sig = JSON.stringify(status);
  if (sig === lastStatusSig) return;
  lastStatusSig = sig;
  await patchState({ status });

  const iconKind = kind === 'idle' ? 'off' : kind;
  const titleKey = kind === 'excluded' ? `status_excluded_${extra.reason || 'list'}` : `status_${kind}`;
  try {
    await chrome.action.setIcon({
      imageData: { 16: drawIcon(iconKind, 16), 32: drawIcon(iconKind, 32) }
    });
    await chrome.action.setTitle({ title: `${t('extName')} – ${t(titleKey)}` });
  } catch (e) {
    console.warn('[StreamSourceURL] icon update failed', e);
  }
}

// ---------- evaluation ----------

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

function excludeReason(tab, s) {
  let u;
  try { u = new URL(tab.url); } catch { return 'scheme'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'scheme';
  if (tab.incognito && !s.incognito) return 'incognito';
  if (s.excludeLocal && isLocalHost(u.hostname)) return 'local';
  if (isExcluded(tab.url, s.excluded)) return 'list';
  return null;
}

async function emit(s, text, favicon) {
  const blob = await renderOverlay({ text, favicon, style: s.style });
  const png = await blobToDataUrl(blob);
  const folder = sanitizeFolder(s.folder);
  if (lastWritten && lastWritten.png === png && lastWritten.text === text && lastWritten.folder === folder) return;
  await writeOutput(s, png, text);
  lastWritten = { png, text, folder };
}

async function evaluate() {
  const s = await getSettings();
  delayMs = Math.min(10000, Math.max(0, Number(s.delay) || 0));
  const st = await getState();

  if (!s.enabled) { await publishStatus('off'); return; }

  if (st.custom && st.custom.active) {
    const text = composeText(st.custom.text, new Date(st.custom.ts), s);
    await emit(s, text, null);
    await publishStatus('custom', { text });
    return;
  }

  const tab = await getActiveTab();
  if (!tab || !tab.url) return; // e.g. DevTools focused – keep everything as is

  const reason = excludeReason(tab, s);
  if (reason) { await publishStatus('excluded', { reason }); return; }

  const display = reduceUrl(tab.url, s);

  if (st.cleared) {
    if (st.cleared.key === display) { await publishStatus('cleared'); return; }
    await patchState({ cleared: null });
  }

  let shown = st.shown;
  if (!shown || shown.key !== display) {
    shown = { key: display, ts: Date.now() };
    await patchState({ shown });
  }

  const text = composeText(display, new Date(shown.ts), s);
  const favicon = s.showFavicon ? await loadFavicon(tab.url) : null;
  await emit(s, text, favicon);
  await publishStatus('active', { text });
}

async function currentDisplayKey() {
  const s = await getSettings();
  const tab = await getActiveTab();
  if (tab && tab.url && !excludeReason(tab, s)) return reduceUrl(tab.url, s);
  return (await getState()).shown?.key ?? '';
}

async function doClear() {
  const s = await getSettings();
  const key = await currentDisplayKey();
  await writeOutput(s, await blobToDataUrl(await transparentPng()), ' ');
  lastWritten = null;
  await patchState({ cleared: { key }, custom: { active: false, text: '', ts: 0 } });
  await publishStatus('cleared');
}

// ---------- events ----------

chrome.tabs.onActivated.addListener(schedule);
chrome.windows.onFocusChanged.addListener(schedule);
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (!tab.active) return;
  if (change.url || change.status === 'complete' || change.favIconUrl) schedule();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    lastWritten = null; // style/folder may have changed
    getSettings().then(applyDownloadUi);
    run();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'clear') await doClear();
    else if (msg.type === 'customOn') {
      await patchState({ custom: { active: true, text: String(msg.text || '').trim(), ts: Date.now() }, cleared: null });
      await run();
    } else if (msg.type === 'customOff') {
      await patchState({ custom: { active: false, text: '', ts: 0 }, cleared: null });
      lastWritten = null;
      await run();
    } else if (msg.type === 'refresh') await run();
    sendResponse({ ok: true });
  })().catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

async function boot() {
  const s = await getSettings();
  delayMs = Math.min(10000, Math.max(0, Number(s.delay) || 0));
  await applyDownloadUi(s);
  await run();
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: DEFAULTS });
  boot();
});
chrome.runtime.onStartup.addListener(boot);
boot();
