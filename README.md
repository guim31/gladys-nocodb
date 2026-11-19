# NocoDB for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[NocoDB](https://nocodb.com), the open source, self-hosted alternative to
Airtable: your tables as Gladys sensors, scene triggers on new rows, and rows
added or updated from your scenes.

## Features

- **One device per table followed**: its number of rows, or the rows of one of
  its views (its filters: "tasks not done"), and optionally a field of the
  first row of the view (its sort: "next task") as a number, yes/no or text.
- **Scene triggers**: "New NocoDB row" (with the row id, its display value and
  the whole row in JSON) and "NocoDB rows above a threshold" (once per
  crossing).
- **Scene actions**: "Add a NocoDB row" and "Update a NocoDB row", values in
  JSON or `Field=value; Other=value`, scene variables allowed. Unknown or
  computed fields are refused by name (NocoDB would drop them silently).
- **Dashboard widget** "NocoDB tables": every table followed at a glance.
- Messages and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- NocoDB with the REST API v2 (2024 releases and later), self-hosted and
  reachable from Gladys, or NocoDB Cloud; an API token (Account settings →
  Tokens).

## Installation

In Gladys: **Integrations → Install from GitHub**, then enter
`https://github.com/guim31/gladys-nocodb`. Enter the address of NocoDB and the
API token, use "Follow a table", and add the devices from the Discover tab.
The full guide: [docs/en.md](docs/en.md) (also in [French](docs/fr.md),
[German](docs/de.md) and [Spanish](docs/es.md)).

## Checked on a real server

Tested against a real NocoDB 2026.10.2 in Docker (SQLite): connection test,
table and view followed, field of the first row, rows added and updated by the
scene actions (and refused values), new rows detected without announcing the
integration's own rows, wrong token, table deleted, server stopped. The
responses captured there are the fixtures of the tests
(`test/fixtures/real/`). The Docker image was checked with the Gladys sandbox
constraints (read-only, 256 MB, no capability). Not checked yet in a real
Gladys instance: feedback welcome in the
[issues](https://github.com/guim31/gladys-nocodb/issues).

## Limitations

- "New NocoDB row" needs a numeric primary key (every table created in NocoDB
  has one); at most 10 new rows per table are announced per reading.
- The integration reads NocoDB at an interval (30 s to 15 min): no webhook.
- Up to 30 tables followed; NocoDB API v1-only releases are not supported.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against an in-memory NocoDB (`test/helpers/fakeNocoDb.js`) and the
SDK's fake Gladys: they never touch the network. See `CLAUDE.md` for the rules
of the project.

## Credits

- [NocoDB](https://github.com/nocodb/nocodb) (Sustainable Use License for the
  server; the REST API is documented at https://docs.nocodb.com). The logo on
  the cover is NocoDB's, from its official repository.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js) of Gladys
  Assistant. Structure adapted from
  [guim31/gladys-redis](https://github.com/guim31/gladys-redis).

## Disclaimer

This integration is not affiliated with, endorsed by or sponsored by NocoDB.
NocoDB is a trademark of its owners.

## License

Apache-2.0, see [LICENSE](LICENSE).
