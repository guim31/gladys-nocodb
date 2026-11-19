// -----------------------------------------------------------------------------
// Scene actions ("Add a NocoDB row", "Update a NocoDB row") and the "NocoDB
// tables" widget, through the SDK's fake Gladys: a real success is returned
// (green), every failure is thrown with its text in the four languages (red).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { tableIds } from '../src/devices.js';
import { followId } from '../src/hub.js';
import { parseValues, rowFor } from '../src/scenes.js';
import { REAL, TABLE, VIEW_TODO } from './helpers/fakeNocoDb.js';
import { BASE_CONFIG, createDevices, createWorld, follow } from './helpers/world.js';

async function world(t, options) {
  const created = await createWorld(options);
  t.after(() => created.app.stop());
  return created;
}

async function tasks(t) {
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  const device = tableIds(w.gladys, followId(TABLE, null, null)).device;
  return { w, device, rows: () => w.noco.state.tables.get(TABLE).rows };
}

const failsWith = (ack, pattern) => {
  assert.equal(ack.success, false, JSON.stringify(ack));
  assert.match(ack.error.fr, pattern);
  assert.ok(ack.error.en && ack.error.de && ack.error.es, 'four languages');
};

test('the values: JSON, or Field=value pairs separated by ";" or new lines', () => {
  assert.deepEqual(parseValues('{"Title": "Milk", "Amount": 2}'), {
    values: { Title: 'Milk', Amount: 2 },
    typed: true,
  });
  assert.deepEqual(parseValues('Title = Milk; Done=oui\nAmount=2'), {
    values: { Title: 'Milk', Done: 'oui', Amount: '2' },
    typed: false,
  });
  assert.deepEqual(parseValues('Title=a=b').values, { Title: 'a=b' });
  for (const bad of ['', '   ', 'no equal sign', '=value', '[1]', '{"a":', '{}']) {
    assert.throws(
      () => parseValues(bad),
      (err) => Boolean(err.message.fr),
      bad,
    );
  }
  const row = rowFor(REAL.table.columns, parseValues('title=Milk; Done=non; Amount=2,0'));
  assert.deepEqual(row, { Title: 'Milk', Done: false, Amount: 2 });
});

test('"Add a NocoDB row": added, its id returned, no "New NocoDB row" for it', async (t) => {
  const { w, device, rows } = await tasks(t);
  const ack = await w.fake.sceneAction('add_row', {
    device,
    values: 'Title=From Gladys; Done=non',
  });
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.deepEqual(ack.data.outputs, { id: '4' });
  assert.deepEqual(rows().at(-1), { Title: 'From Gladys', Done: false, Id: 4 });
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, [], 'no loop through a scene');
  w.noco.addRow({ Title: 'By hand' });
  await w.hub.pollAll();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => event.data.title),
    ['By hand'],
  );
});

