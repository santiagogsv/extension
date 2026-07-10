# Script Traffic Light

Minimal **Manifest V3** network resource controller via **declarativeNetRequest**.

Each resource type has **two** horizontal traffic lights:

| Column | Modes |
|--------|--------|
| **Default** | 🔴 block all · 🟡 third-party only · 🟢 allow |
| **This site** | same + ⚪ inherit default |

| Type chip | DNR `resourceTypes` |
|-----------|---------------------|
| Script, Frame, Image, CSS, Font, Media, XHR, WS, Ping | `script`, `sub_frame`, `image`, `stylesheet`, `font`, `media`, `xmlhttprequest`, `websocket`, `ping` |

First-run default: **Script 🔴**, all other types 🟢.  
External = third-party origin. Hostnames strip `www.`.  
Inline/`eval` and full navigations (`main_frame`) are not blocked.

- One source tree for **Firefox**, **Chrome**, and **Safari**
- Dual background: `service_worker` (Chrome) + `scripts` (Firefox)
- API via `browser ?? chrome` — no polyfill package
- Private: no network, telemetry, or remote config; `storage.local` only

### Safari notes

- **🔴 block all** installs a global “block every network script” DNR rule. On Safari this often breaks **other ad blockers** (they inject scripts) and can break **Web Inspector**. Prefer **🟡 block external** if you use another blocker, or turn this extension off while debugging.
- Settings sync via `storage` (popup stays responsive even if the background is slow). Reload the extension after updating files.
- Grant the extension access for the sites you care about (Safari → extension settings).

## Dev install

| Browser | Steps |
|---------|--------|
| **Firefox** | `about:debugging` → *This Firefox* → *Load Temporary Add-on* → `manifest.json` |
| **Chrome / Edge** | `chrome://extensions` → *Developer mode* → *Load unpacked* → this folder |
| **Safari 17+ / 27** | Settings → Advanced → *Show features for web developers* → Developer → *Add Temporary Extension…* → this folder (allow unsigned if prompted) |

Grant host access if scripts are not blocked after install (Chrome optional host permissions; Safari: enable the extension for sites you care about).

## Test

```bash
cd fixture && python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/` and switch modes. Use DevTools → Network → JS to confirm.

| Mode | Inline | First-party `first.js` | CDN jQuery |
|------|--------|------------------------|------------|
| 🔴 block all | runs | blocked | blocked |
| 🟡 block external | runs | runs | blocked |
| 🟢 allow | runs | runs | runs |

## Package for publish

All artifacts land in **`dist/`** (gitignored — regenerate anytime).

```bash
chmod +x package.sh   # once

./package.sh zip       # dist/script-traffic-light-chrome.zip
./package.sh firefox   # dist/script-traffic-light-firefox.zip
./package.sh safari    # dist/safari/… Xcode project
./package.sh all       # all of the above
./package.sh clean     # remove dist/
```

| Output | Use |
|--------|-----|
| `dist/script-traffic-light-chrome.zip` | Chrome Web Store, Edge Add-ons, sideload |
| `dist/script-traffic-light-firefox.zip` | [Firefox AMO](https://addons.mozilla.org/developers/) |
| `dist/safari/Script Traffic Light/Script Traffic Light.xcodeproj` | Safari App Store / TestFlight / local Run |

### Chrome Web Store / Edge Add-ons

```bash
./package.sh zip
# upload dist/script-traffic-light-chrome.zip
```

### Firefox Add-ons (AMO)

```bash
./package.sh firefox
# upload dist/script-traffic-light-firefox.zip
```

1. https://addons.mozilla.org/developers/ → *Submit a New Add-on*
2. Before listing: use a real `browser_specific_settings.gecko.id` (not `@local`) if required
3. Source is self-contained (no compile step)
4. Privacy: `data_collection_permissions: none` is already set

### Safari (App Store / TestFlight)

```bash
# Optional if Xcode isn’t the active developer dir:
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

./package.sh safari
open "dist/safari/Script Traffic Light/Script Traffic Light.xcodeproj"
```

Resources are **copied** into the Xcode project (only manifest/JS/HTML/icons). Re-run `./package.sh safari` after web source changes, then rebuild in Xcode.

**Auto-signing** (so you don’t re-pick Team after every package):

```bash
# Option A — one-time local file (gitignored)
cp .signing.example .signing
# edit .signing → DEVELOPMENT_TEAM=YourTeamID

# Option B — environment
export DEVELOPMENT_TEAM=YourTeamID

# Option C — nothing: uses Xcode’s last-selected team if set
./package.sh safari   # prints Signing: DEVELOPMENT_TEAM=…
```

Team ID: Xcode → Settings → Accounts → your team, or  
`defaults read com.apple.dt.Xcode IDEProvisioningTeamManagerLastSelectedTeamID`

1. Open **`dist/safari/...`** (not a top-level `./safari`)
2. Scheme **Script Traffic Light (macOS)** (or iOS) → Run (Team should already be set)
3. Archive → App Store Connect when publishing
4. Safari → Settings → Extensions → enable **Script Traffic Light**

Unsigned/ad-hoc: Safari → **Develop** → *Allow Unsigned Extensions* (resets when Safari quits).

### Version bump

Edit `version` in `manifest.json` before packaging. Xcode app version is separate (`MARKETING_VERSION` / General tab).

## Toolbar icon

Declared in `manifest.json`:

- `icons` — about:addons / management UI
- `action.default_icon` — toolbar button

PNGs live in `icons/` (`16`, `32`, `48`, `96`, `128`). Pin the extension in the toolbar if it only appears in the extensions puzzle menu.

## Layout

```
manifest.json   MV3 + DNR + dual background (service_worker + scripts)
background.js   storage → dynamic DNR rules
popup.html/js   UI
icons/          toolbar + store icons
package.sh      Chrome / Firefox / Safari bundles → dist/
fixture/        manual test page
```

## Privacy

No analytics. No extension-originated network.  
`data_collection_permissions: none`. Blocking is DNR-only — no page access; grey Safari toolbar icon is normal.

See `AGENTS.md` for design detail and roadmap.
