# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

Initial release.

### Added

- Per-tab failed-request collection via `webRequest.onErrorOccurred` and 5xx
  detection through `webRequest.onCompleted`
- Pi-hole v6 API client with session caching (`POST /api/auth`,
  `GET /api/queries`, `POST /api/domains/allow/{exact|regex}`,
  `DELETE /api/domains/allow/{kind}/{domain}`, `GET /api/auth/sessions`)
- Confidence-ranked suggestions correlating browser failures with blocked
  Pi-hole queries in the same time window
- Heuristic scoring with CDN/payment/auth/captcha boost lists and
  analytics/tracker/ad suppression lists
- CNAME-aware suggestions: surfaces the asked-for domain on `*_CNAME` blocks
- DNS-failure (`NS_ERROR_UNKNOWN_HOST`) boost as the strongest Pi-hole-block
  signal
- Subdomain aggregation per registrable domain
- One-click allow with "Allow whole site" toggle (regex)
- Manual domain entry in the popup
- Mute list to hide noisy suggestions
- Recently-allowed list with one-click Undo (via `DELETE /api/domains/...`)
- Live updates: popup re-renders when new failures arrive
- Auto-detect client IP (session endpoint first, DNS-probe fallback)
- Toolbar badge with per-tab failure count
- Keyboard shortcut `Ctrl+Shift+Y` / `Cmd+Shift+Y`
- Dark mode (`prefers-color-scheme`)
- URL normalization (auto-prepend `http://`)
- Translated error messages for network/TLS failures
- Filter-out for internal browser tabs (`about:`, `moz-extension:`, etc.)
- Setting to disable the toolbar badge (failure count overlay) with live update
- Pi-hole-themed logo (red gradient + π + green "allow" badge), later
  redesigned as a violet shield in the Bitwarden/uBO style
- Toolbar badge styled in the uBO convention (grey `#666666` background,
  white text, count = unique sites with failures rather than raw request count)
- i18n: English (default) and German locale files, with `_locales/` shipping
  in the build artifact; all popup and settings UI strings are translatable
- GitHub issue templates (bug report, feature request) and PR template under
  `.github/`
- Documentation: screenshots section in the README with placeholder paths
  pointing at `docs/`, plus a capture guide in `docs/README.md`
- Tab-scoped filter (`strictMatch`, default on): only suggest blocked domains
  the browser actually requested in the current tab. Eliminates noise from
  other apps on the same machine (Slack, WhatsApp, Spotify, OS telemetry, …)
  that share the Pi-hole client IP. Filtered-out count is shown in the popup
  footer ("N hidden (other apps)").

[0.1.0]: https://github.com/REPLACE-ME/loophole-for-pihole/releases/tag/v0.1.0