test('"Add a NocoDB row" refuses what NocoDB would drop or refuse', async (t) => {
  const { w, device } = await tasks(t);
  const cases = [
    [{ device, values: 'Nope=1; Title=x' }, /Champs inconnus dans cette table : Nope/],
    [{ device, values: 'CreatedAt=2026-01-01' }, /NocoDB remplit lui-même ces champs : CreatedAt/],
    [{ device, values: 'Id=5' }, /NocoDB remplit lui-même/],
    [{ device, values: 'Amount=2.5' }, /NocoDB a refusé les valeurs : Invalid value/],
    [{ device, values: 'no pair' }, /illisibles/],
    [{ device, values: '' }, /Saisissez les valeurs/],
    [{ device: 'ext:test-integration:table:000000000000', values: 'Title=x' }, /n'est plus suivi/],
  ];
  for (const [fields, pattern] of cases) {
    failsWith(await w.fake.sceneAction('add_row', fields), pattern);
  }
});

test('"Update a NocoDB row": changed by id; a missing row or id fails', async (t) => {
  const { w, device, rows } = await tasks(t);
  const ack = await w.fake.sceneAction('update_row', { device, row_id: '3', values: 'Done=oui' });
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.deepEqual(ack.data.outputs, { id: '3' });
  assert.equal(rows().find((row) => row.Id === 3).Done, true);
  failsWith(
    await w.fake.sceneAction('update_row', { device, row_id: '999', values: 'Done=oui' }),
    /pas de ligne avec cet identifiant/,
  );
  failsWith(
    await w.fake.sceneAction('update_row', { device, row_id: 'abc', values: 'Done=oui' }),
    /pas de ligne avec cet identifiant/,
  );
  failsWith(
    await w.fake.sceneAction('update_row', { device, row_id: ' ', values: 'Done=oui' }),
    /Saisissez l'identifiant/,
  );
});

test('a write while NocoDB is down, or with a wrong token, fails with the reason', async (t) => {
  const { w, device } = await tasks(t);
  w.noco.state.down = true;
  failsWith(await w.fake.sceneAction('add_row', { device, values: 'Title=x' }), /injoignable/);
  w.noco.state.down = false;
  w.noco.state.token = 'other';
  failsWith(
    await w.fake.sceneAction('update_row', { device, row_id: '1', values: 'Title=x' }),
    /refuse le jeton/,
  );
});

test('a write updates the states of the table at once', async (t) => {
  const { w, device } = await tasks(t);
  await follow(w, { table: 'Tasks', view: 'Todo' });
  await createDevices(w);
  const todoRows = tableIds(w.gladys, followId(TABLE, VIEW_TODO, null)).feature('rows');
  assert.equal(w.fake.lastState(todoRows), 1);
  await w.fake.sceneAction('update_row', { device, row_id: '3', values: 'Done=oui' });
  assert.equal(w.fake.lastState(todoRows), 0);
});

test('the widget: one row per table, the name given in Gladys, valid content', async (t) => {
  const { w } = await tasks(t);
  await follow(w, { table: 'Tasks', view: 'Todo', field: 'Title' });
  await createDevices(w);
  const renamed = { ...w.fake.devices[0], name: 'Mes tâches' };
  await w.fake.deviceUpdated(renamed);
  const ack = await w.fake.widgetGet('tables', { settings: {}, language: 'fr' });
  assert.equal(ack.success, true);
  const content = ack.data.content;
  validateWidgetContent(content);
  const status = content.components.find((component) => component.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Mes tâches', '3 lignes'],
      ['Tasks (Todo) · Title', 'Fix door'],
    ].sort((a, b) => a[0].localeCompare(b[0])),
  );
  // The Refresh button can be hidden; only the chosen tables are shown.
  const chosen = await w.fake.widgetGet('tables', {
    settings: { show_refresh: false, tables: [renamed.external_id] },
    language: 'en',
  });
  const components = chosen.data.content.components;
  assert.ok(!components.some((component) => component.type === 'button'));
  assert.equal(components[0].items.length, 1);
});

test('the widget says what is wrong; Refresh fails in red while NocoDB is down', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, url: '' } });
  const empty = await w.fake.widgetGet('tables', { settings: {}, language: 'de' });
  assert.match(empty.data.content.components[0].text, /Gib die Adresse/);
  failsWith(await w.fake.widgetAction('tables', 'refresh', {}, { settings: {} }), /adresse/);

  const { w: other } = await tasks(t);
  const ok = await other.fake.widgetAction('tables', 'refresh', {}, { settings: {} });
  assert.equal(ok.success, true);
  other.noco.state.down = true;
  failsWith(
    await other.fake.widgetAction('tables', 'refresh', {}, { settings: {} }),
    /injoignable/,
  );
  const content = (await other.fake.widgetGet('tables', { settings: {}, language: 'fr' })).data
    .content;
  validateWidgetContent(content);
  assert.match(content.components[0].text, /injoignable/);
});
