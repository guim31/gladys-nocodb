// -----------------------------------------------------------------------------
// The hub against the in-memory NocoDB and the SDK's fake Gladys: the
// configuration actions, the devices and their states, the scene events, the
// failures of the server and of a table, the quiet logs, the container's own
// timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseUrl } from '../src/config.js';
import { tableIds } from '../src/devices.js';
import { MAX_EVENT_TEXT, TRIGGERS, followId, rowJson } from '../src/hub.js';
import { TABLE, URL_BASE, VIEW_TODO } from './helpers/fakeNocoDb.js';
import {
  BASE_CONFIG,
  MemoryStore,
  captureLogs,
  createDevices,
  createWorld,
  follow,
} from './helpers/world.js';

async function world(t, options) {
  const created = await createWorld(options);
  t.after(() => created.app.stop());
  return created;
}

const rowsOf = (w, id) => w.fake.lastState(tableIds(w.gladys, id).feature('rows'));

test('the address typed by the user', () => {
  assert.equal(parseUrl('192.0.2.10:8080'), 'http://192.0.2.10:8080');
  assert.equal(parseUrl('https://nocodb.example.org/'), 'https://nocodb.example.org');
  assert.equal(parseUrl('http://192.0.2.10:8080/dashboard/'), 'http://192.0.2.10:8080');
  assert.equal(parseUrl('https://example.org/nocodb'), 'https://example.org/nocodb');
  assert.equal(parseUrl('http://user:secret@192.0.2.10'), null);
  assert.equal(parseUrl('ftp://192.0.2.10'), null);
  assert.equal(parseUrl('  '), null);
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 60_000);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('connected, then "Test the connection" lists the tables', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /Connecté à NocoDB 2026\.10\.2/);
  assert.match(ack.data.message.en, /Home \/ Tasks/);
  assert.ok(ack.data.message.de && ack.data.message.es);
});

test('no address, a bad address, no token: said in the status, in every language', async (t) => {
  for (const [config, word] of [
    [{ ...BASE_CONFIG, url: '' }, /Saisissez l'adresse/],
    [{ ...BASE_CONFIG, url: 'ftp://192.0.2.10' }, /pas valide/],
    [{ ...BASE_CONFIG, api_token: '' }, /jeton d'API/],
  ]) {
    const w = await world(t, { config });
    const status = w.fake.connectionStatus;
    assert.equal(status.connected, false);
    assert.match(status.message.fr, word);
    assert.deepEqual(Object.keys(status.message).sort(), ['de', 'en', 'es', 'fr']);
    const ack = await w.fake.action('test_connection', {});
    assert.equal(ack.success, false);
    assert.match(ack.error.fr, word);
  }
});

test('a wrong token: disconnected with the reason, and the action fails in red', async (t) => {
  const w = await world(t);
  w.noco.state.token = 'another';
  await w.hub.pollAll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /refuse le jeton/);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /refuse le jeton/);
});

test('"Follow a table": by name, "Base / Table" or id; mistakes fail with a reason', async (t) => {
  const w = await world(t);
  assert.equal((await follow(w, { table: 'tasks' })).success, true);
  assert.equal((await follow(w, { table: 'Home / Tasks', view: 'todo' })).success, true);
  assert.equal((await follow(w, { table: TABLE, field: 'title' })).success, true);
  assert.equal(w.hub.follows.size, 3);
  const failures = [
    [{}, /Saisissez la table/],
    [{ table: 'Nope' }, /Aucune table de ce nom/],
    [{ table: 'Tasks', view: 'Nope' }, /pas de vue de ce nom/],
    [{ table: 'Tasks', field: 'Nope' }, /pas de champ de ce nom/],
    [{ table: 'Tasks', threshold: '-1' }, /seuil doit être/],
    [{ table: 'Tasks', threshold: '2,5' }, /seuil doit être/],
  ];
  for (const [fields, message] of failures) {
    const ack = await follow(w, fields);
    assert.equal(ack.success, false, JSON.stringify(fields));
    assert.match(ack.error.fr, message);
    assert.ok(ack.error.en && ack.error.de && ack.error.es);
  }
  // The same table again: its name changes, not its identity.
  const again = await follow(w, { table: 'Tasks', name: 'All tasks' });
  assert.match(again.data.message.en, /"All tasks" updated/);
  assert.equal(w.hub.follows.size, 3);
});

test('the tables followed survive a restart, under the same devices', async (t) => {
  const store = new MemoryStore();
  const first = await world(t, { store });
  await follow(first, { table: 'Tasks', view: 'Todo' });
  await first.app.stop();
  const second = await world(t, { store });
  assert.deepEqual(
    second.fake.discoveredDevices.map((device) => device.external_id),
    [tableIds(second.gladys, followId(TABLE, VIEW_TODO, null)).device],
  );
});

