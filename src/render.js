// Rendering: overlay PNG, status icons, favicon loading. Works in service worker and pages.

export async function loadFavicon(pageUrl) {
  try {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', '64');
    const r = await fetch(u.toString());
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob());
  } catch {
    return null;
  }
}

export async function renderOverlay({ text, favicon, style }) {
  const fs = Math.max(8, Number(style.fontSize) || 32);
  const ow = Math.max(0, Number(style.outlineWidth) || 0);
  const font = `${style.bold ? 'bold ' : ''}${fs}px ${style.fontFamily || 'sans-serif'}`;

  const m = new OffscreenCanvas(1, 1).getContext('2d');
  m.font = font;
  const tw = Math.ceil(m.measureText(text).width);

  const pad = Math.ceil(ow / 2) + 4;
  const icon = favicon ? Math.round(fs * 1.25) : 0;
  const gap = favicon ? Math.round(fs * 0.4) : 0;
  const h = Math.ceil(Math.max(fs * 1.4, icon)) + pad * 2;
  const w = pad * 2 + icon + gap + tw;

  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);

  let x = pad;
  if (favicon) {
    g.save();
    g.imageSmoothingQuality = 'high';
    g.shadowColor = style.outlineColor;
    g.shadowBlur = Math.min(ow * 1.5, 8);
    g.drawImage(favicon, x, (h - icon) / 2, icon, icon);
    g.restore();
    x += icon + gap;
  }

  g.font = font;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  if (ow > 0) {
    g.lineWidth = ow;
    g.strokeStyle = style.outlineColor;
    g.strokeText(text, x, h / 2);
  }
  g.fillStyle = style.color;
  g.fillText(text, x, h / 2);

  return c.convertToBlob({ type: 'image/png' });
}

export async function transparentPng() {
  return new OffscreenCanvas(1, 1).convertToBlob({ type: 'image/png' });
}

export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + btoa(bin);
}

const COLORS = {
  active: '#22c55e',
  off: '#9ca3af',
  excluded: '#ef4444',
  custom: '#3b82f6',
  cleared: '#f59e0b'
};

export function drawIcon(kind, size) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  g.fillStyle = COLORS[kind] || COLORS.off;
  g.beginPath();
  g.arc(r, r, r * 0.94, 0, Math.PI * 2);
  g.fill();

  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineWidth = size * 0.12;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const p = (v) => v * size;

  switch (kind) {
    case 'active': // check mark
      g.beginPath();
      g.moveTo(p(0.27), p(0.52));
      g.lineTo(p(0.44), p(0.68));
      g.lineTo(p(0.74), p(0.34));
      g.stroke();
      break;
    case 'excluded': // bar
      g.beginPath();
      g.moveTo(p(0.26), p(0.5));
      g.lineTo(p(0.74), p(0.5));
      g.stroke();
      break;
    case 'custom': // "T"
      g.beginPath();
      g.moveTo(p(0.28), p(0.3));
      g.lineTo(p(0.72), p(0.3));
      g.moveTo(p(0.5), p(0.3));
      g.lineTo(p(0.5), p(0.74));
      g.stroke();
      break;
    case 'cleared': // ring
      g.beginPath();
      g.arc(r, r, size * 0.2, 0, Math.PI * 2);
      g.stroke();
      break;
    default: // pause bars
      g.fillRect(p(0.32), p(0.28), p(0.13), p(0.44));
      g.fillRect(p(0.55), p(0.28), p(0.13), p(0.44));
  }
  return g.getImageData(0, 0, size, size);
}
