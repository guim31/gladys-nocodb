# NocoDB

Your NocoDB tables in Gladys: how many rows a table or a view holds, a field of
its first row, a scene trigger when a row is added, and rows added or updated
from your scenes. NocoDB is a self-hosted, open source alternative to Airtable.

Tested against a real NocoDB 2026.10.2 (Docker, SQLite): table and view
followed, rows added and updated by the scene actions, new rows detected, wrong
token, table deleted, server stopped. Feedback and bug reports are welcome on
[GitHub](https://github.com/guim31/gladys-nocodb/issues).

## What you get

- **One device per table you follow**: its number of rows, or the number of
  rows of one of its views (its filters: "tasks not done", "open tickets"…).
- Optionally, **a field of the first row of the view** (its sort: "next task",
  "latest reading"), as a number, a yes/no or a text.
- Two **scene triggers**: "New NocoDB row" and "NocoDB rows above a threshold".
- Two **scene actions**: "Add a NocoDB row" and "Update a NocoDB row".
- A **dashboard widget**, "NocoDB tables", with every table followed.

## Requirements

- NocoDB (a 2024 release or later, API v2) reachable from Gladys over the
  network: not `localhost`, the integration runs in its own container. NocoDB
  Cloud (`https://app.nocodb.com`) works too.
- An **API token**: in NocoDB, Account settings → Tokens → Create a token. The
  token has the rights of its user: a user with the "Viewer" role on a base
  cannot write in it (the scene actions then fail with the reason).

## Configuration

- **Address**: the address of NocoDB as seen from Gladys, with its port, e.g.
  `http://192.168.1.20:8080`. A path is kept (`https://example.org/nocodb`).
- **API token**: the token created above. It is never written in the logs.
- **Refresh interval**: 30 seconds to 15 minutes (1 minute by default). Each
  table is read with two or three requests per interval.
- **Language of the messages**: the names of the new features and the messages
  of the scene actions.

"Test the connection" lists the tables the token sees ("Base / Table"), reads
the tables followed and says what is wrong.

## Following tables

Use "Follow a table" in the configuration of the integration:

- **Table**: its name, `Base / Table` if several bases have a table of that
  name, or its id (in NocoDB: the table's menu → Copy table id).
- **View** (optional): the rows counted are those of the view, with its
  filters. Without a view, every row of the table is counted.
- **Field** (optional): also shows this field of the first row of the view.
  Number, decimal, currency, percent, rating, duration, rollup and count
  fields give a number; a checkbox gives yes/no; any other field a text.
- **Threshold** (optional): a number of rows for the trigger "NocoDB rows
  above a threshold".
- **Name** (optional): the name of the device.

Then add the device from the Discover tab of the integration. The same table,
view and field again change the name or the threshold. "Stop following a
table" takes the same table, view and field; its device stays in Gladys until
you delete it. Up to 30 tables can be followed.

## Devices

- **Rows**: the number of rows of the table or of the view.
- **The field followed**, if any, named after the field. A text field shows
  "No row" when the view is empty.

The integration reads NocoDB on its own timer (Gladys does not poll these
devices), and only sends a value when it changes.

## Scenes

### Triggers

- **New NocoDB row**: a row added to a table followed (to its view, if one was
  chosen: a row that does not match its filters is not new for it). Variables:
  the table, the id of the row, its display value, and the whole row in JSON.
  Rows added by this integration's scene actions do not fire it (no loop). The
  rows present when the table is followed are not new. Needs a table with a
  numeric id, which every table created in NocoDB has.
- **NocoDB rows above a threshold**: the number of rows goes above the
  threshold set with "Follow a table". It fires once per crossing: the count
  must go back to the threshold or below before it fires again. Variables: the
  table, the number of rows, the threshold.

The table filter of both triggers is optional: empty, any table.

### Actions

- **Add a NocoDB row**: adds a row to a table followed. Its id is an output
  for the next actions.
- **Update a NocoDB row**: changes fields of a row of a table followed, by its
  id (e.g. the id variable of "New NocoDB row").

The values are written `Field=value; Other=value` (separated by `;` or new
lines), or in JSON: `{"Field": "value", "Amount": 3}`. Scene variables can be
used in both. A checkbox accepts `true`/`false`, `yes`/`no`, `1`/`0`; a number
accepts a comma. A field the table does not have, or that NocoDB fills itself
(id, created time, formula…), is refused with its name: NocoDB would drop it
silently. A value NocoDB refuses (a text in a number field) fails with its
message.

## Dashboard

The "NocoDB tables" widget shows a line per table followed: its number of
rows, or the field followed. The tables shown can be chosen (only the devices
added to Gladys), and its "Refresh" button, which reads every table at once,
can be hidden.

## Limits

- Only the tables you follow are read, never a whole base.
- A number or yes/no field followed keeps its last value when the view becomes
  empty or the cell is emptied (Gladys has no "no value" state).
- A redirection is only followed on the same host (http to https): write the
  final address, e.g. `https://app.nocodb.com`.
- A new row is a row whose id is above the last one seen: a table of an
  external database whose key is a text does not fire "New NocoDB row".
- At most 10 new rows per table are announced per reading; the next ones come
  at the next reading.
- NocoDB Cloud limits the API to 5 requests per second per user: the tables
  are read one after the other, and a read is skipped while the previous one
  runs. With many tables, choose a longer interval.
- NocoDB API v2 only: very old releases (before 2024) are not supported.

## Troubleshooting

- **"NocoDB refuses the API token"**: the token was revoked, or its user lost
  access to the base. Create a new one.
- **"NocoDB cannot be reached"**: check the address from the machine running
  Gladys (not `localhost`), and the port (8080 by default).
- **"NocoDB answered with a server error (5xx)"**: NocoDB, or the proxy in
  front of it, has a problem: see its logs. The integration reads again at the
  next interval.
- **"This address does not answer like NocoDB"**: the address leads to another
  web server, or lacks the path of a reverse proxy.
- **A table shows "Error" in the widget**: it was deleted, or its view was
  deleted; "Test the connection" names it. Follow it again.
- Detailed logs: set `LOG_LEVEL=debug` on the container.
