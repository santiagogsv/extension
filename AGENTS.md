# Script Traffic Light

Extremely minimal **Firefox-first** WebExtension for controlling **network** script loads: **block all**, **block external only**, or **allow all**. Defaults plus per-site overrides. Private by design (no network, no telemetry, local storage only). Prefer standard WebExtensions APIs — especially **declarativeNetRequest (DNR)** — and the smallest possible codebase.

**Cross-browser (slim, one source tree):** same package loads on modern **Firefox**, **Chrome** (MV3 service worker), and **Safari** (Web Extensions + DNR). API access via `globalThis.browser ?? globalThis.chrome`. Manifest declares both `background.service_worker` and `background.scripts` (+ `persistent: false`). Packaging via `./package.sh` → `dist/` (Chrome zip, Firefox zip, Safari Xcode project) — same pattern as host-block.

---

## Description

### What it does

| Mode | Color | Behavior |
|------|--------|----------|
| Block all | 🔴 Red | All network script requests blocked |
| Block external | 🟡 Yellow | Third-party (cross-origin) scripts blocked; first-party allowed |
| Allow all | 🟢 Green | No script blocking |
| Inherit (site only) | ⚪ Gray | No per-site override; use default |

**Scope:** network scripts only (`resourceTypes: ["script"]`). Inline scripts and `eval` are **not** controlled in v1.

**Popup UI:** two traffic-light controls side by side:

1. **Default** — three lamps (R/Y/G); global fallback  
2. **This site** — four states (R/Y/G + gray inherit) for the current tab hostname  

Changing either control **persists immediately** and **auto-reloads** the active tab so the new policy applies.

### Non-goals (keep it small)

- No filter lists, no element picker, no cosmetic filtering  
- No CSP / inline / `eval` blocking (v1)  
- No cloud sync, accounts, or remote config  
- No analytics, crash reports, or extension-originated network  
- No complex options page (popup only)  
- No separate per-browser codebases or polyfill packages (one slim package)  
- No bundler/framework; packaging is zip + Safari packager only (`package.sh`)

### Privacy & security principles

- **Permissions:** only what DNR + storage + active tab URL need  
- **Storage:** `browser.storage.local` only; never leaves the machine  
- **No remote code,** no CDNs in the extension UI, no `eval`  
- **Blocking via DNR** (browser-native rule engine) — no per-request JS decision path in the hot path after rules are installed  
- Extension pages are static HTML/JS/CSS shipped in the package  

---

## Decisions (locked)

| Topic | Decision | Date |
|-------|----------|------|
| First-run default | **`block-all`** (red) | 2026-07-08 |
| Site “use default” | **Fourth gray / inherit** — deletes `siteModes[host]` | 2026-07-08 |
| Blocking depth | **Network scripts only** (no CSP / inline) | 2026-07-08 |
| Mechanism | **`declarativeNetRequest` (DNR)** for efficiency | 2026-07-08 |
| Reload on change | **Auto-reload** active tab after mode change | 2026-07-08 |
| “External” definition | **Different origin** → DNR `domainType: "thirdParty"` | 2026-07-08 |
| Hostname key | **Strip `www.`** (case-insensitive); store/match `example.com` | 2026-07-08 |
| Extension name / id | **Script Traffic Light** / `script-traffic-light@local` | 2026-07-08 |
| Cross-browser | **One source tree**; dual background + `browser??chrome`; `package.sh` for Chrome/Firefox/Safari | 2026-07-10 |

---

## Plan

### 1. Product model

```
effectiveMode(host) = siteModes[host] ?? defaultMode
```

- `defaultMode`: `"block-all" | "block-external" | "allow"`  
- `siteModes`: `{ [hostname: string]: "block-all" | "block-external" | "allow" }`  
- Site UI gray = key absent (inherit)

**Hostname keying:** `new URL(tab.url).hostname`, then strip a leading `www.` (e.g. `www.example.com` → `example.com`). DNR `initiatorDomains` includes both bare and `www.` forms. No path rules. Skip non-http(s) tabs in the site control (disable site light).

### 2. Blocking mechanism — DNR (core)

Use **Manifest V3** + **dynamic DNR rules**. On every settings change (and on startup):

