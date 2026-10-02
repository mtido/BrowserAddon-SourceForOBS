import { getSettings, saveSettings, formatDate, composeText, t } from '../src/common.js';
import { localize } from '../src/i18n.js';
import { loadFavicon, renderOverlay } from '../src/render.js';

const $ = (id) => document.getElementById(id);
localize();

let s;
let saveTimer;
let previewUrl;

const BOOLS = ['eraseHistory', 'hideDownloadUi', 'showFavicon', 'stripScheme', 'stripTracking', 'excludeLocal'];
const NUMS = ['maxLength'];
const STYLE_NUM = ['fontSize', 'outlineWidth'];
const STYLE_TXT = ['fontFamily', 'color', 'outlineColor'];

function toast() {
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 900);
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveSettings(s);
    toast();
  }, 300);
  renderPreview();
}

async function renderPreview() {
  const demo = composeText('youtube.com/watch?v=dQw4w9WgXcQ', new Date(), { ...s, showDate: true });
  const favicon = s.showFavicon ? await loadFavicon('https://www.youtube.com/') : null;
  const blob = await renderOverlay({ text: demo, favicon, style: s.style });
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  $('preview').src = previewUrl;
}

function bindFields() {
  $('folder').value = s.folder;
  $('folder').addEventListener('input', (e) => { s.folder = e.target.value; queueSave(); });

  for (const k of BOOLS) {
    $(k).checked = !!s[k];
    $(k).addEventListener('change', (e) => { s[k] = e.target.checked; queueSave(); });
  }
  for (const k of NUMS) {
    $(k).value = s[k];
    $(k).addEventListener('input', (e) => { s[k] = parseInt(e.target.value, 10) || 0; queueSave(); });
  }

  $('bold').checked = !!s.style.bold;
  $('bold').addEventListener('change', (e) => { s.style.bold = e.target.checked; queueSave(); });
  for (const k of STYLE_NUM) {
    $(k).value = s.style[k];
    $(k).addEventListener('input', (e) => { s.style[k] = parseInt(e.target.value, 10) || 0; queueSave(); });
  }
  for (const k of STYLE_TXT) {
    $(k).value = s.style[k];
    $(k).addEventListener('input', (e) => { s.style[k] = e.target.value; queueSave(); });
  }

  $('dateFormat').value = s.dateFormat;
  $('dateFormat').addEventListener('change', (e) => { s.dateFormat = e.target.value; queueSave(); });

  // date format labels with today's date as example
  const now = new Date();
  for (const opt of $('dateFormat').options) {
    opt.textContent = `${t('date_' + opt.value)} – ${formatDate(now, opt.value)}`;
  }
}

function renderExcluded() {
  const ul = $('excludeList');
  ul.textContent = '';
  for (const [i, p] of s.excluded.entries()) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = p;
    const btn = document.createElement('button');
    btn.textContent = t('btnRemove');
    btn.addEventListener('click', () => {
      s.excluded.splice(i, 1);
      renderExcluded();
      queueSave();
    });
    li.append(span, btn);
    ul.append(li);
  }
}

function addExcluded() {
  const v = $('excludeInput').value.trim();
  if (!v) return;
  if (!s.excluded.includes(v)) s.excluded.push(v);
  $('excludeInput').value = '';
  renderExcluded();
  queueSave();
}

function renderRules() {
  const body = $('ruleBody');
  body.textContent = '';
  for (const [i, r] of s.rules.entries()) {
    const tr = document.createElement('tr');
    for (const key of ['host', 'segments', 'params']) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = r[key] ?? '';
      input.addEventListener('input', () => { r[key] = input.value; queueSave(); });
      td.append(input);
      tr.append(td);
    }
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.title = t('btnRemove');
    btn.addEventListener('click', () => {
      s.rules.splice(i, 1);
      renderRules();
      queueSave();
    });
    td.append(btn);
    tr.append(td);
    body.append(tr);
  }
}

async function init() {
  s = await getSettings();
  bindFields();
  renderExcluded();
  renderRules();
  $('excludeAdd').addEventListener('click', addExcluded);
  $('excludeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addExcluded(); });
  $('ruleAdd').addEventListener('click', () => {
    s.rules.push({ host: '', segments: '', params: '' });
    renderRules();
  });
  renderPreview();
}

init();
