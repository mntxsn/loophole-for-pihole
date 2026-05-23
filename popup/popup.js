import { PiholeClient, isBlocked, effectiveDomain, domainToRegex } from "../lib/pihole.js";
import { scoreDomain, registrableDomain } from "../lib/heuristics.js";
import {
  getSettings,
  recordAllowed,
  getMutedDomains,
  muteDomain,
} from "../lib/storage.js";
import { t, applyI18n, initI18n } from "../lib/i18n.js";

const els = {
  status: document.getElementById("status"),
  empty: document.getElementById("empty"),
  list: document.getElementById("suggestions"),
  meta: document.getElementById("meta"),
  pageHost: document.getElementById("page-host"),
  refresh: document.getElementById("refresh"),
  openOptions: document.getElementById("open-options"),
  template: document.getElementById("suggestion-template"),
  reloadBar: document.getElementById("reload-bar"),
  reloadBtn: document.getElementById("reload-page"),
  manualForm: document.getElementById("manual-add"),
  manualInput: document.getElementById("manual-input"),
  manualWildcard: document.getElementById("manual-wildcard"),
};

await initI18n();
applyI18n();

let currentTab = null;
let currentClient = null;
let liveRefreshTimer = null;
let lastRunAt = 0;

const SKIP_PROTOCOLS = new Set([
  "about:", "moz-extension:", "chrome:", "chrome-extension:",
  "view-source:", "file:", "javascript:", "data:",
]);

function setStatus(text, kind = "info") {
  if (!text) {
    els.status.hidden = true;
    els.status.textContent = "";
    return;
  }
  els.status.hidden = false;
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
}