1. Read `defaultMode` + `siteModes` from `storage.local`  
2. Diff/rebuild dynamic rules via `declarativeNetRequest.updateDynamicRules`  
3. No `webRequest` listeners — the browser applies rules natively  

#### Rule strategy (minimal, priority-based)

| Priority | Purpose |
|----------|---------|
| 1 | Default policy (global) |
| 10 | Per-site overrides (`initiatorDomains: [host]`) |

**Default rules**

| `defaultMode` | Dynamic rule(s) |
|---------------|-----------------|
| `block-all` | `block` + `resourceTypes: ["script"]` |
| `block-external` | `block` + `resourceTypes: ["script"]` + `domainType: "thirdParty"` |
| `allow` | *(no default block rules)* |

**Per-site override rules** (higher priority). For each `host` in `siteModes`:

| Site mode | Rules (initiator = host) |
|-----------|---------------------------|
| `allow` | `allow` all `script` with `initiatorDomains: [host]` |
| `block-all` | `block` all `script` with `initiatorDomains: [host]` |
| `block-external` | `block` `script` + `initiatorDomains: [host]` + `domainType: "thirdParty"`; if default is `block-all`, also `allow` first-party scripts for that initiator |

**Rule IDs:** reserve ranges, e.g. `1` default, `1000+` per site (stable hash or enumerate sorted hosts). Simplest v1: clear all dynamic rules and re-add from state each sync (few rules expected).

**Note on `domainType`:** Firefox/Chrome treat first-party vs third-party relative to the initiator — matches “different origin” for typical script loads without hand-rolled URL parsing in the request path.

### 3. Extension layout (target: tiny)

```
extension/
  AGENTS.md           # this file
  manifest.json       # MV3, Gecko id, dual background, DNR + storage + tabs
  background.js       # storage → DNR rule sync
  popup.html          # markup + inline CSS
  popup.js            # two lights, persist, reload
  package.sh          # Chrome / Firefox / Safari → dist/
  icons/              # toolbar + store icons
  fixture/            # manual test page
```

**Size goal:** ~200 lines app code total (no bundler/frameworks). CSS inlined in `popup.html`.

### 4. `manifest.json` (sketch)

```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "background.js",
    "scripts": ["background.js"]
  },
  "browser_specific_settings": {
    "gecko": { "id": "script-traffic-light@local", "strict_min_version": "128.0" }
  },
  "minimum_chrome_version": "121",
  "permissions": ["storage", "declarativeNetRequest", "tabs"],
  "host_permissions": ["<all_urls>"],
  "action": { "default_popup": "popup.html" }
}
```

JS uses `const b = globalThis.browser ?? globalThis.chrome` (no polyfill package).

**Permission notes:**

- `host_permissions: <all_urls>` required for DNR to apply to general web traffic  
- `declarativeNetRequest` — no `webRequest` / `webRequestBlocking`  
- `tabs` — popup needs hostname + `tabs.reload`  
- No cookies, history, identity, nativeMessaging, feedback APIs  

Adjust `strict_min_version` after a quick check of stable DNR + MV3 support used in implementation.

### 5. Background logic (sketch)

```text
DEFAULT = "block-all"

onInstalled / onStartup / storage.onChanged:
  state = await storage.local.get({ defaultMode: DEFAULT, siteModes: {} })
  rules = buildRules(state)
  existing = await dnr.getDynamicRules()
  updateDynamicRules({
    removeRuleIds: existing.map(r => r.id),
    addRules: rules
  })

buildRules(state):
  rules = []
  append default rule(s) at priority 1
  for each host, mode in siteModes:
    append override rule(s) at priority 10
  return rules
```

Keep `buildRules` pure and short — easiest part to test mentally.

### 6. Popup UI

```
┌──────────────────────────────────────┐
│   Default            This site       │
│  🔴 🟡 🟢            🔴 🟡 🟢 ⚪     │
│  block all           inherit / …     │
│                   www.example.com    │
└──────────────────────────────────────┘
```

**Interaction:**

- **Default:** click R / Y / G → set `defaultMode` → sync DNR → `tabs.reload` active tab  
- **Site:** click R / Y / G → set `siteModes[host]` → sync → reload  
- **Site gray:** click inherit → `delete siteModes[host]` → sync → reload  
- Non-http(s) tab: disable site control; still allow editing default  

