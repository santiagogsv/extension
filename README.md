# Script Traffic Light

Minimal browser extension: control **network scripts** with a two-light popup.

| Light | Modes |
|-------|--------|
| **Default** | 🔴 block all · 🟡 block external · 🟢 allow all |
| **This site** | same + ⚪ inherit default |

External = third-party origin (`domainType: "thirdParty"`). Hostnames strip `www.`. Inline/`eval` are not blocked.

## Principles

- **Private** — no network, telemetry, or remote config; `storage.local` only  
- **Small** — few static files, no bundler or frameworks  
- **Native blocking** — [declarativeNetRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest) (DNR), not per-request JS  
- **Standards** — Manifest V3 WebExtensions; `browser` with `chrome` fallback  
- **Firefox-first** — also loads on modern Chrome and Safari (best-effort)

## Install

| Browser | |
|---------|--|
| **Firefox** | `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json` |
| **Chrome** | `chrome://extensions` → Developer mode → Load unpacked → this folder |
| **Safari** | Convert with Xcode (`safari-web-extension-converter`), then run/sign |

Grant host access if scripts are not blocked after install.

## Test

```bash
cd fixture && python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/` and switch modes. Use DevTools → Network → JS to confirm.

## Layout

```
manifest.json   MV3 + DNR + dual background (service_worker + scripts)
background.js   storage → dynamic DNR rules
popup.html/js   UI
fixture/        manual test page
```

See `AGENTS.md` for design detail and roadmap.