test('"Stop following a table" removes it; an unknown one fails', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  await follow(w, { table: 'Tasks', view: 'Todo' });
  const missing = await w.fake.action('unfollow_table', { table: 'Other' });
  assert.equal(missing.success, false);
  assert.match(missing.error.fr, /n'est pas suivie/);
  const ack = await w.fake.action('unfollow_table', { table: 'Tasks', view: 'Todo' });
  assert.equal(ack.success, true);
  assert.equal(w.hub.follows.size, 1);
  assert.equal(w.fake.discoveredDevices.length, 1);
});

test('the states of an added device: rows of the view, the field of its first row', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks', view: 'Todo', field: 'Title' });
  await follow(w, { table: 'Tasks', field: 'Done' });
  await createDevices(w);
  const todo = followId(TABLE, VIEW_TODO, 'Title');
  const done = followId(TABLE, null, 'Done');
  assert.equal(rowsOf(w, todo), 1);
  assert.equal(w.fake.lastState(tableIds(w.gladys, todo).feature('value_text')), 'Fix door');
  assert.equal(rowsOf(w, done), 3);
  assert.equal(w.fake.lastState(tableIds(w.gladys, done).feature('value_binary')), 1);

  // Only what changed is sent again.
  const before = w.fake.states.length;
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before);
  w.noco.addRow({ Title: 'Call plumber' });
  await w.hub.pollAll();
  assert.equal(rowsOf(w, todo), 2);
});

test('"New NocoDB row": one event per row added by others, none at the first read', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  await follow(w, { table: 'Tasks', view: 'Todo' });
  assert.deepEqual(w.fake.sceneEvents, [], 'the existing rows are not new');
  const first = w.noco.addRow({ Title: 'Call plumber' });
  w.noco.addRow({ Title: 'Already done', Done: 1 });
  await w.hub.pollAll();
  const all = tableIds(w.gladys, followId(TABLE, null, null)).device;
  const todo = tableIds(w.gladys, followId(TABLE, VIEW_TODO, null)).device;
  const events = w.fake.sceneEvents.filter((event) => event.key === TRIGGERS.NEW_ROW);
  assert.deepEqual(
    events.map((event) => [event.data.device, event.data.id, event.data.title]),
    [
      [all, String(first), 'Call plumber'],
      [all, String(first + 1), 'Already done'],
      [todo, String(first), 'Call plumber'],
    ],
  );
  assert.equal(JSON.parse(events[0].data.row).Title, 'Call plumber');
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 3, 'announced once');
});

test('more than ten new rows: ten now, the others at the next read', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  for (let index = 0; index < 13; index += 1) w.noco.addRow({ Title: `Row ${index}` });
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 10);
  await w.hub.pollAll();
  assert.equal(w.fake.sceneEvents.length, 13);
});

test('"NocoDB rows above a threshold": once per upward crossing', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks', view: 'Todo', threshold: '2' });
  const crossings = () => w.fake.sceneEvents.filter((event) => event.key === TRIGGERS.COUNT_ABOVE);
  w.noco.addRow({ Title: 'Two' });
  await w.hub.pollAll();
  assert.equal(crossings().length, 0, '2 is not above 2');
  w.noco.addRow({ Title: 'Three' });
  await w.hub.pollAll();
  w.noco.addRow({ Title: 'Four' });
  await w.hub.pollAll();
  assert.deepEqual(
    crossings().map((event) => [event.data.count, event.data.threshold]),
    [[3, 2]],
  );
  // Back below, then above again: a second crossing.
  for (const row of w.noco.state.tables.get(TABLE).rows) row.Done = 1;
  await w.hub.pollAll();
  w.noco.addRow({ Title: 'Five' });
  w.noco.addRow({ Title: 'Six' });
  w.noco.addRow({ Title: 'Seven' });
  await w.hub.pollAll();
  assert.equal(crossings().length, 2);
});

test('a table deleted: its own error, the server stays connected', async (t) => {
  const lines = captureLogs(t);
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  await createDevices(w);
  lines.length = 0;
  await w.hub.pollAll();
  assert.deepEqual(lines, [], 'a normal read writes nothing at info');

  const saved = w.noco.state.tables.get(TABLE);
  w.noco.state.tables.delete(TABLE);
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.hub.readings.get(followId(TABLE, null, null)).error, 'not_found');
  assert.equal(lines.filter((line) => /cannot be read/.test(line)).length, 1, 'logged once');
  const report = await w.fake.action('test_connection', {});
  assert.match(report.data.message.fr, /Problème avec « Tasks »/);

  w.noco.state.tables.set(TABLE, saved);
  await w.hub.pollAll();
  assert.equal(lines.filter((line) => /can be read again/.test(line)).length, 1);
});

test('NocoDB stopped, then back: one line each way, the reason in the status', async (t) => {
  const lines = captureLogs(t);
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  lines.length = 0;
  w.noco.state.down = true;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /injoignable/);
  w.noco.state.down = false;
  w.noco.state.slow = true;
  await w.hub.pollAll();
  assert.match(w.fake.connectionStatus.message.fr, /10 secondes/);
  w.noco.state.slow = false;
  w.noco.state.html = true;
  await w.hub.pollAll();
  assert.match(w.fake.connectionStatus.message.fr, /ne répond pas comme NocoDB/);
  w.noco.state.html = false;
  await w.hub.pollAll();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(lines.filter((line) => /NocoDB answers again/.test(line)).length, 1);
  assert.equal(lines.filter((line) => /ECONNREFUSED/.test(line)).length, 1);
  assert.ok(!lines.some((line) => line.includes('test-token')), 'never the token');
});