function confidenceClass(score) {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "mid";
  return "low";
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getFailures(tabId) {
  return browser.runtime.sendMessage({ type: "get-failures", tabId });
}

function buildSuggestions({ failures, queries, pageHost, muted, requestedHosts, strictMatch }) {
  const failureByHost = new Map();
  for (const f of failures) {
    if (!failureByHost.has(f.hostname)) failureByHost.set(f.hostname, []);
    failureByHost.get(f.hostname).push(f);
  }

  const browserHosts = new Set(requestedHosts || []);
  for (const f of failures) browserHosts.add(f.hostname);

  const blocked = queries.filter(isBlocked);
  const blockedByDomain = new Map();
  let filteredOutCount = 0;
  for (const q of blocked) {
    const d = effectiveDomain(q);
    if (!d) continue;
    if (strictMatch && !browserHosts.has(d)) {
      filteredOutCount++;
      continue;
    }
    if (!blockedByDomain.has(d)) blockedByDomain.set(d, []);
    blockedByDomain.get(d).push(q);
  }

  const pageRoot = pageHost ? registrableDomain(pageHost) : null;
  const items = [];

  for (const [domain, qs] of blockedByDomain) {
    const domainFailures = failureByHost.get(domain) || [];
    const dnsFailure = domainFailures.some(f => f.kind === "dns");
    const directMatch =
      domainFailures.length > 0 ||
      [...failureByHost.keys()].some(
        h => h !== domain && (h.endsWith(`.${domain}`) || domain.endsWith(`.${h}`))
      );
    const sameSiteAsPage = pageRoot && registrableDomain(domain) === pageRoot;
    const { score, category, reasons } = scoreDomain(domain, {
      directMatch,
      sameSiteAsPage,
      reasonsI18n: { sameSite: t("popupReasonSameSite"), direct: t("popupReasonDirectMatch") },
    });
    let finalScore = score;
    if (dnsFailure) {
      finalScore = Math.min(1, finalScore + 0.1);
      reasons.push(t("popupReasonDnsBlock"));
    }
    items.push({
      domain,
      score: finalScore,
      category,
      reasons,
      directMatch,
      hits: qs.length,
      lastSeen: Math.max(...qs.map(q => (q.time || 0) * 1000)),
      blocked: true,
    });
  }

  for (const [host, fs] of failureByHost) {
    if (blockedByDomain.has(host)) continue;
    const { score, category, reasons } = scoreDomain(host, {
      directMatch: true,
      sameSiteAsPage: pageRoot && registrableDomain(host) === pageRoot,
      reasonsI18n: { sameSite: t("popupReasonSameSite"), direct: t("popupReasonDirectMatch") },
    });
    items.push({
      domain: host,
      score: Math.max(0, score - 0.2),
      category: t("popupReasonNotBlocked", [category]),
      reasons: [...reasons, t("popupReasonFailed", [fs[0].error])],
      directMatch: true,
      blocked: false,
      hits: fs.length,
      lastSeen: Math.max(...fs.map(f => f.timestamp)),
    });
  }

  const groups = new Map();
  for (const it of items) {
    const root = registrableDomain(it.domain);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(it);
  }

  const mutedSet = new Set(muted);
  const suggestions = [];
  for (const [root, members] of groups) {
    if (mutedSet.has(root)) continue;
    const visible = members.filter(m => !mutedSet.has(m.domain));
    if (visible.length === 0) continue;
    visible.sort((a, b) => b.score - a.score || b.hits - a.hits);
    const primary = visible[0];
    const subdomains = visible.filter(m => m.domain !== primary.domain).map(m => m.domain);
    suggestions.push({
      ...primary,
      registrableRoot: root,
      subdomains,
      memberCount: visible.length,
    });
  }

  suggestions.sort((a, b) => b.score - a.score || b.lastSeen - a.lastSeen);
  return { suggestions, filteredOutCount };
}

function showReloadBar() {
  els.reloadBar.hidden = false;
}

async function allowDomain({ payload, kind, displayDomain, btn }) {
  btn.disabled = true;
  btn.textContent = "…";
  btn.classList.remove("success", "error");
  try {
    const result = await currentClient.addAllow(payload, { kind });
    btn.textContent = result.alreadyExists ? t("popupAllowExists") : t("popupAllowSuccess");
    btn.classList.add("success");
    await recordAllowed({ domain: payload, displayDomain, kind });
    showReloadBar();
    return true;
  } catch (err) {
    console.error(err);
    btn.textContent = t("popupAllowFailed");
    btn.classList.add("error");
    btn.disabled = false;
    setStatus(err.message || String(err), "error");
    return false;
  }
}

function renderSuggestions(suggestions) {
  els.list.innerHTML = "";
  if (suggestions.length === 0) {
    els.empty.hidden = false;
    return;
  }
  els.empty.hidden = true;

  for (const s of suggestions) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const fill = node.querySelector(".bar-fill");
    fill.style.width = `${Math.round(s.score * 100)}%`;
    fill.classList.add(confidenceClass(s.score));
    node.querySelector(".pct").textContent = `${Math.round(s.score * 100)}%`;
    node.querySelector(".domain").textContent = s.domain;
    const extraReason = s.memberCount > 1
      ? t("popupReasonSubdomains", [String(s.memberCount - 1)])
      : null;
    const recently = s.hits > 1
      ? t("popupReasonRecently", [String(s.hits)])
      : null;
    const reasonText = [
      s.category,
      ...s.reasons,
      recently,
      extraReason,
    ].filter(Boolean).join(" · ");
    node.querySelector(".reasons").textContent = reasonText;

    const wildcardLabel = node.querySelector(".wildcard-toggle");
    const wildcardCb = node.querySelector(".wildcard-cb");
    const wildcardText = node.querySelector(".wildcard-label");
    const showWildcard = s.memberCount > 1 || s.registrableRoot !== s.domain;
    if (showWildcard) {
      wildcardLabel.hidden = false;
      wildcardCb.checked = s.memberCount > 1;
      wildcardText.textContent = t("popupAllowWholeSite", [s.registrableRoot]);
    }

    const allowBtn = node.querySelector(".allow");
    allowBtn.textContent = s.blocked
      ? t("popupSuggestionAllow")
      : t("popupSuggestionAllowAnyway");

    const muteBtn = node.querySelector(".mute");
    muteBtn.title = t("popupSuggestionMuteTitle");

    allowBtn.addEventListener("click", () => {
      const useWildcard = wildcardCb.checked;
      const target = useWildcard ? s.registrableRoot : s.domain;
      const payload = useWildcard ? domainToRegex(s.registrableRoot) : target;
      allowDomain({
        payload,
        kind: useWildcard ? "regex" : "exact",
        displayDomain: useWildcard ? `*.${s.registrableRoot}` : target,
        btn: allowBtn,
      });
    });

    muteBtn.addEventListener("click", async () => {
      await muteDomain(s.domain);
      node.remove();
    });

    els.list.appendChild(node);
  }
}

