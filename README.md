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

## Toolbar icon

Declared in `manifest.json`:

- `icons` — about:addons / management UI  
- `action.default_icon` — toolbar button  

PNGs live in `icons/` (`16`, `32`, `48`, `96`, `128`). Reload the add-on after changing them. Pin the extension in the toolbar if it only appears in the extensions puzzle menu.

## Publish on Firefox (AMO)

1. Create a [Firefox Add-on Developer](https://addons.mozilla.org/developers/) account (Mozilla account).  
2. Use a **stable** `browser_specific_settings.gecko.id` (already set: `script-traffic-light@local` — change to your own email-style id before shipping, e.g. `script-traffic-light@yourdomain`).  
3. Zip the extension **contents** (not the parent folder name alone — include `manifest.json` at the zip root):

   ```bash
   zip -r script-traffic-light.zip manifest.json background.js popup.html popup.js icons -x '*.DS_Store'
   ```

4. [Submit a new add-on](https://addons.mozilla.org/developers/addon/submit/) → upload the zip.  
5. Choose **On this site** (listed on AMO) or **On your own** (unlisted, still signed).  
6. Fill name, summary, privacy (this add-on collects no data), category, and support contact.  
7. Pass automated + (if needed) manual review; then install from AMO or the signed XPI.

**AMO note:** New extensions must declare  
`browser_specific_settings.gecko.data_collection_permissions`  
(use `"required": ["none"]` when nothing is collected/transmitted — already set in `manifest.json`).

**Notes:** Temporary install via `about:debugging` is only for development. Permanent installs need AMO signing (or enterprise policy). No build step required for this project. Source code is already plain JS — good for review.

## Layout

```
manifest.json   MV3 + DNR + dual background (service_worker + scripts)
background.js   storage → dynamic DNR rules
popup.html/js   UI
icons/          toolbar + store icons
fixture/        manual test page
```

See `AGENTS.md` for design detail and roadmap.
