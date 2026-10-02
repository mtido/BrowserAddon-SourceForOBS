// Shared helpers: defaults, settings/state storage, exclusion matching, URL reduction.

export const DEFAULTS = {
  enabled: true,
  incognito: false,
  delay: 800,
  folder: 'StreamSourceURL',
  showFavicon: true,
  showDate: false,
  dateFormat: 'iso', // iso | dmy | mdy
  stripScheme: true,
  stripTracking: true,
  excludeLocal: true,
  maxLength: 80,
  eraseHistory: true,
  hideDownloadUi: false,
  style: {
    fontSize: 32,
    fontFamily: 'Arial, Helvetica, sans-serif',
    bold: true,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 5
  },
  excluded: [
    '*ebanking*',
    '*e-banking*',
    '*onlinebanking*',
    '*netbanking*',
    '*banking.*',
    'paypal.com',
    'accounts.google.com',
    'login.microsoftonline.com',
    '1password.com',
    'bitwarden.com',
    'lastpass.com'
  ],
  // Per-site URL reduction. segments: keep first N path segments (blank = all).
  // params: comma list of query params to keep, "*" = keep all, blank = remove all.
  rules: [
    { host: 'youtube.com', segments: '', params: 'v' },
    { host: 'youtu.be', segments: '', params: '' },
    { host: 'tiktok.com', segments: '1', params: '' }
  ]
};

export function mergeSettings(stored) {
  const s = { ...structuredClone(DEFAULTS), ...(stored || {}) };
  s.style = { ...DEFAULTS.style, ...((stored && stored.style) || {}) };
  if (!Array.isArray(s.excluded)) s.excluded = [...DEFAULTS.excluded];
  if (!Array.isArray(s.rules)) s.rules = structuredClone(DEFAULTS.rules);
  return s;
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return mergeSettings(settings);
}

export async function saveSettings(s) {
  await chrome.storage.local.set({ settings: s });
}

export async function getState() {
  const { state } = await chrome.storage.local.get('state');
  return state || {};
}

export async function patchState(patch) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

export const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

export function sanitizeFolder(f) {
  const parts = String(f || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.replace(/[<>:"|?*\x00-\x1f]/g, '').trim())
    .filter((p) => p && p !== '.' && p !== '..');
  return parts.join('/') || DEFAULTS.folder;
}

// ---------- pattern matching ----------

function normPattern(p) {
  p = String(p || '').trim().toLowerCase();
  if (!p || p.startsWith('#')) return '';
  p = p.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/\/+$/, '');
  return p;
}

function globBody(p) {
  return p
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
}

// Host pattern: "bank.ch" matches bank.ch and all subdomains; "*" is a wildcard.
export function hostMatches(host, pattern) {
  const p = normPattern(pattern);
  if (!p || p.includes('/')) return false;
  return new RegExp('^(?:.*\\.)?' + globBody(p) + '$').test(host.toLowerCase());
}

// Returns the matching pattern or null.
export function isExcluded(urlStr, patterns) {
  let u;
  try { u = new URL(urlStr); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const hostPath = host + u.pathname.replace(/\/+$/, '');
  for (const raw of patterns || []) {
    const p = normPattern(raw);
    if (!p) continue;
    if (p.includes('/')) {
      const re = new RegExp('^(?:.*\\.)?' + globBody(p) + (p.endsWith('*') ? '' : '(?:/.*)?') + '$');
      if (re.test(hostPath)) return raw;
    } else if (hostMatches(host, p)) {
      return raw;
    }
  }
  return null;
}

export function isLocalHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || /\.(localhost|local|lan|internal)$/.test(h) || h.endsWith('.home.arpa')) return true;
  if (h.includes(':')) return h === '::1' || /^f[cd]/.test(h) || /^fe80/.test(h);
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  return !h.includes('.'); // single-label intranet names
}

// ---------- URL reduction / display ----------

const TRACKING = /^(utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|igshid|mc_cid|mc_eid|yclid|si|_ga)$/i;

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

export function reduceUrl(urlStr, s) {
  const u = new URL(urlStr);
  const host = u.hostname.toLowerCase();
  const bareHost = host.replace(/^www\./, '');
  const rule = (s.rules || []).find((r) => r && r.host && hostMatches(bareHost, r.host));

  let segs = u.pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(u.search);
  let keepHash = !s.stripTracking;

  if (rule) {
    const n = parseInt(rule.segments, 10);
    if (n > 0) segs = segs.slice(0, n);
    const spec = String(rule.params || '').trim();
    if (spec !== '*') {
      const keep = new Set(spec.split(',').map((x) => x.trim()).filter(Boolean));
      for (const k of [...new Set(params.keys())]) if (!keep.has(k)) params.delete(k);
    }
    keepHash = false;
  } else if (s.stripTracking) {
    for (const k of [...new Set(params.keys())]) if (TRACKING.test(k)) params.delete(k);
  }

  let out = s.stripScheme ? bareHost : u.protocol + '//' + host;
  if (u.port) out += ':' + u.port;
  if (segs.length) out += '/' + segs.map(safeDecode).join('/');
  const q = params.toString();
  if (q) out += '?' + q;
  if (keepHash && u.hash) out += u.hash;

  const max = parseInt(s.maxLength, 10);
  if (max > 0 && out.length > max) out = out.slice(0, max - 1) + '…';
  return out;
}

export function formatDate(d, fmt) {
  const p = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear(), m = p(d.getMonth() + 1), day = p(d.getDate());
  if (fmt === 'dmy') return `${day}.${m}.${y}`;
  if (fmt === 'mdy') return `${m}/${day}/${y}`;
  return `${y}-${m}-${day}`;
}

export function composeText(display, date, s) {
  return s.showDate ? `${display} (${formatDate(date, s.dateFormat)})` : display;
}
