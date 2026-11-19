// -----------------------------------------------------------------------------
// An in-memory NocoDB behind a `fetch`: the endpoints the integration uses,
// with the bases, the table (columns, views) and the error bodies captured
// from a real NocoDB 2026.10.2 (test/fixtures/real/nocodb-2026.10.2.json).
// The "Todo" view keeps the rows whose Done is not checked, like the real
// view built for the capture.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const REAL = JSON.parse(
  readFileSync(new URL('../fixtures/real/nocodb-2026.10.2.json', import.meta.url), 'utf8'),
);

export const TOKEN = 'test-token-0123456789';
export const URL_BASE = 'http://192.0.2.10:8080';
export const BASE = REAL.tables.list[0].base_id;
export const TABLE = REAL.table.id;
export const VIEW_TODO = REAL.table.views.find((view) => view.title === 'Todo').id;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createFakeNocoDb() {
  const state = {
    token: TOKEN,
    down: false,
    slow: false,
    html: false,
    status: 0,
    wrongPath: false,
    requests: [],
    tables: new Map([
      [
        TABLE,
        {
          meta: structuredClone(REAL.table),
          rows: [
            { Id: 1, Title: 'Buy milk', Done: 1, Amount: 3 },
            { Id: 2, Title: 'Water plants', Done: 1, Amount: null },
            { Id: 3, Title: 'Fix door', Done: 0, Amount: null },
          ],
        },
      ],
    ]),
  };

  const visible = (table, viewId) => {
    if (!viewId) return [...table.rows];
    const view = table.meta.views.find((entry) => entry.id === viewId);
    if (!view) return null;
    return view.id === VIEW_TODO ? table.rows.filter((row) => !row.Done) : [...table.rows];
  };

  function where(rows, clause) {
    if (!clause) return rows;
    const match = clause.match(/^\((\w+),gt,(-?\d+)\)$/);
    if (!match) throw new Error(`fake NocoDB: where ${clause} not supported`);
    return rows.filter((row) => Number(row[match[1]]) > Number(match[2]));
  }

  function validate(table, body) {
    for (const [key, value] of Object.entries(body)) {
      const column = table.meta.columns.find((entry) => entry.title === key);
      if (column?.uidt === 'Number' && value !== null && !Number.isInteger(Number(value))) {
        return json(422, {
          error: 'ERR_INVALID_VALUE_FOR_FIELD',
          message: `Invalid value '${value}' for type 'Number' on column '${key}'`,
        });
      }
    }
    return null;
  }

  async function fetch(input, init = {}) {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    state.requests.push({
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    });
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.slow) {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }
    if (state.status) {
      // A proxy in front of a NocoDB that is down (502), a crash (500), a redirection.
      return new Response(state.status >= 500 ? 'Bad Gateway' : '', {
        status: state.status,
        headers: state.status < 400 ? { location: 'http://198.51.100.7/' } : {},
      });
    }
    if (state.wrongPath) {
      // What NocoDB answers to a route it does not know (captured).
      return json(404, { msg: `Cannot ${method} ${url.pathname}` });
    }
    if (state.html) {
      return new Response('<html>Not NocoDB</html>', { status: 200 });
    }
    const path = url.pathname;
    if (path === '/api/v1/version') return json(200, REAL.version);
    if (init.headers?.['xc-token'] !== state.token) {
      return json(REAL.errors.badToken.status, REAL.errors.badToken.body);
    }
    if (path === '/api/v2/meta/bases') return json(200, REAL.bases);
    let match = path.match(/^\/api\/v2\/meta\/bases\/([^/]+)\/tables$/);
    if (match) {
      const list = [...state.tables.values()]
        .filter((table) => table.meta.base_id === match[1])
        .map((table) => ({ ...REAL.tables.list[0], ...table.meta, columns: undefined }));
      return json(200, { list });
    }
    const notFound = (id) =>
      json(404, { error: 'ERR_TABLE_NOT_FOUND', message: `Table '${id}' not found` });
    match = path.match(/^\/api\/v2\/meta\/tables\/([^/]+)$/);
    if (match) {
      const table = state.tables.get(match[1]);
      return table ? json(200, table.meta) : notFound(match[1]);
    }
    match = path.match(/^\/api\/v2\/tables\/([^/]+)\/records(\/count)?$/);
    if (!match) return json(404, { msg: 'Not found' });
    const table = state.tables.get(match[1]);
    if (!table) return notFound(match[1]);
    const query = url.searchParams;
    if (method === 'GET') {
      let rows = visible(table, query.get('viewId'));
      if (!rows) return json(REAL.errors.viewNotFound.status, REAL.errors.viewNotFound.body);
      rows = where(rows, query.get('where'));
      if (match[2]) return json(200, { count: rows.length });
      const sort = query.get('sort');
      if (sort) {
        const key = sort.replace(/^-/, '');
        rows.sort((a, b) => (sort.startsWith('-') ? b[key] - a[key] : a[key] - b[key]));
      }
      const fields = query.get('fields')?.split(',');
      const list = rows
        .slice(0, Number(query.get('limit') ?? 25))
        .map((row) =>
          fields ? Object.fromEntries(fields.map((field) => [field, row[field] ?? null])) : row,
        );
      return json(200, { list, pageInfo: { totalRows: rows.length } });
    }
    const body = JSON.parse(init.body);
    const invalid = validate(table, body);
    if (invalid) return invalid;
    if (method === 'POST') {
      const id = Math.max(0, ...table.rows.map((row) => row.Id)) + 1;
      table.rows.push({ ...body, Id: id });
      return json(200, { Id: id });
    }
    if (method === 'PATCH') {
      const row = table.rows.find((entry) => entry.Id === body.Id);
      if (!row) {
        return json(404, {
          error: 'ERR_RECORD_NOT_FOUND',
          message: `Record '${body.Id}' not found`,
        });
      }
      Object.assign(row, body);
      return json(200, { Id: body.Id });
    }
    return json(404, { msg: 'Not found' });
  }

  /** A row added by someone else (the NocoDB interface, a script). */
  const addRow = (fields) => {
    const table = state.tables.get(TABLE);
    const id = Math.max(0, ...table.rows.map((row) => row.Id)) + 1;
    table.rows.push({ Done: 0, Amount: null, ...fields, Id: id });
    return id;
  };

  return { state, fetch, addRow };
}
