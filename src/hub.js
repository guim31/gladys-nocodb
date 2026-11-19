// -----------------------------------------------------------------------------
// The NocoDB hub: reads the tables followed on a timer of the container, at
// the interval chosen in the configuration; publishes the states of the added
// devices when they change; fires the scene events "New NocoDB row" and
// "NocoDB rows above a threshold"; holds the tables followed (stored under
// /data), and runs the configuration actions.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 15 minutes, beyond the fixed list of the core scheduler.
//
// One read of a table = a count (of the view), the first row of the view when
// a field is followed, and the rows added since the last read when the table
// has a numeric primary key. Reads and writes run one at a time (`exclusive`),
// so a row added by a scene is known before the next read looks for new rows.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  buildTableDevice,
  cellState,
  fieldKind,
  followName,
  parseTableId,
  rowsFeatureId,
  tableIds,
  valueFeatureId,
} from './devices.js';
import { FailureLog } from './logs.js';
import { ERROR_KINDS, NocoDbClient, NocoDbError, SERVER_KINDS, asNocoDbError } from './nocodb.js';
import {
  ACTION_TEXT,
  ActionFailure,
  CONNECTION_TEXT,
  FEATURE_TEXT,
  errorText,
  inEveryLanguage,
  join,
  pick,
  report,
} from './texts.js';

const logger = createLogger({ name: 'nocodb-hub' });

export const WIDGET_KEY = 'tables';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({ NEW_ROW: 'new_row', COUNT_ABOVE: 'count_above' });

export const MAX_FOLLOWS = 30;
// New rows announced per table and per read; the next ones at the next read.
export const MAX_NEW_ROWS = 10;
export const MAX_EVENT_TEXT = 1000;

export const HUB_TIMINGS = {
  heartbeatMs: 6 * 3600_000,
};

/** The id of a table followed: table, view and field, hashed. */
export const followId = (tableId, viewId, field) =>
  createHash('sha1')
    .update(`${tableId}|${viewId ?? ''}|${field ?? ''}`)
    .digest('hex')
    .slice(0, 12);

const same = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.trim().toLowerCase() === b.trim().toLowerCase();
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * A row as JSON of MAX_EVENT_TEXT characters at most, and still valid JSON:
 * the longest values are cut first.
 */
export function rowJson(row) {
  const json = JSON.stringify(row);
  if (json.length <= MAX_EVENT_TEXT) return json;
  const short = {};
  for (const [key, value] of Object.entries(row)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    short[key] = text && text.length > 80 ? `${text.slice(0, 79)}…` : value;
  }
  let result = JSON.stringify(short);
  const keys = Object.keys(short);
  while (result.length > MAX_EVENT_TEXT && keys.length > 0) {
    delete short[keys.pop()];
    result = JSON.stringify(short);
  }
  return result;
}

/** Whether the rows of a table have increasing numeric ids (new rows can be found). */
function numericKey(column) {
  return Boolean(column && (column.ai || /int|serial|number|decimal/i.test(column.dt ?? '')));
}

