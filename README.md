# Stream Source URL

Writes the URL of your active tab to two files, overwritten in place (nothing accumulates):

- `current.png` – transparent PNG: favicon + URL (white text, black outline by default)
- `current.txt` – the same text without image

Location: `<Downloads>/StreamSourceURL/` (folder name is configurable).

## Install (Chrome / Brave / Opera)
1. Open `chrome://extensions` (Brave: `brave://extensions`, Opera: `opera://extensions`).
2. Enable developer mode, click "Load unpacked", select this folder.
3. Optional: allow the extension in private windows via its details page, then enable "Also in private windows" in the popup.

## OBS
- Image source -> `Downloads/StreamSourceURL/current.png`
- or Text source (read from file) -> `Downloads/StreamSourceURL/current.txt`

## Browser setting to check
Turn OFF "Ask where to save each file before downloading" in the browser's download settings.

## Add a language
Copy `_locales/en` to `_locales/<code>` (e.g. `fr`) and translate the "message" values.
