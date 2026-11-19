// -----------------------------------------------------------------------------
// A test world: the SDK's fake Gladys, the in-memory NocoDB, an in-memory
// store, the handlers of src/app.js, no timer (the tests read when they want).
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { TOKEN, URL_BASE, createFakeNocoDb } from './fakeNocoDb.js';

process.env.LOG_LEVEL ??= 'silent';

export const BASE_CONFIG = { url: URL_BASE, api_token: TOKEN, language: 'fr' };

export class MemoryStore {
  constructor(data = {}) {
    this.data = structuredClone(data);
  }
  async load() {
    return structuredClone(this.data);
  }
  async save(data) {
    this.data = structuredClone(data);
  }
  async flush() {}
}

export async function createWorld({
  config = BASE_CONFIG,
  store = new MemoryStore(),
  timers = false,
  now,
} = {}) {
  const noco = createFakeNocoDb();
  const gladys = createFakeGladys({ config });
  const app = registerHandlers(gladys, { store, fetch: noco.fetch, timers, now });
  await gladys.connect();
  return { gladys, fake: gladys.fake, noco, app, hub: app.hub, store };
}

/** Follows a table, returns the ack. */
export const follow = (world, fields) => world.fake.action('follow_table', fields);

/** Adds every discovered device to Gladys, like a click on "Add". */
export async function createDevices(world) {
  for (const device of world.fake.discoveredDevices) {
    if (!world.fake.devices.some((entry) => entry.external_id === device.external_id)) {
      await world.fake.deviceCreated(device);
    }
  }
}

export function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  const lines = [];
  for (const stream of ['log', 'error', 'warn']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
