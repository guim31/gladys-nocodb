// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One NocoDB server (self-hosted, or NocoDB Cloud) and one API token. The
// tables followed are not configuration fields (Gladys has no list field):
// the "Follow a table" action stores them under /data, see src/hub.js.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '300', '900'];

export const DEFAULT_CONFIG = {
  url: '',
  api_token: '',
  poll_interval: '60',
  language: 'fr',
};

/**
 * The address typed by the user, as an origin plus an optional path prefix
 * (a NocoDB behind a reverse proxy under /nocodb). No scheme: http. The
 * credentials of a URL are refused: they would end in the logs.
 * @returns {string|null} e.g. "http://192.0.2.10:8080", null when unusable
 */
export function parseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  let text = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    text = `http://${text}`;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return null;
  }
  // The address of the web interface is often pasted with its #/ route.
  const path = url.pathname.replace(/\/(dashboard\/?)?$/, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** The configuration as the code uses it. */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  const interval = POLL_INTERVALS.includes(String(config.poll_interval))
    ? Number(config.poll_interval)
    : Number(DEFAULT_CONFIG.poll_interval);
  return {
    url: parseUrl(config.url),
    // Typed in the configuration: kept as typed, minus surrounding blanks.
    urlTyped: typeof config.url === 'string' ? config.url.trim() : '',
    token: typeof config.api_token === 'string' ? config.api_token.trim() : '',
    pollIntervalMs: interval * 1000,
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
  };
}
