// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+): add a row to
// a table followed, update a row of it.
//
// The scene picks a table device (no free table id): only the tables followed
// are written. The values are JSON ({"Field": "value"}) or Field=value pairs
// separated by ";" or new lines, scene variables already substituted by
// Gladys. NocoDB silently drops the fields it does not know: they are checked
// against the columns of the table first, and refused with their names.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { followName } from './devices.js';
import { ERROR_KINDS, asNocoDbError } from './nocodb.js';
import { ACTION_TEXT, ActionFailure, errorText, join } from './texts.js';

const logger = createLogger({ name: 'nocodb-scenes' });

export const MAX_VALUES_LENGTH = 100_000;

// Columns NocoDB fills itself: never written by a scene.
const COMPUTED_UIDTS = new Set([
  'ID',
  'CreatedTime',
  'LastModifiedTime',
  'CreatedBy',
  'LastModifiedBy',
  'AutoNumber',
  'Formula',
  'Rollup',
  'Lookup',
  'Count',
  'Links',
  'LinkToAnotherRecord',
  'Barcode',
  'QrCode',
  'Button',
  'Order',
]);

const NUMERIC_UIDTS = new Set(['Number', 'Decimal', 'Currency', 'Percent', 'Rating', 'Duration']);
const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on', 'oui', 'vrai', 'ja', 'sí', 'si', 'x']);
const FALSE_WORDS = new Set(['0', 'false', 'no', 'off', 'non', 'faux', 'nein', '']);

/**
 * The values typed in the scene: a JSON object, or Field=value pairs.
 * @returns {{ values: Record<string, unknown>, typed: boolean }} typed: from JSON
 */
export function parseValues(raw) {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input) throw new ActionFailure(ACTION_TEXT.noValues);
  if (input.length > MAX_VALUES_LENGTH) throw new ActionFailure(ACTION_TEXT.badValues);
  if (input.startsWith('{')) {
    let values;
    try {
      values = JSON.parse(input);
    } catch {
      throw new ActionFailure(ACTION_TEXT.badValues);
    }
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new ActionFailure(ACTION_TEXT.badValues);
    }
    if (Object.keys(values).length === 0) throw new ActionFailure(ACTION_TEXT.noValues);
    return { values, typed: true };
  }
  const values = {};
  for (const part of input.split(/[;\n]/)) {
    if (!part.trim()) continue;
    const at = part.indexOf('=');
    if (at <= 0 || !part.slice(0, at).trim()) throw new ActionFailure(ACTION_TEXT.badValues);
    values[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  if (Object.keys(values).length === 0) throw new ActionFailure(ACTION_TEXT.noValues);
  return { values, typed: false };
}

/** A typed text value converted for its column (a number, a checkbox). */
function convert(column, value) {
  if (typeof value !== 'string') return value;
  if (column.uidt === 'Checkbox') {
    const word = value.toLowerCase();
    if (TRUE_WORDS.has(word)) return true;
    if (FALSE_WORDS.has(word)) return false;
    return value;
  }
  if (NUMERIC_UIDTS.has(column.uidt)) {
    if (value === '') return null;
    const number = Number(value.replace(',', '.'));
    return Number.isFinite(number) ? number : value; // NocoDB says what is wrong
  }
  return value;
}

/**
 * The row to send: every key matched to a column of the table (by title,
 * else by column name, case ignored), the computed columns refused.
 */
export function rowFor(columns, { values, typed }) {
  const row = {};
  const unknown = [];
  const computed = [];
  for (const [key, value] of Object.entries(values)) {
    const lower = key.toLowerCase();
    const column =
      columns.find((entry) => entry.title === key) ??
      columns.find(
        (entry) =>
          entry.title?.toLowerCase() === lower || entry.column_name?.toLowerCase() === lower,
      );
    if (!column) {
      unknown.push(key);
    } else if (
      column.system ||
      (column.pk && column.ai) ||
      (!column.pk && COMPUTED_UIDTS.has(column.uidt))
    ) {
      // A primary key typed by hand (a table of an external database) stays writable.
      computed.push(column.title);
    } else {
      row[column.title] = typed ? value : convert(column, value);
    }
  }
  if (unknown.length > 0) {
    throw new ActionFailure(join(ACTION_TEXT.unknownFields, unknown.join(', ').slice(0, 120)));
  }
  if (computed.length > 0) {
    throw new ActionFailure(join(ACTION_TEXT.readOnlyFields, computed.join(', ').slice(0, 120)));
  }
  return row;
}

/** A failure of NocoDB during a write, as an ActionFailure. */
function writeFailure(err) {
  const error = asNocoDbError(err);
  if (error.kind === ERROR_KINDS.NOT_FOUND && error.code === 'ERR_RECORD_NOT_FOUND') {
    return new ActionFailure(ACTION_TEXT.rowNotFound);
  }
  if (error.kind === ERROR_KINDS.INVALID) {
    return new ActionFailure(join(ACTION_TEXT.refused, error.detail ?? error.message));
  }
  return new ActionFailure(errorText(error.kind));
}

/** The table behind the device chosen in the scene, and its columns. */
async function target(hub, fields) {
  hub.requireClient();
  const spec = hub.followOfDevice(fields.device);
  if (!spec) throw new ActionFailure(ACTION_TEXT.unknownDevice);
  const values = parseValues(fields.values);
  let table;
  try {
    table = await hub.client.getTable(spec.tableId);
  } catch (err) {
    throw writeFailure(err);
  }
  return { spec, table, row: rowFor(table.columns, values) };
}

export const SCENE_ACTIONS = {
  async add_row(hub, { fields = {} }) {
    return hub.exclusive(async () => {
      const { spec, table, row } = await target(hub, fields);
      let answer;
      try {
        answer = await hub.client.create(spec.tableId, row);
      } catch (err) {
        throw writeFailure(err);
      }
      const pk = table.columns.find((entry) => entry.pk)?.title;
      const id = pk && answer?.[pk] !== undefined ? String(answer[pk]) : '';
      logger.debug(`Scene: row ${id} added to "${followName(spec)}"`);
      await hub.afterWrite(spec.tableId, id || null);
      return { id };
    });
  },

  async update_row(hub, { fields = {} }) {
    return hub.exclusive(async () => {
      const rawId = String(fields.row_id ?? '').trim();
      if (!rawId) throw new ActionFailure(ACTION_TEXT.noRowId);
      const { spec, table, row } = await target(hub, fields);
      const pk = table.columns.find((entry) => entry.pk);
      if (!pk) throw new ActionFailure(ACTION_TEXT.noPrimaryKey);
      let id = rawId;
      if (spec.pkNumeric || pk.ai) {
        if (!/^\d+$/.test(rawId)) throw new ActionFailure(ACTION_TEXT.rowNotFound);
        id = Number(rawId);
      }
      try {
        await hub.client.update(spec.tableId, { ...row, [pk.title]: id });
      } catch (err) {
        throw writeFailure(err);
      }
      logger.debug(`Scene: row ${id} of "${followName(spec)}" updated`);
      await hub.afterWrite(spec.tableId, null);
      return { id: String(id) };
    });
  },
};
