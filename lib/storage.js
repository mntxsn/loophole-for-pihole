const DEFAULTS = {
  piholeUrl: "",
  piholePassword: "",
  clientIp: "",
  scanWindowSeconds: 30,
  autoOpenOnFailures: false,
  showBadge: true,
  strictMatch: true,
  uiLocale: "auto",
};

const RECENT_KEY = "recentlyAllowed";
const MAX_RECENT = 25;
const MUTED_KEY = "mutedDomains";

export async function getSettings() {
  const stored = await browser.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(partial) {
  await browser.storage.local.set(partial);
}

export function defaults() {
  return { ...DEFAULTS };
}

export async function getRecentlyAllowed() {
  const { [RECENT_KEY]: list } = await browser.storage.local.get(RECENT_KEY);
  return Array.isArray(list) ? list : [];
}

export async function recordAllowed(entry) {
  const list = await getRecentlyAllowed();
  // De-dupe on domain+kind, newest first.
  const filtered = list.filter(
    e => !(e.domain === entry.domain && e.kind === entry.kind)
  );
  filtered.unshift({ ...entry, allowedAt: Date.now() });
  await browser.storage.local.set({ [RECENT_KEY]: filtered.slice(0, MAX_RECENT) });
}

export async function removeRecorded(domain, kind) {
  const list = await getRecentlyAllowed();
  const next = list.filter(e => !(e.domain === domain && e.kind === kind));
  await browser.storage.local.set({ [RECENT_KEY]: next });
}

export async function getMutedDomains() {
  const { [MUTED_KEY]: list } = await browser.storage.local.get(MUTED_KEY);
  return Array.isArray(list) ? list : [];
}

export async function muteDomain(domain) {
  const list = await getMutedDomains();
  if (list.includes(domain)) return;
  list.push(domain);
  await browser.storage.local.set({ [MUTED_KEY]: list });
}

export async function unmuteDomain(domain) {
  const list = await getMutedDomains();
  const next = list.filter(d => d !== domain);
  await browser.storage.local.set({ [MUTED_KEY]: next });
}
