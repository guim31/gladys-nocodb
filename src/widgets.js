// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `tables`.
//
// The use case: a glance at the tables kept in NocoDB (tasks to do, items to
// buy, open tickets) without adding a tile per table. One row per table
// followed — its row count, or the field followed, or why it has none — for
// every table, or the ones chosen in the widget settings (their devices), and
// a Refresh button with a setting to hide it.
//
// The values are sent as text, not bound to device features: the widget works
// before any device is added.
//
// Budget (8 components, 2 texts): one text while something is wrong, one
// status list of ten rows at most, and a Refresh button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { followName, parseTableId } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ActionFailure, errorText, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const MAX_ROWS = 10;

export const TEXT = {
  noTable: {
    en: 'No table followed yet: use "Follow a table" in the configuration of the integration.',
    fr: "Aucune table suivie : utilisez « Suivre une table » dans la configuration de l'intégration.",
    de: 'Noch keine Tabelle verfolgt: Nutze „Tabelle verfolgen“ in der Konfiguration der Integration.',
    es: 'Ninguna tabla seguida: use «Seguir una tabla» en la configuración de la integración.',
  },
  rows: { en: 'rows', fr: 'lignes', de: 'Zeilen', es: 'filas' },
  noValue: { en: 'No value', fr: 'Aucune valeur', de: 'Kein Wert', es: 'Sin valor' },
  yes: { en: 'Yes', fr: 'Oui', de: 'Ja', es: 'Sí' },
  no: { en: 'No', fr: 'Non', de: 'Nein', es: 'No' },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  more: { en: 'Others', fr: 'Autres', de: 'Weitere', es: 'Otras' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Tables read again.',
    fr: 'Tables relues.',
    de: 'Tabellen neu gelesen.',
    es: 'Tablas leídas de nuevo.',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const shown = (value) => value !== false && value !== 'false';

/** The name of a table's device in Gladys (renamed by the user), else its own. */
function deviceName(hub, spec) {
  const device = (hub.gladys.devices ?? []).find(
    (entry) => parseTableId(hub.gladys, entry.external_id) === spec.id,
  );
  return device?.name || followName(spec);
}

/** The tables the widget shows: the chosen devices, or every table followed. */
export function chosenFollows(hub, settings) {
  const chosen = [settings?.tables ?? []].flat().filter((id) => typeof id === 'string' && id);
  const all = [...hub.follows.values()].sort((a, b) => followName(a).localeCompare(followName(b)));
  if (chosen.length === 0) return all;
  // A chosen device no longer followed shows nothing, not every table.
  const ids = new Set(chosen.map((id) => parseTableId(hub.gladys, id) ?? id));
  return all.filter((spec) => ids.has(spec.id));
}

/** The value of a row: the field followed, else the row count. */
function shownValue(spec, reading, language) {
  if (spec.field) {
    const value = reading.value;
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value.text;
    if (spec.fieldKind === 'binary') return pick(value ? TEXT.yes : TEXT.no, language);
    return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  }
  return `${new Intl.NumberFormat(language).format(reading.count)} ${pick(TEXT.rows, language)}`;
}

function tableRow(hub, spec, language) {
  const label = fit(deviceName(hub, spec), 40);
  const reading = hub.readings.get(spec.id);
  if (reading?.error) {
    return {
      label,
      value: pick(TEXT.error, language),
      icon: 'alert-triangle',
      color: WIDGET_COLORS.DANGER,
    };
  }
  const value = reading ? shownValue(spec, reading, language) : null;
  if (value === null) {
    return {
      label,
      value: pick(TEXT.noValue, language),
      icon: 'minus-circle',
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  return {
    label,
    value: fit(String(value), 40),
    icon: spec.field ? 'file-text' : 'list',
    color: WIDGET_COLORS.INFO,
  };
}

async function get(hub, { settings, language = 'en' }) {
  const components = [];
  const problem = hub.errorText(language);
  if (problem) {
    components.push({ type: 'text', variant: 'body', text: fit(problem, 200) });
  } else if (hub.follows.size === 0) {
    components.push({ type: 'text', variant: 'body', text: pick(TEXT.noTable, language) });
  }
  if (hub.client) {
    const rows = chosenFollows(hub, settings).map((spec) => tableRow(hub, spec, language));
    if (rows.length > MAX_ROWS) {
      rows.splice(MAX_ROWS - 1, rows.length, {
        label: pick(TEXT.more, language),
        value: `+${rows.length - MAX_ROWS + 1}`,
        icon: 'more-horizontal',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    if (rows.length > 0) components.push({ type: 'status', items: rows });
    if (shown(settings?.show_refresh)) {
      components.push({
        type: 'button',
        label: pick(TEXT.refresh, language),
        icon: 'refresh-cw',
        style: 'secondary',
        action: { key: ACTIONS.REFRESH },
      });
    }
  }
  const intervalSeconds = Math.round((hub.config?.pollIntervalMs ?? 60_000) / 1000);
  return { ttl_seconds: Math.min(300, Math.max(30, intervalSeconds)), components };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  hub.requireClient();
  await hub.pollAll();
  if (hub.serverError) {
    throw new ActionFailure(errorText(hub.serverError));
  }
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
