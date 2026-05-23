import { PiholeClient, normalizeBaseUrl } from "../lib/pihole.js";
import {
  getSettings,
  saveSettings,
  defaults,
  getRecentlyAllowed,
  removeRecorded,
  getMutedDomains,
  unmuteDomain,
} from "../lib/storage.js";
import { t, applyI18n, initI18n } from "../lib/i18n.js";

const els = {
  form: document.getElementById("settings-form"),
  piholeUrl: document.getElementById("piholeUrl"),
  piholePassword: document.getElementById("piholePassword"),
  clientIp: document.getElementById("clientIp"),
  scanWindowSeconds: document.getElementById("scanWindowSeconds"),
  uiLocale: document.getElementById("uiLocale"),
  showBadge: document.getElementById("showBadge"),
  strictMatch: document.getElementById("strictMatch"),
  testBtn: document.getElementById("test-connection"),
  detectBtn: document.getElementById("detect-ip"),
  status: document.getElementById("status"),
  recentList: document.getElementById("recent-list"),
  recentEmpty: document.getElementById("recent-empty"),
  recentTemplate: document.getElementById("recent-template"),
  mutedList: document.getElementById("muted-list"),
  mutedEmpty: document.getElementById("muted-empty"),
  mutedTemplate: document.getElementById("muted-template"),
};

await initI18n();
applyI18n();
document.title = `${t("optionsTitle")} – ${t("popupSettings")}`;

function setStatus(text, kind = "success") {
  if (!text) {
    els.status.hidden = true;
    return;
  }
  els.status.hidden = false;
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
}

async function load() {
  const settings = await getSettings();
  els.piholeUrl.value = settings.piholeUrl;
  els.piholePassword.value = settings.piholePassword;
  els.clientIp.value = settings.clientIp;
  els.scanWindowSeconds.value = settings.scanWindowSeconds ?? defaults().scanWindowSeconds;
  els.uiLocale.value = settings.uiLocale || "auto";
  els.showBadge.checked = settings.showBadge !== false;
  els.strictMatch.checked = settings.strictMatch !== false;
  await renderRecent();
  await renderMuted();
}

function readForm() {
  return {
    piholeUrl: normalizeBaseUrl(els.piholeUrl.value),
    piholePassword: els.piholePassword.value,
    clientIp: els.clientIp.value.trim(),
    scanWindowSeconds: Number(els.scanWindowSeconds.value) || defaults().scanWindowSeconds,
    uiLocale: els.uiLocale.value || "auto",
    showBadge: els.showBadge.checked,
    strictMatch: els.strictMatch.checked,
  };
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = readForm();
  await saveSettings(data);
  els.piholeUrl.value = data.piholeUrl;
  setStatus(t("optionsStatusSaved"), "success");
});

els.testBtn.addEventListener("click", async () => {
  setStatus(t("optionsStatusTesting"), "success");
  const data = readForm();
  if (!data.piholeUrl) {
    setStatus(t("optionsStatusSetUrlFirst"), "error");
    return;
  }
  const client = new PiholeClient({
    baseUrl: data.piholeUrl,
    password: data.piholePassword,
  });
  try {
    const queries = await client.getQueries({
      from: Date.now() / 1000 - 60,
      until: Date.now() / 1000,
      length: 5,
    });
    setStatus(t("optionsStatusTestOk", [String(queries.length)]), "success");
  } catch (err) {
    setStatus(t("optionsStatusGenericFailed", [err.message || String(err)]), "error");
  }
});

els.detectBtn.addEventListener("click", async () => {
  setStatus(t("optionsStatusDetecting"), "success");
  const data = readForm();
  if (!data.piholeUrl) {
    setStatus(t("optionsStatusSetUrlFirst"), "error");
    return;
  }
  const client = new PiholeClient({
    baseUrl: data.piholeUrl,
    password: data.piholePassword,
  });

  try {
    const session = await client.getCurrentSessionInfo();
    const ip = session?.remote_addr || session?.client_ip;
    if (ip) {
      els.clientIp.value = ip;
      setStatus(t("optionsStatusDetectSession", [ip]), "success");
      return;
    }
  } catch {
    /* fall through */
  }

  const marker = `swh-detect-${Math.random().toString(36).slice(2, 10)}.invalid`;
  try {
    await fetch(`https://${marker}/`).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    const queries = await client.getQueries({
      from: Date.now() / 1000 - 30,
      until: Date.now() / 1000 + 1,
      length: 200,
    });
    const hit = queries.find(q => (q.domain || "").toLowerCase() === marker);
    if (!hit) {
      setStatus(t("optionsStatusDetectFailed"), "error");
      return;
    }
    const ip = hit.client?.ip || "";
    if (!ip) {
      setStatus(t("optionsStatusProbeNoIp"), "error");
      return;
    }
    els.clientIp.value = ip;
    setStatus(t("optionsStatusDetectProbe", [ip]), "success");
  } catch (err) {
    setStatus(t("optionsStatusGenericFailed", [err.message || String(err)]), "error");
  }
});

async function renderRecent() {
  const list = await getRecentlyAllowed();
  els.recentList.innerHTML = "";
  els.recentEmpty.hidden = list.length > 0;
  for (const entry of list) {
    const node = els.recentTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".recent-domain").textContent = entry.displayDomain || entry.domain;
    const when = new Date(entry.allowedAt).toLocaleString();
    node.querySelector(".recent-meta").textContent = t("optionsRecentMeta", [entry.kind, when]);
    const undoBtn = node.querySelector(".undo");
    undoBtn.addEventListener("click", async () => {
      undoBtn.disabled = true;
      undoBtn.textContent = "…";
      try {
        const settings = await getSettings();
        const client = new PiholeClient({
          baseUrl: settings.piholeUrl,
          password: settings.piholePassword,
        });
        await client.removeAllow(entry.domain, { kind: entry.kind });
        await removeRecorded(entry.domain, entry.kind);
        await renderRecent();
      } catch (err) {
        undoBtn.disabled = false;
        undoBtn.textContent = t("optionsRecentUndo");
        setStatus(t("optionsStatusUndoFailed", [err.message || String(err)]), "error");
      }
    });
    els.recentList.appendChild(node);
  }
}

async function renderMuted() {
  const list = await getMutedDomains();
  els.mutedList.innerHTML = "";
  els.mutedEmpty.hidden = list.length > 0;
  for (const domain of list) {
    const node = els.mutedTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".recent-domain").textContent = domain;
    const btn = node.querySelector(".unmute");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await unmuteDomain(domain);
      await renderMuted();
    });
    els.mutedList.appendChild(node);
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.recentlyAllowed) renderRecent();
  if (changes.mutedDomains) renderMuted();
  if (changes.uiLocale) window.location.reload();
});

load();
