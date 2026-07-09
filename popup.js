const b = globalThis.browser ?? globalThis.chrome;
const DEF = "block-all";
const L = {
  "block-all": "block all",
  "block-external": "block external",
  allow: "allow all",
  inherit: "use default",
};

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

const paint = (el, mode) => {
  for (const btn of el.querySelectorAll(".lamp"))
    btn.classList.toggle("on", btn.dataset.m === mode);
};

async function main() {
  const [tab] = await b.tabs.query({ active: true, currentWindow: true });
  const host = tab ? hostOf(tab.url || "") : null;
  const { defaultMode = DEF, siteModes = {} } = await b.storage.local.get({
    defaultMode: DEF,
    siteModes: {},
  });
  const siteMode = (host && siteModes[host]) || "inherit";

  const def = document.getElementById("def");
  const site = document.getElementById("site");
  const defL = document.getElementById("defL");
  const siteL = document.getElementById("siteL");

  paint(def, defaultMode);
  defL.textContent = L[defaultMode];
  paint(site, host ? siteMode : null);
  siteL.textContent = host ? `${L[siteMode]}\n${host}` : "n/a";
  if (!host) for (const btn of site.querySelectorAll(".lamp")) btn.disabled = true;

  const apply = async (patch) => {
    await b.storage.local.set(patch);
    await b.runtime.sendMessage("sync");
    if (tab?.id != null && /^https?:/.test(tab.url || "")) await b.tabs.reload(tab.id);
    close();
  };

  def.onclick = (e) => {
    const m = e.target.dataset?.m;
    if (m) apply({ defaultMode: m });
  };

  site.onclick = (e) => {
    const m = e.target.dataset?.m;
    if (!m || !host) return;
    const next = { ...siteModes };
    if (m === "inherit") delete next[host];
    else next[host] = m;
    apply({ siteModes: next });
  };
}

main();