**Visual:** classic traffic light (column of lamps) or horizontal dots; active lamp bright + outline; inherit gray only on site control. Pure CSS. No frameworks.

### 7. Defaults & first run

- `defaultMode = "block-all"`  
- `siteModes = {}`  
- Install handler writes defaults if missing, then installs DNR rules  

### 8. Testing plan

1. Load temporary add-on via `about:debugging`  
2. Fixture page: first-party `<script src>`, third-party script URL, inline script (inline should still run — document that)  
3. Default red → no network scripts  
4. Default yellow → first-party scripts run, third-party blocked  
5. Default green → all network scripts run  
6. Site override ≠ default; other hosts unchanged  
7. Site gray → back to default behavior  
8. Mode change auto-reloads tab  
9. Extension storage only in profile; no extension network requests  

### 9. Distribution (later)

- Sideload / temporary install first  
- Optional AMO later; privacy: no data collection  

---

## Roadmap

### Phase 0 — Spec freeze

- [x] Description, plan, roadmap in `AGENTS.md`  
- [x] Lock decisions (default, inherit UX, DNR, auto-reload, origin = thirdParty, strip www.)  
- [x] Firefox min version set to **128** (MV3 + DNR); adjust if testing shows otherwise  

### Phase 1 — Skeleton (MVP)

- [x] `manifest.json` (MV3 + Gecko + DNR permissions)  
- [x] `background.js`: storage defaults + `buildRules` + `syncRules`  
- [x] `popup.html` / `popup.js` / `popup.css`: default (3) + site (3+inherit) lights  
- [x] Auto-reload active tab on change  
- [x] Fixture page under `fixture/` (manual test via `about:debugging`)  

### Phase 2 — UX polish (still minimal)

- [ ] Hostname label under site light  
- [ ] Disable site control on `about:`, `moz-extension:`, etc.  
- [ ] Optional toolbar badge color = **effective** mode for current tab  

### Phase 3 — Hardening

- [ ] Workers / module scripts behavior under DNR `script` type (document + fix if needed)  
- [ ] Many site overrides: rule ID scheme + DNR rule count limits  
- [ ] Safe behavior when `updateDynamicRules` fails (log once, don’t throw loops)  
- [ ] Final permission review  

### Phase 4 — Cross-browser packaging

- [x] Dual background (`service_worker` + `scripts` + `persistent: false`)  
- [x] `browser ?? chrome`; DNR sync hardened for empty rule sets / Safari  
- [x] `package.sh` → Chrome zip, Firefox zip, Safari Xcode (`dist/`)  
- [x] `.gitignore` / `.signing.example`; README install + publish docs  

### Phase 5 — Optional extras

- [ ] Keyboard accessibility in popup  
- [ ] Export/import JSON (user-triggered only)  
- [ ] Session-only temporary allow (not persisted)  
- [ ] Toolbar badge color = **effective** mode for current tab  

### Out of scope indefinitely (unless goals change)

- CSP / inline / `eval` blocking  
- Ad-block filter lists  
- Per-path or per-URL script rules  
- Remote rules  
- Separate per-browser codebases or polyfill packages

---

## Implementation order (when coding starts)

1. Manifest (MV3) + background that installs a global “block all scripts” DNR rule  
2. Storage helpers + `buildRules` / `syncRules` for all three default modes  
3. Per-site override rules  
4. Popup: two lights + inherit + persist + auto-reload  
5. Fixture page + QA matrix  
6. Badge / polish only if still tiny  

---

## Security review checklist

- [ ] No third-party scripts or fonts in extension pages  
- [ ] No message listeners that accept arbitrary code  
- [ ] Hostnames only via `URL` parser; no string-sliced origins  
- [ ] Privileged / non-http(s) URLs don’t break background or popup  
- [ ] Settings never leave `storage.local` unless user exports  
- [ ] No `declarativeNetRequestFeedback` unless debugging (avoid extra surfaces)  

---

## Agent notes

- Optimize for **clarity and line count**, not features.  
- Prefer DNR dynamic rules rebuilt from state over imperative blocking.  
- Do not add a bundler, TypeScript, or UI framework unless explicitly requested.  
- When in doubt, re-read **Non-goals** and cut scope.  
- Update this file when roadmap items complete or decisions change.  
