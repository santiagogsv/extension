const b = globalThis.browser ?? globalThis.chrome;

const TYPE_UI = [
  { id: "script", label: "Script" },
  { id: "sub_frame", label: "Frame" },
  { id: "image", label: "Image" },
  { id: "stylesheet", label: "CSS" },
  { id: "font", label: "Font" },
  { id: "media", label: "Media" },
  { id: "xmlhttprequest", label: "XHR" },
  { id: "websocket", label: "WS" },
  { id: "ping", label: "Ping" },
];

const DEFAULT_TYPE_MODES = { script: "block-all" };
const MODES = ["block-all", "block-external", "allow"];

const $ = (id) => document.getElementById(id);

const hostOf = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const h = u.hostname.replace(/^www\./i, "").toLowerCase();
    return h || null;
  } catch {
    return null;
  }
};

function showErr(msg) {
  const el = $("err");
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
}

function pokeBackground() {
  try {
    const p = b.runtime.sendMessage({ type: "sync" });
    if (p && typeof p.then === "function") p.catch(() => {});
  } catch {
    /* asleep */
  }
}

function lightHtml(kind) {
  // kind: "def" | "site"
  const lamps =
    kind === "site"
      ? [
          ["block-all", "red", "Block all"],
          ["block-external", "yellow", "Block external"],
          ["allow", "green", "Allow"],
          ["inherit", "gray", "Inherit default"],
        ]
      : [
          ["block-all", "red", "Block all"],
          ["block-external", "yellow", "Block external"],
          ["allow", "green", "Allow"],
        ];
  return `<div class="light" data-kind="${kind}">${lamps
    .map(
      ([m, c, title]) =>
        `<button type="button" class="lamp ${c}" data-m="${m}" title="${title}"></button>`
    )
    .join("")}</div>`;
}

function paintLight(el, mode) {
  if (!el) return;
  for (const btn of el.querySelectorAll(".lamp")) {
    btn.classList.toggle("on", btn.dataset.m === mode);
  }
}

function defMode(typeModes, type) {
  return MODES.includes(typeModes[type]) ? typeModes[type] : "allow";
}

function siteMode(siteRow, type) {
  const m = siteRow?.[type];
  return MODES.includes(m) ? m : "inherit";
}

/** Migrate legacy flat modes if needed (same logic as background). */
function migrate(raw) {
  if (raw.typeModes && typeof raw.typeModes === "object") {
    return {
      typeModes: { ...raw.typeModes },
      siteTypeModes: raw.siteTypeModes && typeof raw.siteTypeModes === "object" ? { ...raw.siteTypeModes } : {},
    };
  }
  const types = Array.isArray(raw.resourceTypes) ? raw.resourceTypes : ["script"];
  const dm = MODES.includes(raw.defaultMode) ? raw.defaultMode : "block-all";
  const typeModes = {};
  for (const t of TYPE_UI) typeModes[t.id] = types.includes(t.id) ? dm : "allow";
  const siteTypeModes = {};
  const sites = raw.siteModes && typeof raw.siteModes === "object" ? raw.siteModes : {};
  for (const host of Object.keys(sites)) {
    const mode = sites[host];
    if (!MODES.includes(mode)) continue;
    const h = host.replace(/^www\./i, "").toLowerCase();
    const row = {};
    for (const t of types) row[t] = mode;
    siteTypeModes[h] = row;
  }
  return { typeModes, siteTypeModes };
}

async function main() {
  const rows = $("rows");
  const hostEl = $("host");

  let tab = null;
  try {
    const tabs = await b.tabs.query({ active: true, currentWindow: true });
    tab = tabs?.[0] || null;
  } catch (e) {
    showErr("tabs: " + (e?.message || e));
  }
  const host = tab ? hostOf(tab.url || "") : null;
  hostEl.textContent = host ? host : "This site: n/a";

  let typeModes = { ...DEFAULT_TYPE_MODES };
  let siteTypeModes = {};
  try {
    const raw = await b.storage.local.get(null);
    const m = migrate(raw);
    typeModes = { ...DEFAULT_TYPE_MODES, ...m.typeModes };
    siteTypeModes = m.siteTypeModes;
  } catch (e) {
    showErr("storage: " + (e?.message || e));
  }

  const siteRow = () => (host && siteTypeModes[host]) || {};

  // Build rows
  rows.replaceChildren();
  for (const { id, label } of TYPE_UI) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.type = id;
    row.innerHTML = `
      <span class="lab" title="${id}">${label}</span>
      ${lightHtml("def")}
      ${lightHtml("site")}
    `;
    rows.appendChild(row);
  }

  const refresh = () => {
    for (const row of rows.querySelectorAll(".row")) {
      const type = row.dataset.type;
      const def = row.querySelector('.light[data-kind="def"]');
      const site = row.querySelector('.light[data-kind="site"]');
      paintLight(def, defMode(typeModes, type));
      paintLight(site, host ? siteMode(siteRow(), type) : null);
      if (!host) {
        for (const btn of site.querySelectorAll(".lamp")) btn.disabled = true;
      }
    }
  };
  refresh();

  let busy = false;

  const save = async () => {
    if (busy) return;
    busy = true;
    showErr("");
    refresh();
    try {
      await b.storage.local.set({ typeModes, siteTypeModes });
      pokeBackground();
      if (tab?.id != null && /^https?:/.test(tab.url || "")) {
        try {
          const p = b.tabs.reload(tab.id);
          if (p && typeof p.then === "function") p.catch(() => {});
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      showErr(String(e?.message || e));
    } finally {
      busy = false;
    }
  };

  rows.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".lamp");
    if (!btn || btn.disabled) return;
    const light = btn.closest(".light");
    const row = btn.closest(".row");
    const type = row?.dataset?.type;
    const m = btn.dataset.m;
    if (!type || !m || !light) return;
    e.preventDefault();

    if (light.dataset.kind === "def") {
      if (!MODES.includes(m)) return;
      typeModes = { ...typeModes, [type]: m };
    } else {
      if (!host) return;
      const next = { ...(siteTypeModes[host] || {}) };
      if (m === "inherit") delete next[type];
      else if (MODES.includes(m)) next[type] = m;
      else return;
      siteTypeModes = { ...siteTypeModes };
      if (Object.keys(next).length) siteTypeModes[host] = next;
      else delete siteTypeModes[host];
    }
    save();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    main().catch((e) => showErr(String(e?.message || e)));
  });
} else {
  main().catch((e) => showErr(String(e?.message || e)));
}
