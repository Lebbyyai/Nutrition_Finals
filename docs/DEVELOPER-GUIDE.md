# Savor Care — Developer Guide

**Familiar food. A little more care.**

A full-stack tele-nutrition platform that connects patients and dietitians through food journaling, appointment scheduling, shared care plans, and video consultations. Built as a finals project, with original illustrations and content inspired by everyday Filipino meals.

[Open website](https://nutrition-finals.onrender.com) · [Health check](https://nutrition-finals.onrender.com/api/health) · [Presentation guide](DEMO-GUIDE.md)

> **Project scope:** This is a student MVP. Use fictional information for demonstrations. Educational nutrition content does not replace individual professional advice.

## Contents

- [Features](#features)
- [Technology](#technology)
- [Local setup](#local-setup)
- [Using the system](#using-the-system)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing and verification](#testing-and-verification)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Additional guides](#additional-guides)

## Features

| Feature | What users can do |
| --- | --- |
| Accounts | Register as a patient, sign in with a password or configured Google account, and sign out using server-side sessions. |
| Administration | An owner-provisioned admin can create dietitian accounts and manage patient assignments. |
| Password recovery | Patients, dietitians, and admins can request single-use recovery links when Gmail delivery is configured. |
| Overview | Review daily meal totals, hydration, and the next consultation. |
| Food journal | Add, edit, search, filter by date, and remove personal meal entries. Record estimated calories, protein, fiber, mood, and notes. |
| Hydration | Add or remove glasses in a daily water log. |
| Appointments | Book available 30-minute clinic slots and cancel scheduled visits. Dietitians can mark visits complete. |
| Patient charts | Dietitians can review assigned patients and record SOAP notes. |
| Shared care plans | Patients can read the plan from shared notes; private SOAP sections remain restricted to the provider. |
| Video consultations | Open an appointment-specific Jitsi meeting from either account. |
| Reading room | Read original articles about familiar food, journaling, and consultation preparation. |
| Responsive interface | Use desktop, laptop, and mobile layouts, with scrolling navigation on shorter windows. |

## Technology

| Layer | Technology |
| --- | --- |
| Programming language | JavaScript, including React JSX |
| Interface | React, CSS, Lucide icons, and original SVG illustrations |
| Frontend tooling | Vite |
| Server | Node.js 24+ and Express |
| Database | SQLite for local development; Turso for hosted storage |
| Video | Jitsi External API |
| Authentication | scrypt password hashing and HttpOnly cookie sessions |
| Deployment | Render web service connected to GitHub |

```text
React interface ── /api requests ──► Express API ──► SQLite or Turso
                                          │
                                          └── Appointment access ──► Jitsi meeting
```

## Local setup

### Requirements

- Node.js **24 or newer**, with npm.
- VS Code or another code editor.
- Internet access for installing dependencies and using video calls.

### 1. Open the project

Clone the repository, then open the folder in VS Code:

```sh
git clone https://github.com/Lebbyyai/Nutrition_Finals.git
cd Nutrition_Finals
```

If you downloaded a ZIP, extract it and open the folder containing `package.json`.

### 2. Create the local configuration

In the VS Code terminal, copy the example configuration.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```sh
cp .env.example .env
```

The example configuration uses local SQLite. Cloud credentials are optional for local development.

### 3. Install and run

```sh
npm ci
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** and leave the terminal running. Press **Ctrl + C** in the terminal to stop the app.

The interface runs on port **5173** and the API on **3001**. Vite forwards API requests to Express. The server creates the local database and, when enabled, fictional seed records on the first run.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the frontend and API for development. |
| `npm run build` | Build the production frontend into `dist/`. |
| `npm start` | Serve the built frontend and API with Express. |
| `npm test` | Run the automated backend checks. |
| `npm run test:libsql` | Run checks through the asynchronous adapter using temporary local libSQL databases. |

To preview the built app locally, run `npm run build`, set `APP_ORIGIN=http://localhost:3001` in `.env`, keep `NODE_ENV=development`, and run `npm start`. Open **[http://localhost:3001](http://localhost:3001)**. Restore `APP_ORIGIN=http://localhost:5173` before returning to `npm run dev`.

## Using the system

### Patient workflow

1. Choose **Create an account**, or sign in with an existing patient account.
2. Select **Log a meal** or open **Food journal** to record a meal.
3. Update the water log from **Overview**.
4. Open **Appointments** to book an available consultation.
5. Open **Care plan** to read plans shared by the dietitian.
6. Open the consultation room for the booked appointment.

### Dietitian workflow

1. Sign in with a provisioned dietitian account.
2. Open **Patient charts** and select an assigned patient.
3. Review the journal and write SOAP notes.
4. Share a care plan when appropriate. Patients receive the plan, not the private subjective, objective, or assessment sections.
5. Open the same appointment to join the consultation, then mark the visit complete when finished.

Public registration creates patient accounts. Administrators create dietitian accounts from the admin workspace; the seed configuration below can also provision an initial classroom provider.

### Administrator workflow

1. Configure the first owner account through private Render environment variables.
2. Sign in through the normal sign-in page.
3. Select **Add a dietitian** and confirm creation with your administrator password.
4. Use **Patient assignments** to connect registered patients to a dietitian.

See [Admin, Google, and Gmail setup](ADMIN-GOOGLE-SETUP.md) for the private configuration and complete instructions.

### Google sign-in and password recovery

**Continue with Google** becomes available when the owner configures a Google OAuth web client. New Google users receive patient access; existing authorized Gmail/Workspace accounts retain their role.

Choose **Forgot password?** to request a recovery email. Links expire after 30 minutes, work once, and revoke previous sessions when used. Gmail delivery needs a separate send-only OAuth authorization from the sender mailbox owner. These external services require owner configuration before live use.

### Classroom accounts

When `SEED_DEMO=true` initializes an empty database, these fictional accounts are created:

| Role | Email | Password |
| --- | --- | --- |
| Patient | `maya@example.com` | `SavorDemo123!` |
| Dietitian | `alex@example.com` | `SavorDemo123!` |

The sign-in page no longer displays demo shortcuts. Enter these credentials manually if the accounts exist in your database. Their passwords are public and intended only for fictional classroom demonstrations.

Use separate browser profiles, a private window, or separate devices to test both roles. Tabs in the same browser profile share a login session.

### Video consultations

Join the **same appointment** from the patient and dietitian accounts. Allow camera and microphone access when prompted. Hosted camera access requires HTTPS; localhost is suitable for development.

The public Jitsi service may require moderator sign-in. For a complete check, use two devices with headphones and verify audio and video in both directions. The app checks appointment access, but someone holding a public meeting link may be able to join outside the app. Real clinical use requires an appropriately reviewed video and privacy setup.

## Configuration

The server automatically loads a local `.env` file. Host-provided environment variables take precedence. Keep `.env` and database tokens out of Git and frontend code.

| Variable | Purpose |
| --- | --- |
| `PORT` | API port; defaults to `3001`. |
| `NODE_ENV` | `development` locally; `production` for HTTPS hosting. |
| `APP_ORIGIN` | Exact frontend origin allowed to make changes; required in production. |
| `DATABASE_DRIVER` | `sqlite` or `turso`; without credentials, the default is SQLite. |
| `DB_PATH` | Local SQLite file path; unused in Turso mode. |
| `TURSO_DATABASE_URL` | Connection URL from the Turso database dashboard. |
| `TURSO_AUTH_TOKEN` | Private read/write token for that database. |
| `JITSI_DOMAIN` | Video server hostname; defaults to `meet.jit.si`. |
| `SEED_DEMO` | `true` creates fictional classroom records on an empty database. |
| `PROVIDER_EMAIL` | Dietitian email when provisioning without demo accounts. |
| `PROVIDER_PASSWORD` | Initial dietitian password; at least 12 characters. |
| `PROVIDER_NAME` | Initial dietitian display name. |
| `ADMIN_EMAIL` | First administrator email; use an address not already registered as a clinical user. |
| `ADMIN_PASSWORD` | Private first-admin password, at least 12 characters; remove after initial setup. |
| `ADMIN_NAME` | First administrator display name. |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | Private Google OAuth client secret. |
| `GMAIL_FROM` | Authorized sender mailbox for recovery emails. |
| `GMAIL_REFRESH_TOKEN` | Private send-only Gmail OAuth refresh token. |

For an empty database without demo users, set `SEED_DEMO=false` and supply the provider variables. Production disables demo seeding by default. Changing seed settings does **not** update or delete existing accounts, passwords, or records.

## Deployment

### Render with Turso

The project is deployed at **[nutrition-finals.onrender.com](https://nutrition-finals.onrender.com)**. Its Turso connection has been confirmed through the live health check. The owner also confirmed that a saved Tinola entry survived a Render redeployment.

| Render setting | Value |
| --- | --- |
| Branch | `main` |
| Root Directory | Leave blank. |
| Runtime | Node.js; set `NODE_VERSION=24`. |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `APP_ORIGIN="$RENDER_EXTERNAL_URL" npm start` |

Set `NODE_ENV=production`, `DATABASE_DRIVER=turso`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` in Render. Set `JITSI_DOMAIN=meet.jit.si` and choose the appropriate seed/provider configuration. Paste each environment value without surrounding quotation marks; the quotation marks in the shell start command above are intentional.

See **[Turso setup](TURSO-SETUP.md)** for the full process. The server creates tables automatically. Existing local SQLite records are **not** automatically transferred to a new Turso database.

### Local SQLite hosting alternative

Local SQLite hosting needs one application instance with a persistent writable volume. An ephemeral filesystem can lose records when the instance is replaced. The included [Dockerfile](../Dockerfile) supports container builds; mount persistent storage at `/app/data`, configure an HTTPS origin, and supply the environment values above. A static-only host cannot run this Express API.

## Testing and verification

### Automated checks

```sh
npm test
npm run test:libsql
npm run build
```

The expanded account-management suite passes **44 checks with SQLite** and **44 checks with asynchronous local libSQL**. The production build passes. Google verification and Gmail delivery are mocked in tests; live acceptance requires owner configuration. See [account verification](ACCOUNT-VERIFICATION.md).

### Live acceptance checklist

Use this checklist before presenting the deployed system:

- [ ] Register and sign in as a patient.
- [ ] Save a meal and confirm its totals in the food journal.
- [ ] Book an appointment and review the patient as a dietitian.
- [ ] Save a shared care plan and verify private SOAP sections stay hidden from the patient.
- [ ] Confirm two-device audio and video in the same appointment.
- [ ] Check the latest layout and sign-in changes after deployment.
- [x] Save an identifiable test record, redeploy, and confirm it remains (owner-reported Tinola test).
- [ ] Configure and verify the first admin, dietitian creation, Google sign-in, and real recovery-email delivery.

Earlier local browser results are documented in the [QA report](QA-REPORT.md).

### Health check

Open **[/api/health](https://nutrition-finals.onrender.com/api/health)**. A working Turso connection returns:

```json
{"status":"ok","storage":"turso"}
```

The endpoint queries the database. `storage: "sqlite"` indicates local storage; an unavailable database returns HTTP `503`. A successful health response confirms connectivity, while the redeployment test checks persistence.

## Project structure

```text
Nutrition_Finals/
├── src/                 React interface and CSS
├── public/              Public assets
├── server/              Express API, authentication, database adapter, and seed data
├── scripts/             Asynchronous libSQL test runner
├── tests/               Automated API and database checks
├── docs/                Setup, presentation, QA guides, and screenshots
├── .env.example         Example environment configuration
├── Dockerfile           Container build configuration
├── package.json         Dependencies and commands
└── README.md            Project guide
```

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `node:sqlite` is unavailable | Install Node.js 24+, reopen the terminal, and run `node --version`. An experimental SQLite warning alone is not a startup failure. |
| Frontend cannot reach the API | Run `npm run dev` from the project root; confirm port 3001 is available and both services remain running. |
| Requests fail after changing ports | Match `APP_ORIGIN` to the frontend address, then restart the server. |
| Hosted login does not persist | Check HTTPS and `APP_ORIGIN`. Production cookies require a secure connection. |
| Database initialization fails | Check the safe stage/error code in Render logs, the exact database URL, and a valid database read/write token. Keep tokens hidden. |
| Health response lacks `storage` | Check the deployed commit and refresh. If deployed output still differs from the source, try a clean build through Render. |
| Video waits for a moderator | Follow Jitsi moderator sign-in prompts or configure your own Jitsi service. |
| Camera or microphone is unavailable | Check site permissions, HTTPS, and whether another application is using the device. |
| Local SQLite cannot be written | Confirm the directory configured by `DB_PATH` is writable. |

For a fresh **local SQLite** demonstration, stop the server, back up the database, move the `data` folder outside the project, and restart with `SEED_DEMO=true`. This creates a new database; it does not preserve the old records. It does not reset a Turso database.

## Additional guides

| Guide | Contents |
| --- | --- |
| [Presentation guide](DEMO-GUIDE.md) | Classroom walkthrough and manual checks. |
| [Admin and Google setup](ADMIN-GOOGLE-SETUP.md) | First admin, Google sign-in, and Gmail recovery configuration. |
| [Account verification](ACCOUNT-VERIFICATION.md) | New account tests, screenshots, and remaining live checks. |
| [Turso setup](TURSO-SETUP.md) | Cloud database configuration and persistence test. |
| [Storage verification](TURSO-VERIFICATION.md) | Historical adapter test results and verification limits. |
| [QA report](QA-REPORT.md) | Earlier browser checks, screenshots, and fixes. |
| [Original verification notes](VERIFICATION.md) | Earlier implementation checks. |

Historical reports describe the state at the time they were written. For real patient use, further work is needed on identity verification, provider enrollment, consent, backups, auditing, monitoring, and deployment-specific privacy and security review.
