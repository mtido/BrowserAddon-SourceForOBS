import { getSettings, saveSettings, getState, isExcluded, t } from '../src/common.js';
import { localize } from '../src/i18n.js';

const $ = (id) => document.getElementById(id);
localize();

let settings;

async function renderStatus() {
  const { status } = await getState();
  const kind = status?.kind || 'idle';
  const key = kind === 'excluded' ? `status_excluded_${status.reason || 'list'}` : `status_${kind}`;
  $('statusText').textContent = t(key);
  $('statusUrl').textContent = status?.text || '';
}

async function renderExcludeButton() {
  const btn = $('excludeBtn');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = null;
  try {
    const u = new URL(tab.url);
    if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname.replace(/^www\./, '');
  } catch { /* not a normal page */ }

  btn.dataset.host = host || '';
  if (!host) { btn.disabled = true; return; }
  if (isExcluded(tab.url, settings.excluded)) {
    btn.disabled = true;
    btn.textContent = t('btnAlreadyExcluded');
  }
}

async function init() {
  settings = await getSettings();
  $('enabled').checked = settings.enabled;
  $('incognito').checked = settings.incognito;
  $('showDate').checked = settings.showDate;
  $('delay').value = settings.delay;
  const { custom } = await getState();
  if (custom?.active) $('customText').value = custom.text;

  await renderStatus();
  await renderExcludeButton();
}

async function update(patch) {
  settings = { ...(await getSettings()), ...patch };
  await saveSettings(settings);
}

$('enabled').addEventListener('change', (e) => update({ enabled: e.target.checked }));
$('incognito').addEventListener('change', (e) => update({ incognito: e.target.checked }));
$('showDate').addEventListener('change', (e) => update({ showDate: e.target.checked }));
$('delay').addEventListener('change', (e) => {
  const v = Math.min(10000, Math.max(0, parseInt(e.target.value, 10) || 0));
  e.target.value = v;
  update({ delay: v });
});

$('excludeBtn').addEventListener('click', async () => {
  const host = $('excludeBtn').dataset.host;
  if (!host) return;
  const s = await getSettings();
  if (!s.excluded.includes(host)) s.excluded.push(host);
  await saveSettings(s);
  settings = s;
  $('excludeBtn').disabled = true;
  $('excludeBtn').textContent = t('btnAlreadyExcluded');
});

$('clearBtn').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'clear' }));

$('customOn').addEventListener('click', () => {
  const text = $('customText').value.trim();
  if (text) chrome.runtime.sendMessage({ type: 'customOn', text });
});
$('customOff').addEventListener('click', () => {
  $('customText').value = '';
  chrome.runtime.sendMessage({ type: 'customOff' });
});

$('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes) => { if (changes.state) renderStatus(); });

init();