test('the container reads on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = await world(t, { config: { ...BASE_CONFIG, poll_interval: '300' }, timers: true });
  await follow(w, { table: 'Tasks' });
  await createDevices(w);
  const id = followId(TABLE, null, null);
  w.noco.addRow({ Title: 'Later' });
  t.mock.timers.tick(299_000);
  await w.hub.queue;
  assert.equal(rowsOf(w, id), 3);
  t.mock.timers.tick(1_000);
  await new Promise((resolve) => setImmediate(resolve));
  await w.hub.queue;
  assert.equal(rowsOf(w, id), 4);
});

test('onPoll, should Gladys poll anyway: a fresh reading is not read again', async (t) => {
  let now = 1_000_000;
  const w = await world(t, { now: () => now });
  await follow(w, { table: 'Tasks' });
  await createDevices(w);
  const [device] = w.fake.devices;
  const before = w.noco.state.requests.length;
  assert.deepEqual(await w.fake.poll(device), { success: true });
  assert.equal(w.noco.state.requests.length, before);
  now += 60_000;
  await w.fake.poll(device);
  assert.ok(w.noco.state.requests.length > before);
});

test('the URL and the token never reach the discovery payloads', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  const payload = JSON.stringify(w.fake.discoveredDevices);
  assert.ok(!payload.includes(URL_BASE));
  assert.ok(!payload.includes(BASE_CONFIG.api_token));
});

test('a 5xx at start: disconnected with the reason, and the timer still reads later', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const store = new MemoryStore();
  const w = await world(t, { store, timers: true });
  w.noco.state.status = 502;
  await w.fake.configUpdated({ ...BASE_CONFIG, poll_interval: '30' });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /erreur serveur \(5xx\)/);
  w.noco.state.status = 0;
  t.mock.timers.tick(30_000);
  await new Promise((resolve) => setImmediate(resolve));
  await w.hub.queue;
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a wrong path or a redirection is not a missing table', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  w.noco.state.wrongPath = true;
  await w.hub.pollAll();
  assert.match(w.fake.connectionStatus.message.fr, /ne répond pas comme NocoDB/);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /ne répond pas comme NocoDB/);
  w.noco.state.wrongPath = false;
  w.noco.state.status = 301;
  await w.hub.pollAll();
  assert.match(w.fake.connectionStatus.message.fr, /ne répond pas comme NocoDB/);
});

test('a threshold crossed across a failed read still fires', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks', threshold: '3' });
  w.noco.state.status = 500;
  await w.hub.pollAll();
  w.noco.state.status = 0;
  w.noco.addRow({ Title: 'Four' });
  await w.hub.pollAll();
  assert.deepEqual(
    w.fake.sceneEvents
      .filter((event) => event.key === TRIGGERS.COUNT_ABOVE)
      .map((e) => e.data.count),
    [4],
  );
});

test('an empty view says so on the field followed, instead of the last title', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks', view: 'Todo', field: 'Title' });
  await createDevices(w);
  const feature = tableIds(w.gladys, followId(TABLE, VIEW_TODO, 'Title')).feature('value_text');
  assert.equal(w.fake.lastState(feature), 'Fix door');
  for (const row of w.noco.state.tables.get(TABLE).rows) row.Done = 1;
  await w.hub.pollAll();
  assert.equal(w.fake.lastState(feature), 'Aucune ligne');
});

test('a "New NocoDB row" refused by Gladys is announced again at the next read', async (t) => {
  const w = await world(t);
  await follow(w, { table: 'Tasks' });
  w.noco.addRow({ Title: 'One' });
  w.noco.addRow({ Title: 'Two' });
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  t.mock.method(w.gladys, 'publishSceneEvent', async () => {
    throw new Error('429 TOO_MANY_REQUESTS');
  });
  await w.hub.pollAll();
  w.gladys.publishSceneEvent.mock.restore();
  assert.equal(typeof original, 'function');
  await w.hub.pollAll();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => event.data.title),
    ['One', 'Two'],
  );
});

test('the row variable stays valid JSON when the row is long', () => {
  const row = { Id: 1, Title: 'x'.repeat(5000), Notes: 'y'.repeat(3000), Done: 1 };
  const json = rowJson(row);
  assert.ok(json.length <= MAX_EVENT_TEXT);
  const parsed = JSON.parse(json);
  assert.equal(parsed.Id, 1);
  assert.equal(parsed.Done, 1);
  assert.ok(parsed.Title.length <= 80);
});

test('a redirection to https on the same host is followed, never to another host', async (t) => {
  const w = await world(t);
  w.noco.state.httpsRedirect = true;
  await w.hub.pollAll();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.ok(w.noco.state.requests.some((request) => request.protocol === 'https:'));
});
