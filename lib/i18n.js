let overrideMessages = null;

export async function initI18n() {
  try {
    const { uiLocale } = await browser.storage.local.get({ uiLocale: "auto" });
    if (uiLocale && uiLocale !== "auto") {
      const url = browser.runtime.getURL(`_locales/${uiLocale}/messages.json`);
      const resp = await fetch(url);
      if (resp.ok) {
        overrideMessages = await resp.json();
        return;
      }
    }
  } catch {
    /* fall back to browser locale */
  }
  overrideMessages = null;
}

function resolveOverride(key, substitutions) {
  const entry = overrideMessages?.[key];
  if (!entry?.message) return null;
  let text = entry.message;
  const placeholders = entry.placeholders || {};
  for (const [name, def] of Object.entries(placeholders)) {
    const re = new RegExp(`\\$${name.toUpperCase()}\\$`, "g");
    text = text.replace(re, def.content);
  }
  const arr = substitutions === undefined
    ? []
    : (Array.isArray(substitutions) ? substitutions : [substitutions]);
  return text.replace(/\$(\d+)/g, (_, idx) => arr[Number(idx) - 1] ?? "");
}

export function t(key, substitutions) {
  if (overrideMessages) {
    const msg = resolveOverride(key, substitutions);
    if (msg !== null) return msg;
  }
  return browser.i18n.getMessage(key, substitutions) || key;
}

export function applyI18n(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    const msg = t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  }
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    const msg = t(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    const msg = t(el.dataset.i18nTitle);
    if (msg) el.title = msg;
  }
}