export class NocoDbHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {import('./store.js').Store} options.store
   * @param {typeof fetch} [options.fetch] test seam
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {() => number} [options.now] clock
   */
  constructor({ gladys, store, fetch, timers = true, timings, now = () => Date.now() }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetch;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now;
    this.config = normalizeConfig({});
    this.client = null;
    /** @type {Map<string, object>} tables followed, by follow id */
    this.follows = new Map();
    /** @type {Map<string, { count?: number, value?: any, error?: string, at: number }>} */
    this.readings = new Map();
    /** @type {Map<string, number>} last count read per follow (threshold) */
    this.lastCounts = new Map();
    this.reading = false;
    /** @type {Map<string, Set<string>>} rows added by the scene actions, per table */
    this.ownRows = new Map();
    this.serverError = null;
    this.lastStatus = null;
    this.failures = new FailureLog(logger);
    this.queue = Promise.resolve();
    this.timer = null;
    this.stopped = false;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    for (const spec of Array.isArray(saved.follows) ? saved.follows : []) {
      if (spec && typeof spec.id === 'string' && typeof spec.tableId === 'string') {
        this.follows.set(spec.id, spec);
      }
    }
    await this.apply(config);
  }

  /** A reconnection to Gladys: send again what Gladys may have lost. */
  async resync(config) {
    this.lastStatus = null;
    this.gladys.forgetPublishedStates?.();
    await this.apply(config);
  }

  async reconfigure(config) {
    await this.apply(config);
  }

  async apply(config) {
    this.config = config;
    this.client =
      config.url && config.token
        ? new NocoDbClient({ url: config.url, token: config.token, fetch: this.fetch })
        : null;
    this.serverError = null;
    this.readings.clear();
    if (this.client) {
      logger.info(`NocoDB at ${config.url}, ${this.follows.size} table(s) followed`);
    }
    try {
      await this.rediscover();
      await this.pollAll();
    } finally {
      // Whatever the first read gave, the timer reads again later.
      this.schedule();
    }
  }

  schedule() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setInterval(() => {
      // A read still running (a slow server, many tables): skip this tick
      // rather than pile reads up in front of the scene actions.
      if (this.reading) return;
      this.pollAll().catch((err) => this.failures.fail('loop', `Reading loop: ${err.message}`));
    }, this.config.pollIntervalMs);
    this.timer.unref?.();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = null;
    await this.queue.catch(() => {});
    await this.store.flush();
  }

  /** Runs `fn` after the reads and writes in progress: one at a time. */
  exclusive(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  save() {
    return this.store.save({ follows: [...this.follows.values()] });
  }

  // --- Connection status ------------------------------------------------------

  /** Why there is no usable server, before any request (null when configured). */
  configProblem() {
    if (!this.config.urlTyped) return CONNECTION_TEXT.noUrl;
    if (!this.config.url) return CONNECTION_TEXT.badUrl;
    if (!this.config.token) return CONNECTION_TEXT.noToken;
    return null;
  }

  /** The connection status shown in the configuration screen. */
  connectionStatus() {
    const problem = this.configProblem();
    if (problem) return { connected: false, message: problem };
    if (this.serverError) return { connected: false, message: errorText(this.serverError) };
    return { connected: true };
  }

  /** The text of the current problem of the server, null when there is none. */
  errorText(language) {
    const status = this.connectionStatus();
    return status.connected ? null : pick(status.message, language);
  }

  async publishStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.lastStatus) return;
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.lastStatus = key;
      this.failures.recover('status');
    } catch (err) {
      this.failures.fail('status', `Connection status refused by Gladys: ${err.message}`);
    }
  }

  // --- Reading ------------------------------------------------------------------

  /** Reads every table followed, publishes what changed. */
  pollAll() {
    this.reading = true;
    const run = this.exclusive(() => this.readAll());
    run
      .finally(() => {
        this.reading = false;
      })
      .catch(() => {});
    return run;
  }

  async readAll() {
    if (!this.client || this.stopped) {
      await this.publishStatus();
      return;
    }
    try {
      if (this.follows.size === 0) {
        // Nothing to read: the list of bases checks the address and the token.
        await this.client.listBases();
      }
      for (const spec of this.follows.values()) {
        await this.readFollow(spec);
      }
      this.setServerError(null);
    } catch (err) {
      // A table's own failure never comes here (readFollow keeps it): what
      // does, even unexpected, stops this read and shows in the status.
      this.setServerError(asNocoDbError(err));
    }
    await this.publishStatus();
    await this.publishStates();
  }

  setServerError(error) {
    if (error) {
      this.failures.fail('server', `NocoDB: ${error.message}`);
      if (this.serverError !== error.kind) {
        this.serverError = error.kind;
        this.gladys.requestWidgetRefresh(WIDGET_KEY);
      }
      return;
    }
    if (this.failures.recover('server', 'NocoDB answers again')) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
    this.serverError = null;
  }

  /**
   * Reads one table followed. A failure of the server is thrown (the whole
   * read stops); a failure of the table (deleted, view deleted) is its own.
   */
  async readFollow(spec) {
    const previous = this.readings.get(spec.id);
    // The last count read, kept across a failed read and a reconfiguration:
    // a threshold crossed meanwhile is not lost.
    const before = this.lastCounts.get(spec.id);
    try {
      const count = await this.client.count(spec.tableId, { viewId: spec.viewId });
      let value = null;
      if (spec.field) {
        const [row] = await this.client.list(spec.tableId, {
          viewId: spec.viewId,
          limit: 1,
          fields: spec.field,
        });
        value = row ? cellState(spec.fieldKind, row[spec.field]) : null;
        if (!row && spec.fieldKind === 'text') {
          // The view is empty ("tasks to do": all done): say it, rather than
          // keep showing the last title.
          value = { text: (FEATURE_TEXT[this.config.language] ?? FEATURE_TEXT.en).empty };
        }
      }
      await this.findNewRows(spec);
      this.readings.set(spec.id, { count, value, at: this.now() });
      this.lastCounts.set(spec.id, count);
      if (this.failures.recover(`follow:${spec.id}`, `"${followName(spec)}" can be read again`)) {
        this.gladys.requestWidgetRefresh(WIDGET_KEY);
      }
      await this.checkThreshold(spec, before, count);
      if (previous?.count !== count || JSON.stringify(previous?.value) !== JSON.stringify(value)) {
        this.gladys.requestWidgetRefresh(WIDGET_KEY);
      }
    } catch (err) {
      const error = asNocoDbError(err);
      if (SERVER_KINDS.has(error.kind)) throw error;
      this.readings.set(spec.id, { error: error.kind, at: this.now() });
      this.failures.fail(
        `follow:${spec.id}`,
        `"${followName(spec)}" cannot be read: ${error.message}`,
      );
      if (!previous?.error) this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /**
   * The rows added since the last read (primary key above the last seen),
   * oldest first: one "New NocoDB row" event each, except the rows added by
   * the scene actions of the integration (no loop through a scene).
   */
  async findNewRows(spec) {
    if (!spec.pk || !spec.pkNumeric) return;
    if (spec.lastId === undefined || spec.lastId === null) {
      // First read: remember where the table is, announce nothing.
      const [last] = await this.client.list(spec.tableId, {
        sort: `-${spec.pk}`,
        limit: 1,
        fields: spec.pk,
      });
      spec.lastId = Number(last?.[spec.pk] ?? 0) || 0;
      await this.save();
      return;
    }
    const rows = await this.client.list(spec.tableId, {
      viewId: spec.viewId,
      where: `(${spec.pk},gt,${spec.lastId})`,
      sort: spec.pk,
      limit: MAX_NEW_ROWS,
    });
    if (rows.length === 0) return;
    const own = this.ownRows.get(spec.tableId) ?? new Set();
    const externalId = tableIds(this.gladys, spec.id).device;
    for (const row of rows) {
      const id = Number(row[spec.pk]);
      if (!Number.isFinite(id)) continue;
      if (!own.has(String(id))) {
        const title = spec.display ? row[spec.display] : null;
        const sent = await this.event(TRIGGERS.NEW_ROW, {
          device: externalId,
          table: followName(spec),
          id: String(id),
          title:
            title === null || title === undefined ? '' : String(title).slice(0, MAX_EVENT_TEXT),
          row: rowJson(row),
        });
        // Refused by Gladys (restarting, 429): announced again at the next read.
        if (!sent) break;
      }
      spec.lastId = Math.max(spec.lastId, id);
    }
    await this.save();
  }

  /** "Rows above a threshold": once per crossing, upwards, never at the first read. */
  async checkThreshold(spec, before, count) {
    if (spec.threshold === null || spec.threshold === undefined || before === undefined) return;
    if (before <= spec.threshold && count > spec.threshold) {
      await this.event(TRIGGERS.COUNT_ABOVE, {
        device: tableIds(this.gladys, spec.id).device,
        table: followName(spec),
        count,
        threshold: spec.threshold,
      });
    }
  }

  async event(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      logger.debug(`Scene event ${key} for ${data.table}`);
      this.failures.recover(`event:${key}`);
      return true;
    } catch (err) {
      this.failures.fail(`event:${key}`, `Scene event ${key} refused by Gladys: ${err.message}`);
      return false;
    }
  }

  // --- States and devices --------------------------------------------------------

  /** The follows whose device is added in Gladys. */
  addedFollows() {
    const ids = new Set(
      (this.gladys.devices ?? []).map((device) => parseTableId(this.gladys, device.external_id)),
    );
    return [...this.follows.values()].filter((spec) => ids.has(spec.id));
  }

  statesOf(spec) {
    const reading = this.readings.get(spec.id);
    if (!reading || reading.error) return [];
    const states = [
      { device_feature_external_id: rowsFeatureId(this.gladys, spec), state: reading.count },
    ];
    const value = reading.value;
    if (spec.field && value !== null && value !== undefined) {
      const id = valueFeatureId(this.gladys, spec);
      states.push(
        typeof value === 'object'
          ? { device_feature_external_id: id, text: value.text }
          : { device_feature_external_id: id, state: value },
      );
    }
    return states;
  }

  async publishStates(specs = this.addedFollows()) {
    const states = specs.flatMap((spec) => this.statesOf(spec));
    if (states.length === 0) return;
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.failures.recover('states', 'Gladys accepts the states again');
    } catch (err) {
      this.failures.fail('states', `States refused by Gladys: ${err.message}`);
    }
  }

  async rediscover() {
    const devices = [...this.follows.values()].map((spec) =>
      buildTableDevice(this.gladys, spec, this.config.language),
    );
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.failures.recover('discovery');
    } catch (err) {
      this.failures.fail('discovery', `Discovered devices refused by Gladys: ${err.message}`);
    }
  }

  /** A device added (or updated) in Gladys: send its states now. */
  async onDeviceCreated(device) {
    const spec = this.follows.get(parseTableId(this.gladys, device?.external_id));
    if (spec) {
      if (!this.readings.has(spec.id) && this.client) {
        await this.exclusive(() => this.readFollow(spec)).catch(() => {});
      }
      await this.publishStates([spec]);
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** onPoll, should Gladys poll anyway: a fresh reading is only published again. */
  async pollDevice(device) {
    const spec = this.follows.get(parseTableId(this.gladys, device?.external_id));
    if (!spec || !this.client) return;
    const reading = this.readings.get(spec.id);
    if (!reading || this.now() - reading.at >= this.config.pollIntervalMs / 2) {
      await this.exclusive(() => this.readFollow(spec)).catch(() => {});
    }
    await this.publishStates([spec]);
  }

  /** The follow behind a device chosen in a scene. */
  followOfDevice(externalId) {
    return this.follows.get(parseTableId(this.gladys, externalId)) ?? null;
  }

  /** After a write of a scene: the row is ours, the tables are read again. */
  async afterWrite(tableId, createdId) {
    if (createdId !== undefined && createdId !== null) {
      const own = this.ownRows.get(tableId) ?? new Set();
      own.add(String(createdId));
      // Bounded: only the rows not announced yet matter.
      if (own.size > 200) own.delete(own.values().next().value);
      this.ownRows.set(tableId, own);
    }
    for (const spec of this.follows.values()) {
      if (spec.tableId === tableId) {
        await this.readFollow(spec).catch(() => {});
      }
    }
    await this.publishStates();
  }

  // --- Configuration actions ------------------------------------------------------

  requireClient() {
    const problem = this.configProblem();
    if (problem) throw new ActionFailure(problem);
  }

  /** A NocoDbError as an ActionFailure, in every language. */
  static failure(err) {
    const error = asNocoDbError(err);
    return new ActionFailure(errorText(error.kind));
  }

  /** Every table of every base the token sees: [{ base, table }]. */
  async allTables() {
    const tables = [];
    for (const base of await this.client.listBases()) {
      for (const table of await this.client.listTables(base.id)) {
        tables.push({ base, table });
      }
    }
    return tables;
  }

  async testConnection() {
    this.requireClient();
    return this.exclusive(async () => {
      let tables;
      let version;
      try {
        version = await this.client.version().catch(() => null);
        tables = await this.allTables();
      } catch (err) {
        const error = asNocoDbError(err);
        if (SERVER_KINDS.has(error.kind)) this.setServerError(error);
        await this.publishStatus();
        throw NocoDbHub.failure(error);
      }
      this.setServerError(null);
      await this.readAll();
      const bases = new Set(tables.map(({ base }) => base.id)).size;
      const names = tables.map(({ base, table }) => `${base.title} / ${table.title}`);
      const lines = [report('connected', version, bases, tables.length)];
      if (names.length > 0) {
        const shown = names.slice(0, 20).join(', ') + (names.length > 20 ? ', …' : '');
        lines.push(join(report('tables'), shown));
      }
      lines.push(report('followed', this.follows.size));
      for (const spec of this.follows.values()) {
        const reading = this.readings.get(spec.id);
        if (reading?.error) {
          lines.push(join(report('problem', followName(spec)), errorText(reading.error)));
        }
      }
      if (this.serverError) {
        lines.push(errorText(this.serverError));
      }
      logger.info(`Connection tested: ${tables.length} table(s)`);
      return inEveryLanguage((lang) => lines.map((line) => line[lang]).join('\n'));
    });
  }

  /** The table typed by the user: an id, a name, or "Base / Table". */
  async findTable(input) {
    if (/^m[a-z0-9]{8,}$/.test(input)) {
      try {
        return await this.client.getTable(input);
      } catch (err) {
        if (asNocoDbError(err).kind !== ERROR_KINDS.NOT_FOUND) throw err;
      }
    }
    const tables = await this.allTables();
    const slash = input.lastIndexOf('/');
    let found = tables.filter(({ table }) => same(table.title, input));
    if (found.length === 0 && slash > 0) {
      const base = input.slice(0, slash);
      const table = input.slice(slash + 1);
      found = tables.filter(
        (entry) => same(entry.base.title, base) && same(entry.table.title, table),
      );
    }
    if (found.length === 0) throw new ActionFailure(ACTION_TEXT.tableNotFound);
    if (found.length > 1) throw new ActionFailure(ACTION_TEXT.tableAmbiguous);
    return this.client.getTable(found[0].table.id);
  }

  async follow(fields) {
    this.requireClient();
    const input = text(fields.table);
    if (!input) throw new ActionFailure(ACTION_TEXT.noTable);
    let threshold = null;
    const rawThreshold = text(String(fields.threshold ?? ''));
    if (rawThreshold) {
      if (!/^\d{1,9}$/.test(rawThreshold)) throw new ActionFailure(ACTION_TEXT.badThreshold);
      threshold = Number(rawThreshold);
    }
    return this.exclusive(async () => {
      let table;
      try {
        table = await this.findTable(input);
      } catch (err) {
        if (err instanceof ActionFailure) throw err;
        throw NocoDbHub.failure(err);
      }
      const viewInput = text(fields.view);
      let view = null;
      if (viewInput) {
        view = table.views.find((entry) => entry.id === viewInput || same(entry.title, viewInput));
        if (!view) throw new ActionFailure(ACTION_TEXT.viewNotFound);
      }
      const fieldInput = text(fields.field);
      let column = null;
      if (fieldInput) {
        column = table.columns.find(
          (entry) => same(entry.title, fieldInput) || same(entry.column_name, fieldInput),
        );
        if (!column) throw new ActionFailure(ACTION_TEXT.fieldNotFound);
      }
      const id = followId(table.id, view?.id, column?.title);
      const existing = this.follows.get(id);
      if (!existing && this.follows.size >= MAX_FOLLOWS) {
        throw new ActionFailure(ACTION_TEXT.tooMany);
      }
      const pk = table.columns.find((entry) => entry.pk);
      const display = table.columns.find((entry) => entry.pv);
      const spec = {
        id,
        tableId: table.id,
        tableTitle: String(table.title ?? table.id),
        viewId: view?.id ?? null,
        viewTitle: view ? String(view.title) : null,
        field: column?.title ?? null,
        fieldKind: column ? fieldKind(column.uidt) : null,
        pk: pk?.title ?? null,
        pkNumeric: numericKey(pk),
        display: display?.title ?? null,
        threshold,
        name: text(fields.name).slice(0, 100) || null,
        // A new row is one above the last id seen: kept when following again.
        lastId: existing?.lastId ?? null,
      };
      this.follows.set(id, spec);
      await this.save();
      this.readings.delete(id);
      await this.rediscover();
      await this.readFollow(spec).catch((err) => this.setServerError(asNocoDbError(err)));
      await this.publishStatus();
      await this.publishStates();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      logger.info(`Table "${followName(spec)}" ${existing ? 'updated' : 'followed'}`);
      return report(existing ? 'updated' : 'followedNow', followName(spec));
    });
  }

  async unfollow(fields) {
    const input = text(fields.table);
    if (!input) throw new ActionFailure(ACTION_TEXT.noTable);
    const viewInput = text(fields.view);
    const fieldInput = text(fields.field);
    const matches = [...this.follows.values()].filter((spec) => {
      const tableMatches =
        spec.tableId === input ||
        same(spec.tableTitle, input) ||
        same(spec.name, input) ||
        same(followName(spec), input);
      const viewMatches = viewInput
        ? spec.viewId === viewInput || same(spec.viewTitle, viewInput)
        : !spec.viewId || same(spec.name, input) || same(followName(spec), input);
      const fieldMatches = fieldInput
        ? same(spec.field, fieldInput)
        : !spec.field || same(spec.name, input) || same(followName(spec), input);
      return tableMatches && viewMatches && fieldMatches;
    });
    if (matches.length !== 1) throw new ActionFailure(ACTION_TEXT.notFollowed);
    const [spec] = matches;
    return this.exclusive(async () => {
      this.follows.delete(spec.id);
      this.readings.delete(spec.id);
      this.lastCounts.delete(spec.id);
      this.failures.recover(`follow:${spec.id}`);
      await this.save();
      await this.rediscover();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      logger.info(`Table "${followName(spec)}" no longer followed`);
      return report('unfollowed', followName(spec));
    });
  }
}

export { NocoDbError };
