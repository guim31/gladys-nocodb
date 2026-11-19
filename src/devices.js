// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab (the user adds the ones to
// keep, nothing is created on their behalf): one device per table followed
// (with its view and field, if any), identity = a hash of table id, view id
// and field, never a label:
//   - `rows`: the number of rows of the table, or of the view (its filters);
//   - `value_<kind>` (when a field is chosen): that field in the first row of
//     the view (its sort), as a number, a yes/no or a text.
//
// Published with should_poll: false: the integration reads NocoDB on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORY,
  DEVICE_FEATURE_TYPES as TYPE,
} from '@gladysassistant/integration-sdk';
import { FEATURE_TEXT } from './texts.js';

export const TABLE_DEVICE = 'table';
export const MODEL = 'NocoDB table';
export const PARAMS = Object.freeze({ TABLE: 'TABLE', VIEW: 'VIEW', FIELD: 'FIELD' });

const BIG = 1e12;
export const MAX_TEXT_LENGTH = 255;

// NocoDB column types (uidt) read as numbers or as yes/no; the rest is text.
const NUMBER_UIDTS = new Set([
  'Number',
  'Decimal',
  'Currency',
  'Percent',
  'Rating',
  'Duration',
  'Year',
  'AutoNumber',
  'Count',
  'Rollup',
]);

/** How a field is shown in Gladys, from its NocoDB column type. */
export function fieldKind(uidt) {
  if (NUMBER_UIDTS.has(uidt)) return 'number';
  if (uidt === 'Checkbox') return 'binary';
  return 'text';
}

const FIELD_FEATURES = {
  number: { category: CATEGORY.UNKNOWN, type: TYPE.UNKNOWN.UNKNOWN, min: -BIG, max: BIG },
  binary: { category: CATEGORY.INPUT, type: TYPE.SENSOR.BINARY, min: 0, max: 1 },
  text: { category: CATEGORY.TEXT, type: TYPE.TEXT.TEXT, min: 0, max: 0 },
};

export const tableIds = (gladys, id) => gladys.externalIds(TABLE_DEVICE, id);
export const rowsFeatureId = (gladys, spec) => tableIds(gladys, spec.id).feature('rows');
export const valueFeatureId = (gladys, spec) =>
  tableIds(gladys, spec.id).feature(`value_${spec.fieldKind}`);

/** The follow id of a device external id, null when it is not a table of ours. */
export function parseTableId(gladys, externalId) {
  const prefix = tableIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return /^[0-9a-f]{12}$/.test(id) ? id : null;
}

/** The name proposed for a table followed: its own, or "Table (View) · Field". */
export function followName(spec) {
  if (spec.name) return spec.name;
  const view = spec.viewTitle ? ` (${spec.viewTitle})` : '';
  const field = spec.field ? ` · ${spec.field}` : '';
  return `${spec.tableTitle}${view}${field}`.slice(0, 100);
}

const readOnly = { read_only: true, has_feedback: false };

/** The discovery payload of a table followed. */
export function buildTableDevice(gladys, spec, language) {
  const ids = tableIds(gladys, spec.id);
  const text = FEATURE_TEXT[language] ?? FEATURE_TEXT.en;
  const features = [
    {
      name: text.rows,
      external_id: ids.feature('rows'),
      category: CATEGORY.COUNTER_SENSOR,
      type: TYPE.SENSOR.INTEGER,
      ...readOnly,
      keep_history: true,
      min: 0,
      max: BIG,
    },
  ];
  if (spec.field) {
    const kind = FIELD_FEATURES[spec.fieldKind];
    features.push({
      // Never the name of the rows feature (two features of the same name).
      name: (text.value(spec.field) === text.rows ? `${spec.field} ·` : spec.field).slice(0, 100),
      external_id: valueFeatureId(gladys, spec),
      category: kind.category,
      type: kind.type,
      ...readOnly,
      // A text has no history worth keeping (and Gladys keeps none for it).
      keep_history: spec.fieldKind !== 'text',
      min: kind.min,
      max: kind.max,
    });
  }
  return {
    name: followName(spec),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [
      { name: PARAMS.TABLE, value: spec.tableId },
      ...(spec.viewId ? [{ name: PARAMS.VIEW, value: spec.viewId }] : []),
      ...(spec.field ? [{ name: PARAMS.FIELD, value: spec.field.slice(0, 255) }] : []),
    ],
    features,
  };
}

const TRUE_TEXTS = new Set(['1', 'true', 'yes', 'on']);

/**
 * A NocoDB cell as a Gladys state: a number, 0/1, or `{ text }`; null when
 * there is nothing to publish (empty cell, no row, not a number).
 */
export function cellState(kind, raw) {
  if (raw === undefined || raw === null || raw === '') {
    return kind === 'binary' ? 0 : null;
  }
  if (kind === 'number') {
    const value = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }
  if (kind === 'binary') {
    return raw === true || TRUE_TEXTS.has(String(raw).toLowerCase()) ? 1 : 0;
  }
  const text = typeof raw === 'object' ? cellText(raw) : String(raw);
  const trimmed = text.trim();
  return trimmed ? { text: trimmed.slice(0, MAX_TEXT_LENGTH) } : null;
}

/** A linked record, an attachment or a user as text: their titles. */
function cellText(raw) {
  const items = Array.isArray(raw) ? raw : [raw];
  return items
    .map((item) =>
      item && typeof item === 'object'
        ? (item.title ?? item.display_name ?? item.email ?? item.Title ?? JSON.stringify(item))
        : String(item),
    )
    .join(', ');
}
