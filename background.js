/* storage → DNR — per resource-type modes (default + per-site). */
const b = globalThis.browser ?? globalThis.chrome;
const dnr = b.declarativeNetRequest;

/** Exposed DNR types (no main_frame; no Safari-hostile types). */
const TYPE_CATALOG = [
  "script",
  "sub_frame",
  "image",
  "stylesheet",
  "font",
  "media",
  "xmlhttprequest",
  "websocket",
  "ping",
];
const TYPE_SET = new Set(TYPE_CATALOG);
const MODES = new Set(["block-all", "block-external", "allow"]);

/** First-run: scripts blocked; everything else allowed. */
const DEFAULT_TYPE_MODES = { script: "block-all" };

function sanitizeMode(m, fallback = "allow") {
  return MODES.has(m) ? m : fallback;
}

function sanitizeTypeModes(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const t of TYPE_CATALOG) {
    if (obj[t] != null) out[t] = sanitizeMode(obj[t]);
  }
  return out;
}

function sanitizeSiteMap(map) {
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const host of Object.keys(map)) {
    const h = String(host || "")
      .replace(/^www\./i, "")
      .toLowerCase();
    if (!h) continue;
    const modes = sanitizeTypeModes(map[host]);
    if (Object.keys(modes).length) out[h] = modes;
  }
  return out;
}

/** Migrate v0.1.x storage shape → per-type maps. */
function migrate(raw) {
  if (raw.typeModes && typeof raw.typeModes === "object") {
    return {
      typeModes: sanitizeTypeModes(raw.typeModes),
      siteTypeModes: sanitizeSiteMap(raw.siteTypeModes),
    };
  }
  // Legacy: single defaultMode + resourceTypes chips + siteModes
  const types = Array.isArray(raw.resourceTypes) ? raw.resourceTypes : ["script"];
  const dm = sanitizeMode(raw.defaultMode, "block-all");
  const typeModes = {};
  for (const t of TYPE_CATALOG) {
    typeModes[t] = types.includes(t) ? dm : "allow";
  }
  if (!types.length) typeModes.script = dm;

  const siteTypeModes = {};
  const sites = raw.siteModes && typeof raw.siteModes === "object" ? raw.siteModes : {};
  for (const host of Object.keys(sites)) {
    const mode = sites[host];
    if (!MODES.has(mode)) continue;
    const h = String(host).replace(/^www\./i, "").toLowerCase();
    if (!h) continue;
    const row = {};
    for (const t of types) {
      if (TYPE_SET.has(t)) row[t] = mode;
    }
    if (Object.keys(row).length) siteTypeModes[h] = row;
  }
  return { typeModes, siteTypeModes };
}

function domains(host) {
  const h = String(host || "")
    .replace(/^www\./i, "")
    .toLowerCase();
  return h ? [h, "www." + h] : [];
}

function defMode(typeModes, type) {
  return sanitizeMode(typeModes[type], "allow");
}

function build({ typeModes = {}, siteTypeModes = {} }) {
  const rules = [];
  let id = 1;

  // Defaults — one rule per type that is not fully allow
  for (const type of TYPE_CATALOG) {
    const mode = defMode(typeModes, type);
    if (mode === "block-all") {
      rules.push({
        id: id++,
        priority: 1,
        action: { type: "block" },
        condition: { resourceTypes: [type] },
      });
    } else if (mode === "block-external") {
      rules.push({
        id: id++,
        priority: 1,
        action: { type: "block" },
        condition: { resourceTypes: [type], domainType: "thirdParty" },
      });
    }
  }

  // Per-site overrides (higher priority)
  for (const host of Object.keys(siteTypeModes)) {
    const d = domains(host);
    if (!d.length) continue;
    const row = siteTypeModes[host] || {};
    for (const type of TYPE_CATALOG) {
      const mode = row[type];
      if (!mode || !MODES.has(mode)) continue; // inherit
      const base = {
        priority: 10,
        condition: { resourceTypes: [type], initiatorDomains: d },
      };
      if (mode === "allow") {
        rules.push({ id: id++, ...base, action: { type: "allow" } });
      } else if (mode === "block-all") {
        rules.push({ id: id++, ...base, action: { type: "block" } });
      } else {
        // block-external
        rules.push({
          id: id++,
          priority: 10,
          action: { type: "block" },
          condition: { resourceTypes: [type], initiatorDomains: d, domainType: "thirdParty" },
        });
        // If default for this type is block-all, re-allow first-party
        if (defMode(typeModes, type) === "block-all") {
          rules.push({
            id: id++,
            priority: 10,
            action: { type: "allow" },
            condition: {
              resourceTypes: [type],
              initiatorDomains: d,
              domainType: "firstParty",
            },
          });
        }
      }
    }
  }
  return rules;
}

let syncing = null;

async function replaceRules(addRules) {
  if (!dnr?.updateDynamicRules) return;
  const existing = await dnr.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  if (!removeRuleIds.length && !addRules.length) return;
  const opts = {};
  if (removeRuleIds.length) opts.removeRuleIds = removeRuleIds;
  if (addRules.length) opts.addRules = addRules;
  await dnr.updateDynamicRules(opts);
}

async function loadState() {
  const raw = await b.storage.local.get(null);
  const { typeModes, siteTypeModes } = migrate(raw);
  // Persist migrated shape once if needed
  if (!raw.typeModes) {
    await b.storage.local.set({ typeModes, siteTypeModes });
  }
  return { typeModes, siteTypeModes };
}

async function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      if (!dnr?.updateDynamicRules) return;
      const state = await loadState();
      // Fill missing defaults for first paint of rules
      const typeModes = { ...DEFAULT_TYPE_MODES, ...state.typeModes };
      let rules = build({ typeModes, siteTypeModes: state.siteTypeModes });
      try {
        await replaceRules(rules);
      } catch (e) {
        console.error("Traffic Light: full rules failed, defaults only", e);
        try {
          await replaceRules(build({ typeModes, siteTypeModes: {} }));
        } catch (e2) {
          console.error("Traffic Light: DNR sync failed", e2);
          try {
            await replaceRules([]);
          } catch (_) {
            /* ignore */
          }
        }
      }
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

b.runtime.onInstalled.addListener(() => {
  sync();
});
b.runtime.onStartup.addListener(() => {
  sync();
});

if (b.storage?.onChanged) {
  b.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (
      changes.typeModes ||
      changes.siteTypeModes ||
      changes.defaultMode ||
      changes.siteModes ||
      changes.resourceTypes
    ) {
      sync();
    }
  });
}

b.runtime.onMessage.addListener((m, _s, sendResponse) => {
  if (m !== "sync" && m?.type !== "sync") return;
  sync()
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

setTimeout(() => sync(), 0);
