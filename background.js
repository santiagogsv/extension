/* storage → DNR (network scripts only). Firefox-first; Chrome/Safari via browser||chrome */
const b = globalThis.browser ?? globalThis.chrome;
const DEF = "block-all";
const dnr = b.declarativeNetRequest;
const SCRIPT = ["script"];

const rule = (id, priority, type, extra) => ({
  id,
  priority,
  action: { type },
  condition: { resourceTypes: SCRIPT, ...extra },
});

function domains(host) {
  const h = String(host || "")
    .replace(/^www\./i, "")
    .toLowerCase();
  return h ? [h, "www." + h] : [];
}

function build({ defaultMode = DEF, siteModes = {} }) {
  const rules = [];
  if (defaultMode === "block-all") rules.push(rule(1, 1, "block"));
  else if (defaultMode === "block-external")
    rules.push(rule(1, 1, "block", { domainType: "thirdParty" }));

  let i = 0;
  for (const host in siteModes) {
    const mode = siteModes[host];
    const d = domains(host);
    if (!mode || !d.length) continue;
    const id = 1000 + i++ * 2;
    if (mode === "allow") rules.push(rule(id, 10, "allow", { initiatorDomains: d }));
    else if (mode === "block-all")
      rules.push(rule(id, 10, "block", { initiatorDomains: d }));
    else {
      rules.push(rule(id, 10, "block", { initiatorDomains: d, domainType: "thirdParty" }));
      if (defaultMode === "block-all")
        rules.push(rule(id + 1, 10, "allow", { initiatorDomains: d, domainType: "firstParty" }));
    }
  }
  return rules;
}

async function sync() {
  const [state, existing] = await Promise.all([
    b.storage.local.get({ defaultMode: DEF, siteModes: {} }),
    dnr.getDynamicRules(),
  ]);
  await dnr.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: build(state),
  });
}

b.runtime.onInstalled.addListener(sync);
b.runtime.onStartup.addListener(sync);
// return true + sendResponse: works on Chrome SW; Promise also fine on Firefox
b.runtime.onMessage.addListener((m, _s, sendResponse) => {
  if (m !== "sync") return;
  sync().then(() => sendResponse(true));
  return true;
});
sync();
