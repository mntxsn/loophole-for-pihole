import { registrableDomain } from "./lib/heuristics.js";

const MAX_AGE_MS = 120_000;
const MAX_ENTRIES_PER_TAB = 200;
const MAX_HOSTS_PER_TAB = 500;

const BADGE_BG = "#666666";
const BADGE_FG = "#ffffff";

const tabState = new Map();
let showBadge = true;

browser.storage.local.get({ showBadge: true }).then(s => {
  showBadge = s.showBadge !== false;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.showBadge) return;
  showBadge = changes.showBadge.newValue !== false;
  if (!showBadge) {
    for (const tabId of tabState.keys()) {
      browser.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }
  } else {
    for (const [tabId, rec] of tabState) {
      updateBadge(tabId, uniqueSiteCount(rec.failures));
    }
  }
});

function uniqueSiteCount(failures) {
  if (!failures || failures.length === 0) return 0;
  return new Set(failures.map(f => registrableDomain(f.hostname))).size;
}

function newRecord() {
  return {
    failures: [],
    requestedHosts: new Map(), // hostname → lastSeen ms
    pageLoadStart: Date.now(),
  };
}

function getRecord(tabId) {
  let rec = tabState.get(tabId);
  if (!rec) {
    rec = newRecord();
    tabState.set(tabId, rec);
  }
  return rec;
}

function prune(record) {
  const cutoff = Date.now() - MAX_AGE_MS;
  record.failures = record.failures.filter(f => f.timestamp >= cutoff);
  if (record.failures.length > MAX_ENTRIES_PER_TAB) {
    record.failures = record.failures.slice(-MAX_ENTRIES_PER_TAB);
  }
  for (const [host, seen] of record.requestedHosts) {
    if (seen < cutoff) record.requestedHosts.delete(host);
  }
  if (record.requestedHosts.size > MAX_HOSTS_PER_TAB) {
    // Drop oldest entries.
    const sorted = [...record.requestedHosts.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = sorted.length - MAX_HOSTS_PER_TAB;
    for (let i = 0; i < toRemove; i++) record.requestedHosts.delete(sorted[i][0]);
  }
}

const DNS_ERRORS = new Set([
  "NS_ERROR_UNKNOWN_HOST",
  "NS_ERROR_UNKNOWN_PROXY_HOST",
]);

const CONNECTION_ERRORS = new Set([
  "NS_ERROR_CONNECTION_REFUSED",
  "NS_ERROR_NET_TIMEOUT",
  "NS_ERROR_NET_RESET",
  "NS_ERROR_NET_INTERRUPT",
  "NS_ERROR_PROXY_CONNECTION_REFUSED",
]);

function classifyError(reason) {
  if (DNS_ERRORS.has(reason)) return "dns";
  if (CONNECTION_ERRORS.has(reason)) return "connection";
  if (reason?.startsWith("HTTP ")) return "http";
  return "other";
}

function record(tabId, details, reason) {
  if (tabId === undefined || tabId < 0) return;
  let url;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  const rec = getRecord(tabId);
  const kind = classifyError(reason);
  rec.failures.push({
    url: details.url,
    hostname: url.hostname,
    error: reason,
    kind,
    type: details.type,
    timestamp: Date.now(),
  });
  prune(rec);
  updateBadge(tabId, uniqueSiteCount(rec.failures));
  browser.runtime
    .sendMessage({ type: "failures-updated", tabId })
    .catch(() => {});
}

function recordRequest(tabId, url) {
  if (tabId === undefined || tabId < 0) return;
  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return;
  const rec = getRecord(tabId);
  rec.requestedHosts.set(u.hostname, Date.now());
}

function updateBadge(tabId, count) {
  if (!showBadge) {
    browser.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    return;
  }
  const text = count > 0 ? String(count) : "";
  browser.action.setBadgeText({ tabId, text }).catch(() => {});
  if (count > 0) {
    browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_BG }).catch(() => {});
    browser.action.setBadgeTextColor({ tabId, color: BADGE_FG }).catch(() => {});
  }
}

browser.webRequest.onBeforeRequest.addListener(
  details => recordRequest(details.tabId, details.url),
  { urls: ["<all_urls>"] }
);

browser.webRequest.onErrorOccurred.addListener(
  details => {
    const err = details.error || "unknown";
    if (err === "NS_BINDING_ABORTED" || err === "NS_BINDING_REDIRECTED") return;
    record(details.tabId, details, err);
  },
  { urls: ["<all_urls>"] }
);

browser.webRequest.onCompleted.addListener(
  details => {
    if (details.statusCode >= 500 || details.statusCode === 0) {
      record(details.tabId, details, `HTTP ${details.statusCode}`);
    }
  },
  { urls: ["<all_urls>"] }
);

browser.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0) return;
  tabState.set(details.tabId, newRecord());
  updateBadge(details.tabId, 0);
});

browser.tabs.onRemoved.addListener(tabId => tabState.delete(tabId));

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "get-failures") {
    const rec = tabState.get(message.tabId);
    if (!rec) {
      return { failures: [], pageLoadStart: null, requestedHosts: [] };
    }
    prune(rec);
    return {
      failures: rec.failures,
      pageLoadStart: rec.pageLoadStart,
      requestedHosts: [...rec.requestedHosts.keys()],
    };
  }
  if (message?.type === "clear-failures") {
    const rec = tabState.get(message.tabId);
    if (rec) {
      rec.failures = [];
      updateBadge(message.tabId, 0);
    }
    return { ok: true };
  }
});
