// -----------------------------------------------------------------------------
// NocoDB REST client (API v2, the one of the NocoDB 0.2xx and 2025+ releases):
// an `xc-token` API token, one deadline per request, and every failure turned
// into a NocoDbError of a known kind, so the hub, the scene actions and the
// widget explain it in the language of the user.
//
// Endpoints used (all documented, all stable since NocoDB 0.204):
//   GET   /api/v1/version                          server version (no token)
//   GET   /api/v2/meta/bases                       bases of the token's user
//   GET   /api/v2/meta/bases/{base}/tables         tables of a base
//   GET   /api/v2/meta/tables/{table}              columns and views of a table
//   GET   /api/v2/tables/{table}/records/count     row count (of a view)
//   GET   /api/v2/tables/{table}/records           rows (of a view)
//   POST  /api/v2/tables/{table}/records           add a row
//   PATCH /api/v2/tables/{table}/records           update a row
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  AUTH: 'auth',
  NOT_FOUND: 'not_found',
  INVALID: 'invalid',
  RATE_LIMITED: 'rate_limited',
  UNREACHABLE: 'unreachable',
  TIMEOUT: 'timeout',
  NOT_NOCODB: 'not_nocodb',
  SERVER_ERROR: 'server_error',
  OTHER: 'other',
});

// The failures of the server itself (as opposed to a table or a row).
export const SERVER_KINDS = new Set([
  ERROR_KINDS.AUTH,
  ERROR_KINDS.RATE_LIMITED,
  ERROR_KINDS.UNREACHABLE,
  ERROR_KINDS.TIMEOUT,
  ERROR_KINDS.NOT_NOCODB,
  ERROR_KINDS.SERVER_ERROR,
]);

export const REQUEST_TIMEOUT_MS = 10_000;

export class NocoDbError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message never holds the token
   * @param {{ status?: number, code?: string, detail?: string }} [extra]
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'NocoDbError';
    this.kind = kind;
    this.status = extra.status ?? null;
    // NocoDB's own error code: ERR_TABLE_NOT_FOUND, ERR_VIEW_NOT_FOUND...
    this.code = extra.code ?? null;
    // NocoDB's message, in English (shown with a scene action's failure).
    this.detail = extra.detail ?? null;
  }
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ECONNRESET',
  'EPIPE',
]);

function kindOfStatus(status) {
  if (status === 401 || status === 403) return ERROR_KINDS.AUTH;
  if (status === 404) return ERROR_KINDS.NOT_FOUND;
  if (status === 400 || status === 422) return ERROR_KINDS.INVALID;
  if (status === 429) return ERROR_KINDS.RATE_LIMITED;
  if (status >= 500) return ERROR_KINDS.SERVER_ERROR;
  // A redirection is not followed: the token would go to another host.
  if (status >= 300 && status < 400) return ERROR_KINDS.NOT_NOCODB;
  return ERROR_KINDS.OTHER;
}

/** A thrown fetch error as a NocoDbError (the URL is never part of it). */
export function asNocoDbError(err) {
  if (err instanceof NocoDbError) {
    return err;
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new NocoDbError(ERROR_KINDS.TIMEOUT, 'NocoDB did not answer in time');
  }
  const code = err?.cause?.code ?? err?.code;
  if (NETWORK_CODES.has(code) || /certificate|SSL|TLS/i.test(err?.cause?.message ?? '')) {
    return new NocoDbError(ERROR_KINDS.UNREACHABLE, `NocoDB unreachable (${code ?? 'TLS'})`);
  }
  if (err instanceof TypeError) {
    return new NocoDbError(ERROR_KINDS.UNREACHABLE, `NocoDB unreachable (${code ?? 'network'})`);
  }
  return new NocoDbError(ERROR_KINDS.OTHER, err?.message ?? String(err));
}