function normalizeDomainInput(raw) {
  if (!raw) return null;
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  try {
    if (/^https?:\/\//.test(v)) v = new URL(v).hostname;
  } catch { /* ignore */ }
  v = v.replace(/^\*\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return null;
  return v;
}

async function run({ silent = false } = {}) {
  lastRunAt = Date.now();
  if (!silent) {
    setStatus(t("popupStatusLoading"));
    els.list.innerHTML = "";
    els.empty.hidden = true;
    els.reloadBar.hidden = true;
  }

  const settings = await getSettings();
  if (!settings.piholeUrl) {
    setStatus(t("popupStatusConfigure"), "error");
    return;
  }

  currentTab = await getActiveTab();
  let pageHost = "";
  try {
    if (currentTab?.url) {
      const u = new URL(currentTab.url);
      if (SKIP_PROTOCOLS.has(u.protocol)) {
        setStatus(t("popupStatusInternalTab"), "info");
        return;
      }
      pageHost = u.hostname;
    }
  } catch { /* ignore */ }
  els.pageHost.textContent = pageHost ? t("popupPageHostPrefix", [pageHost]) : "";

  const { failures, pageLoadStart, requestedHosts } = await getFailures(currentTab.id);

  const windowMs = (settings.scanWindowSeconds ?? 30) * 1000;
  const earliestMs = Math.min(pageLoadStart || Date.now(), Date.now() - windowMs);
  const fromSec = earliestMs / 1000 - 2;
  const untilSec = Date.now() / 1000 + 1;

  currentClient = new PiholeClient({
    baseUrl: settings.piholeUrl,
    password: settings.piholePassword,
  });

  let queries = [];
  try {
    queries = await currentClient.getQueries({
      from: fromSec,
      until: untilSec,
      clientIp: settings.clientIp || undefined,
    });
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), "error");
    return;
  }

  if (settings.clientIp && queries.length === 0) {
    setStatus(t("popupStatusNoQueries", [settings.clientIp]), "warn");
  } else if (!silent) {
    setStatus("");
  }

  const muted = await getMutedDomains();
  const strictMatch = settings.strictMatch !== false;
  const { suggestions, filteredOutCount } = buildSuggestions({
    failures,
    queries,
    pageHost,
    muted,
    requestedHosts,
    strictMatch,
  });
  renderSuggestions(suggestions);

  const blockedCount = queries.filter(isBlocked).length;
  const fromDate = new Date(fromSec * 1000).toLocaleTimeString();
  els.meta.textContent =
    strictMatch && filteredOutCount > 0
      ? t("popupMetaSummaryWithHidden", [
          String(failures.length),
          String(blockedCount),
          String(filteredOutCount),
          fromDate,
        ])
      : t("popupMetaSummary", [
          String(failures.length),
          String(blockedCount),
          fromDate,
        ]);
}

function scheduleLiveRefresh() {
  if (liveRefreshTimer) return;
  liveRefreshTimer = setTimeout(() => {
    liveRefreshTimer = null;
    run({ silent: true }).catch(err => console.error(err));
  }, 800);
}

els.refresh.addEventListener("click", () => run());
els.openOptions.addEventListener("click", () => browser.runtime.openOptionsPage());
els.reloadBtn.addEventListener("click", async () => {
  if (currentTab?.id) {
    await browser.tabs.reload(currentTab.id, { bypassCache: true });
    window.close();
  }
});

els.manualForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const domain = normalizeDomainInput(els.manualInput.value);
  if (!domain) {
    setStatus(t("popupManualErrorInvalid"), "error");
    return;
  }
  if (!currentClient) {
    const settings = await getSettings();
    currentClient = new PiholeClient({
      baseUrl: settings.piholeUrl,
      password: settings.piholePassword,
    });
  }
  const useWildcard = els.manualWildcard.checked;
  const submitBtn = els.manualForm.querySelector("button[type=submit]");
  const ok = await allowDomain({
    payload: useWildcard ? domainToRegex(domain) : domain,
    kind: useWildcard ? "regex" : "exact",
    displayDomain: useWildcard ? `*.${domain}` : domain,
    btn: submitBtn,
  });
  if (ok) {
    els.manualInput.value = "";
    submitBtn.disabled = false;
    submitBtn.textContent = t("popupManualSubmit");
    submitBtn.classList.remove("success");
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (
    message?.type === "failures-updated" &&
    currentTab?.id === message.tabId &&
    Date.now() - lastRunAt > 500
  ) {
    scheduleLiveRefresh();
  }
});

run().catch(err => {
  console.error(err);
  setStatus(err.message || String(err), "error");
});
