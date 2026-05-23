export const BLOCKED_STATUSES = new Set([
  "GRAVITY",
  "GRAVITY_CNAME",
  "REGEX",
  "REGEX_CNAME",
  "DENYLIST",
  "DENYLIST_CNAME",
  "EXTERNAL_BLOCKED_IP",
  "EXTERNAL_BLOCKED_NULL",
  "EXTERNAL_BLOCKED_NXRA",
  "SPECIAL_DOMAIN",
]);

export const CNAME_STATUSES = new Set([
  "GRAVITY_CNAME",
  "REGEX_CNAME",
  "DENYLIST_CNAME",
]);

export function isBlocked(query) {
  return BLOCKED_STATUSES.has(query.status);
}

export function effectiveDomain(query) {
  // For CNAME-blocked queries, the user's site asked for `domain`, which then
  // resolved (via CNAME) to a blocked target. Allow-listing the asked-for
  // domain is what actually unbreaks the page, so prefer it.
  if (CNAME_STATUSES.has(query.status) && query.domain) {
    return String(query.domain).toLowerCase();
  }
  return String(query.domain || "").toLowerCase();
}

export function normalizeBaseUrl(raw) {
  if (!raw) return "";
  let url = String(raw).trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, "");
}

function describeFetchError(err) {
  if (err?.name === "TypeError") {
    return new Error(
      `Pi-hole unreachable (${err.message}). Check the URL, reachability, ` +
      `and the TLS certificate (self-signed certs must be added as an ` +
      `exception in this Firefox profile).`
    );
  }
  return err;
}

const SID_CACHE_KEY = "__pihole_sid_cache__";

async function loadCachedSid(baseUrl) {
  try {
    const { [SID_CACHE_KEY]: cache } = await browser.storage.local.get(SID_CACHE_KEY);
    if (!cache) return null;
    if (cache.baseUrl !== baseUrl) return null;
    if (Date.now() >= cache.expiresAt - 5_000) return null;
    return { sid: cache.sid, expiresAt: cache.expiresAt };
  } catch {
    return null;
  }
}

async function saveCachedSid(baseUrl, sid, expiresAt) {
  try {
    await browser.storage.local.set({
      [SID_CACHE_KEY]: { baseUrl, sid, expiresAt },
    });
  } catch {
    /* ignore */
  }
}

async function clearCachedSid() {
  try {
    await browser.storage.local.remove(SID_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export class PiholeClient {
  constructor({ baseUrl, password }) {
    if (!baseUrl) throw new Error("Pi-hole URL is not configured");
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.password = password ?? "";
    this.sid = null;
    this.sidExpiresAt = 0;
  }

  async _login() {
    let resp;
    try {
      resp = await fetch(`${this.baseUrl}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: this.password }),
      });
    } catch (err) {
      throw describeFetchError(err);
    }
    if (!resp.ok) {
      throw new Error(`Pi-hole login failed (HTTP ${resp.status})`);
    }
    const data = await resp.json();
    const session = data.session;
    if (!session || session.valid !== true || !session.sid) {
      const msg = session?.message || "invalid credentials";
      throw new Error(`Pi-hole login failed: ${msg}`);
    }
    this.sid = session.sid;
    const ttlSec = typeof session.validity === "number" ? session.validity : 300;
    this.sidExpiresAt = Date.now() + ttlSec * 1000;
    await saveCachedSid(this.baseUrl, this.sid, this.sidExpiresAt);
  }

  async _ensureAuth() {
    if (this.sid && Date.now() < this.sidExpiresAt - 5_000) return;
    const cached = await loadCachedSid(this.baseUrl);
    if (cached) {
      this.sid = cached.sid;
      this.sidExpiresAt = cached.expiresAt;
      return;
    }
    await this._login();
  }

  async _request(path, options = {}) {
    await this._ensureAuth();
    const headers = {
      Accept: "application/json",
      "X-FTL-SID": this.sid,
      ...(options.headers || {}),
    };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    let resp;
    try {
      resp = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    } catch (err) {
      throw describeFetchError(err);
    }
    if (resp.status === 401) {
      this.sid = null;
      await clearCachedSid();
      await this._login();
      const retryHeaders = { ...headers, "X-FTL-SID": this.sid };
      try {
        resp = await fetch(`${this.baseUrl}${path}`, { ...options, headers: retryHeaders });
      } catch (err) {
        throw describeFetchError(err);
      }
    }
    return resp;
  }

  async getQueries({ from, until, clientIp, length = 500 } = {}) {
    const params = new URLSearchParams();
    if (from !== undefined) params.set("from", String(Math.floor(from)));
    if (until !== undefined) params.set("until", String(Math.ceil(until)));
    if (clientIp) params.set("client_ip", clientIp);
    params.set("length", String(length));
    const resp = await this._request(`/api/queries?${params}`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Query log request failed (HTTP ${resp.status}): ${text}`);
    }
    const data = await resp.json();
    return Array.isArray(data.queries) ? data.queries : [];
  }

  async getCurrentSessionInfo() {
    // Returns the active session record for THIS client, if discoverable.
    const resp = await this._request(`/api/auth/sessions`);
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => ({}));
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    return (
      sessions.find(s => s.current_session === true) ||
      sessions.find(s => s.valid === true) ||
      null
    );
  }

  async addAllow(domain, { comment = "Loophole for Pi-hole", kind = "exact" } = {}) {
    const body = JSON.stringify({
      domain: Array.isArray(domain) ? domain : [domain],
      comment,
      groups: [0],
      enabled: true,
    });
    const resp = await this._request(`/api/domains/allow/${kind}`, {
      method: "POST",
      body,
    });
    if (resp.status === 409) {
      return { ok: true, alreadyExists: true };
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Allowlist add failed (HTTP ${resp.status}): ${text}`);
    }
    const data = await resp.json().catch(() => ({}));
    return { ok: true, alreadyExists: false, data };
  }

  async removeAllow(domain, { kind = "exact" } = {}) {
    const encoded = encodeURIComponent(domain);
    const resp = await this._request(`/api/domains/allow/${kind}/${encoded}`, {
      method: "DELETE",
    });
    if (resp.status === 404) {
      return { ok: true, notFound: true };
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Allowlist remove failed (HTTP ${resp.status}): ${text}`);
    }
    return { ok: true, notFound: false };
  }

  async logout() {
    if (!this.sid) return;
    try {
      await fetch(`${this.baseUrl}/api/auth`, {
        method: "DELETE",
        headers: { "X-FTL-SID": this.sid },
      });
    } catch {
      /* ignore */
    }
    this.sid = null;
    this.sidExpiresAt = 0;
    await clearCachedSid();
  }
}

export function domainToRegex(domain) {
  // Matches the exact domain and all subdomains.
  const escaped = domain.replace(/[.\\+*?^$()[\]{}|]/g, "\\$&");
  return `(\\.|^)${escaped}$`;
}
