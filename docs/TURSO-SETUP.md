# Free persistent storage for Savor Care

The app can keep running on Render Free while its database lives in Turso. Data is written directly to Turso; there is no local replica to lose when Render sleeps. All records, including sessions, live in the selected database. Turso's free usage limits still apply.

## 1. Create the database

1. Open https://turso.tech and sign in or create your account.
2. Choose the Free plan and create a database named `savor-care`. Use a region near your Render service when available. Decline paid upgrades and extra paid capacity for this classroom setup.
3. Copy the database URL from its connection details. The app supports both newer `turso://…` databases and older `libsql://…` databases through the corresponding official clients.
4. Generate a **database** authentication token that can read and write this database. Do not use a Turso organization-management API token. Keep the token private; do not place it in a screenshot, commit, issue, browser frontend, or chat message. If it has an expiry, note when it needs renewal.

Dashboard labels can change. Use the URL and token supplied by your own database's connection panel; do not guess them or copy the illustrative URLs in documentation.

## 2. Configure the existing Render service

Open your existing `Nutrition_Finals` web service and select **Environment**. Set:

| Key | Value |
| --- | --- |
| `DATABASE_DRIVER` | `turso` |
| `TURSO_DATABASE_URL` | Exact URL from your Turso connection panel |
| `TURSO_AUTH_TOKEN` | Private read/write database token; enter directly in Render |
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |
| `SEED_DEMO` | `true` for the fictional classroom accounts |
| `JITSI_DOMAIN` | `meet.jit.si` |

Keep the instance on **Free**. No Render disk is needed. `DB_PATH` has no effect in Turso mode and may be removed from Render.

Use this build command:

```sh
npm ci --include=dev && npm run build
```

Use this start command so the trusted origin matches the actual Render URL:

```sh
APP_ORIGIN="$RENDER_EXTERNAL_URL" npm start
```

Save the environment values and deploy the latest GitHub commit. If Render is suspended, resume the service first. If it shows quota exhaustion or a billing issue, inspect that reason rather than selecting a paid plan automatically.

`DATABASE_DRIVER=turso` intentionally refuses to start when either cloud credential is missing. An invalid token or connection error does not fall back to a disposable local database.

## 3. First connection and existing data

The app creates its tables in Turso automatically. On an **empty** database, `SEED_DEMO=true` creates the fictional demo accounts and examples once. Existing databases are not cleared or reseeded on restart.

**An existing Render-local SQLite database is not copied automatically.** Connecting an empty Turso database starts a new set of records. If you need existing accounts, journal entries, or appointments, preserve/export the old SQLite database before changing the service's storage. Do not delete it. A lost Render ephemeral database cannot be recovered by switching to Turso. Seed settings do not restore lost custom records.

## 4. Verify the live connection

1. Open `https://nutrition-finals.onrender.com/api/health` (or your service's actual URL). It should return `{"status":"ok","storage":"turso"}`. A `sqlite` value means the cloud configuration is not in use. Health performs a database query rather than reporting success without checking storage.
2. Sign in, add an identifiable fictional meal, book an appointment, and save a shared clinician plan. Check that the patient sees the plan but not the private SOAP sections.
3. Restart/redeploy the Render service, then sign in again and confirm those records remain. The demo seed count must not grow after every restart.
4. Check Turso's usage dashboard and token expiry before your presentation.

This server writes to your database only after its credentials are configured. Tests using local SQLite/libSQL validate the application code, but cannot prove that your specific cloud token, network, or deployed environment works. Complete the live checks above after connection.

## Local development and tests

With no Turso credentials and no forced driver, local SQLite still works with `npm run dev`. Set `DATABASE_DRIVER=sqlite` explicitly if desired. Supplying Turso credentials while forcing `sqlite` is rejected to prevent an accidental storage mix-up.

```sh
npm test
npm run test:libsql
npm run build
```

The second suite runs all API workflows through asynchronous libSQL operations against temporary local files, without cloud tokens. It also checks rollback, missing credentials, generic outage responses, and persisted sessions. Never point tests at your real cloud database.

References: https://docs.turso.tech/sdk/ts/reference and https://docs.turso.tech/sdk/ts/quickstart
