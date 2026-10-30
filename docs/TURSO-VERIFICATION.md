# Storage integration verification — 30 October 2026

## Implemented

- Direct cloud database access through the official clients for `turso://` and `libsql://` URLs; connection credentials stay on the server.
- Local SQLite remains available for development and existing local projects.
- `DATABASE_DRIVER=turso` requires both credentials and refuses incomplete cloud configuration. Database failures never trigger a local-storage fallback.
- All queries and session operations await database completion.
- Registration and first-run demo data are inserted in atomic transactions. Existing cloud databases are not cleared or reseeded.
- Concurrent appointment status updates cannot both close the same scheduled visit successfully.
- Health checks query storage and report its driver; outages return HTTP 503.
- SDK array rows are converted using column metadata, preserving named fields and null values in API JSON.

## Verified locally

Using Node.js 25.1.0 on Windows:

| Command | Result |
| --- | --- |
| `npm test` | 27 passed, 0 failed |
| `npm run test:libsql` | 27 passed, 0 failed |
| `npm run build` | Passed |

The libSQL run exercises the full API suite with real asynchronous database operations against temporary local databases, including data/session persistence when reopening the database. Extra tests cover missing or conflicting configuration, supported client entry points, transaction rollback, seed atomicity, SDK row shapes, and generic outage responses. The two official cloud clients initialize without network requests in the client-selection test. The outage test deliberately injects a failing connection.

These checks **do not** connect to a user-owned Turso cloud database. No Turso token has been supplied, no existing records have been copied, and a Render restart against real Turso storage has not been verified.

## Next required step

Follow [TURSO-SETUP.md](TURSO-SETUP.md) to create the free database, enter its URL/token directly in Render, resume the Render service if necessary, and deploy. Confirm `/api/health` reports `storage: "turso"`, then save a fictional record and verify it survives a redeploy. Only that completes live cloud-persistence acceptance.