export class NocoDbClient {
  /**
   * @param {{ url: string, token: string, fetch?: typeof fetch, timeoutMs?: number }} options
   */
  constructor({ url, token, fetch: fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS }) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, { query, body, auth = true } = {}) {
    const url = new URL(`${this.url}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    const headers = { accept: 'application/json' };
    if (auth) headers['xc-token'] = this.token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
        // Never follow a redirection: undici would send the xc-token header to the
        // new host too.
        redirect: 'manual',
      });
    } catch (err) {
      throw asNocoDbError(err);
    }
    let text;
    try {
      text = await response.text();
    } catch (err) {
      throw asNocoDbError(err);
    }
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // A web page where JSON was expected: another server at this address.
      if (response.ok || response.status === 404) {
        throw new NocoDbError(ERROR_KINDS.NOT_NOCODB, 'The answer is not NocoDB JSON', {
          status: response.status,
        });
      }
    }
    // NocoDB answers an unknown route with a 404 without its error code
    // ({"msg": "Cannot GET /..."}): a wrong path, not a missing table.
    if (response.status === 404 && typeof data?.error !== 'string') {
      throw new NocoDbError(ERROR_KINDS.NOT_NOCODB, 'Unknown NocoDB route (wrong path?)', {
        status: 404,
      });
    }
    if (!response.ok) {
      const detail = typeof data?.msg === 'string' ? data.msg : data?.message;
      throw new NocoDbError(
        kindOfStatus(response.status),
        `NocoDB answered ${response.status}${data?.error ? ` ${data.error}` : ''}`,
        {
          status: response.status,
          code: typeof data?.error === 'string' ? data.error : null,
          detail: typeof detail === 'string' ? detail.slice(0, 160) : null,
        },
      );
    }
    if (data === null || typeof data !== 'object') {
      throw new NocoDbError(ERROR_KINDS.NOT_NOCODB, 'The answer is not NocoDB JSON', {
        status: response.status,
      });
    }
    return data;
  }

  /** The server version, e.g. "2026.10.2" (null when the server does not say). */
  async version() {
    const data = await this.request('GET', '/api/v1/version', { auth: false });
    return typeof data.currentVersion === 'string' ? data.currentVersion : null;
  }

  async listBases() {
    const data = await this.request('GET', '/api/v2/meta/bases');
    return Array.isArray(data.list) ? data.list : [];
  }

  async listTables(baseId) {
    const data = await this.request(
      'GET',
      `/api/v2/meta/bases/${encodeURIComponent(baseId)}/tables`,
    );
    return Array.isArray(data.list) ? data.list : [];
  }

  /** A table with its `columns` and `views`. */
  async getTable(tableId) {
    const data = await this.request('GET', `/api/v2/meta/tables/${encodeURIComponent(tableId)}`);
    return {
      ...data,
      columns: Array.isArray(data.columns) ? data.columns : [],
      views: Array.isArray(data.views) ? data.views : [],
    };
  }

  /** Rows of the table, or of one of its views (filters and sorts of the view). */
  async count(tableId, { viewId, where } = {}) {
    const data = await this.request(
      'GET',
      `/api/v2/tables/${encodeURIComponent(tableId)}/records/count`,
      { query: { viewId, where } },
    );
    const count = Number(data.count);
    if (!Number.isFinite(count)) {
      throw new NocoDbError(ERROR_KINDS.NOT_NOCODB, 'No count in the answer');
    }
    return count;
  }

  async list(tableId, { viewId, where, sort, limit, fields } = {}) {
    const data = await this.request(
      'GET',
      `/api/v2/tables/${encodeURIComponent(tableId)}/records`,
      {
        query: { viewId, where, sort, limit, fields },
      },
    );
    return Array.isArray(data.list) ? data.list : [];
  }

  /** Adds a row; resolves with what NocoDB answers: its primary key, e.g. { Id: 7 }. */
  async create(tableId, row) {
    return this.request('POST', `/api/v2/tables/${encodeURIComponent(tableId)}/records`, {
      body: row,
    });
  }

  /** Updates a row; `row` carries its primary key. */
  async update(tableId, row) {
    return this.request('PATCH', `/api/v2/tables/${encodeURIComponent(tableId)}/records`, {
      body: row,
    });
  }
}
