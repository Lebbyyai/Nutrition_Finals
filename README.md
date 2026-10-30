# Savor Care

Latest verification: [30 October 2026 QA report](docs/QA-REPORT.md) — 21 automated checks passed; includes browser results, fixes, and remaining hosted/video/storage acceptance checks.

**Familiar food. A little more care.**

A full-stack tele-nutrition finals project that connects a patient's food journal, an appointment calendar, a dietitian's chart, and a virtual consultation. Built with React, Vite, Express, and a persistent SQLite database. Open this folder directly in VS Code.

The visual identity combines warm ivory, forest green, coral accents, and an original illustrated plate. The content takes inspiration from a Filipino home pantry: monggo, tinola, rice, and familiar routines. The journal encourages curiosity about food and daily habits instead of reducing meals to a score.

All patients, providers, clinical notes, and appointments in the demo are fictional. Nutrition content is educational and is not an individual diagnosis or treatment plan.

## Run in VS Code

Install **Node.js 24 or newer**. This project uses Node's built-in SQLite module; older Node versions will not work.

1. Extract the project ZIP and open the `savor-care` folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Run:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

On macOS/Linux, use `cp .env.example .env` for the first command.

4. Visit **http://localhost:5173**. Leave the terminal running.

The development command runs the React interface on port 5173 and the API on port 3001. Vite forwards API calls to the server. SQLite creates the database and inserts the demo records on the first run. A SQLite experimental warning from Node, if shown, does not by itself mean the app failed.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Patient | `maya@example.com` | `SavorDemo123!` |
| Dietitian | `alex@example.com` | `SavorDemo123!` |

Use a normal browser window for the patient and an incognito/private window or a different browser for the dietitian. Tabs in the same browser profile share the login cookie.

## What to present

| Assignment requirement | Project flow |
| --- | --- |
| Consumer login | Patient login and registration with server-side sessions |
| Meal logging | **Food journal** saves the patient's entries to SQLite |
| Appointment scheduling | **Appointments** books 30-minute clinic slots using Manila time |
| Provider charting | **Patient charts** lets the dietitian review patient context, save private notes, and share selected care notes |
| Integrated care | Patient journal entries and shared provider updates connect through the same API and database |
| Virtual consultation | Appointment room opens an embedded Jitsi meeting |
| Deployable MVP | Production frontend served by Express, a Dockerfile, and persistent storage instructions |
| End-to-end testing | Automated API checks plus a repeatable browser acceptance checklist |

Patient navigation includes **Overview**, **Food journal**, **Appointments**, **Care plan**, and **The reading room**. Provider navigation includes **Overview**, **Patient charts**, **Appointments**, and **The reading room**.

See [the presentation and testing guide](docs/DEMO-GUIDE.md) for a classroom walkthrough.

## Video calls

The meeting screen uses the Jitsi External API and defaults to `meet.jit.si`. Opening a meeting requires an internet connection. Allow camera and microphone access when the browser asks. Camera access works on `localhost` during development and requires HTTPS on a hosted deployment.

Join the **same appointment** from the patient and dietitian accounts. For a convincing two-person demonstration, use two devices, or separate browser profiles with headphones. The public Jitsi service may ask a moderator to sign in before the meeting starts; follow the service's current prompts. Network policy, third-party cookies, or an ad blocker can also affect embedded meetings.

The application checks appointment access before returning its meeting information and uses a randomly generated room name. That protects the application's workflow, but a public Jitsi room is not a clinically approved private consultation system. A person with a room link can potentially join outside the application. Before handling actual health information, configure an appropriately reviewed, authenticated video deployment with signed access and an agreed privacy/consent policy.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the interface and API for development |
| `npm run build` | Build the production interface into `dist/` |
| `npm start` | Start Express, which serves the built interface and API |
| `npm test` | Run the backend tests in `tests/` |

For a local preview of the built app, run `npm run build`, set `APP_ORIGIN=http://localhost:3001` in your local `.env`, and run `npm start`. Visit http://localhost:3001. Keep `NODE_ENV=development` for this local HTTP preview; use production mode and HTTPS for public hosting.

The manual browser checklist includes behaviors that API tests cannot prove, such as camera permissions, responsive layout, and two-participant video. A successful build alone does not verify a real video call.

## How the pieces connect

```text
React interface (Vite)
    │ same-origin /api requests + HttpOnly session cookie
    ▼
Express API ───────► SQLite database in data/savor.sqlite
    │
    └── appointment authorization + meeting room information
                    │
                    ▼
            Embedded Jitsi meeting
            (external video service)
```

The server hashes passwords with scrypt, stores sessions on the server, checks roles and record access, and validates changes on the server. Browser refreshes preserve database records. Production sessions use Secure cookies. These are useful application controls; this student MVP does not claim medical, privacy, or clinical compliance.

```text
savor-care/
├── src/                 React components and visual styling
├── server/              API, authentication, database, demo seed
├── tests/               Automated backend checks
├── docs/DEMO-GUIDE.md    Presentation flow and acceptance checklist
├── .env.example         Documented local configuration
├── Dockerfile           Production image
└── package.json         Dependencies and run commands
```

## Configuration

Copy `.env.example` to `.env`. The server loads it automatically; environment variables supplied by your host take precedence. Keep `.env` out of source control.

| Variable | Purpose |
| --- | --- |
| `PORT` | Express port; default `3001` |
| `DB_PATH` | SQLite file path; default `./data/savor.sqlite` |
| `NODE_ENV` | `development` locally; `production` for HTTPS hosting |
| `APP_ORIGIN` | Browser origin allowed to change application data; required for production |
| `JITSI_DOMAIN` | Video server hostname; default `meet.jit.si` |
| `SEED_DEMO` | `true` to create fictional classroom demo accounts and records |
| `PROVIDER_EMAIL` | Clinician account email when provisioning without the demo |
| `PROVIDER_PASSWORD` | Clinician password, at least 12 characters, when provisioning without the demo |
| `PROVIDER_NAME` | Clinician display name when provisioning without the demo |

Production disables demo seeding by default. Explicitly set `SEED_DEMO=true` only when hosting a synthetic classroom/portfolio demonstration. To provision without demo users, set `SEED_DEMO=false` and supply the provider variables. Changing the seed setting does not remove existing accounts or records from an existing database.

## Deploy as a classroom demo

The app is a Node service with local SQLite storage. It needs **one running instance** with a persistent, writable data directory. A static-only host cannot run its API. A host with an ephemeral filesystem will lose data when its container is replaced unless a persistent volume is attached.

With Docker:

```powershell
docker build -t savor-care .
docker volume create savor-care-data
docker run -d --name savor-care -p 127.0.0.1:3001:3001 -v savor-care-data:/app/data -e APP_ORIGIN=https://your-domain.example -e SEED_DEMO=true savor-care
```

Replace `https://your-domain.example` with your real HTTPS origin, without a trailing slash. Put an HTTPS reverse proxy in front of port 3001 and configure it to pass the original host and forwarded protocol. The container runs in production mode. Do not test this production cookie configuration by opening plain HTTP on a remote IP.

On a Node hosting service, select Node 24+, set the build command to `npm ci && npm run build`, the start command to `npm start`, and the production environment values above. Mount persistent storage, set `DB_PATH` to a database file inside that mount, and use the service's HTTPS URL as `APP_ORIGIN`. Ensure the service uses a single instance for this SQLite MVP.

Before using real patient data, the project needs a deployment-specific review of identity verification, provider enrollment, consent, privacy policies, data retention/backups, access auditing, monitoring, and an appropriate authenticated video service. The included shared demo passwords are deliberately public.

## Troubleshooting

- **`node:sqlite` cannot be found:** Install Node 24 or newer, reopen the terminal, and check `node --version`.
- **The frontend cannot reach the API:** Run `npm run dev` from the project root and keep both services running. Check that port 3001 is available.
- **A change is rejected after changing ports:** Set `APP_ORIGIN` to the actual address you use in the browser, then restart the server.
- **Login does not persist on a deployed app:** Check HTTPS, `APP_ORIGIN`, and reverse-proxy forwarding. Production cookies require a secure connection.
- **The video frame waits for a moderator:** Complete Jitsi's host sign-in flow or use your own configured Jitsi deployment.
- **Camera or microphone unavailable:** Check browser/site permissions and whether another application is using the device.
- **Database cannot be written:** Confirm the directory in `DB_PATH` exists or can be created, and that the app user has write permission.

To start a fresh demonstration, stop the server, back up any records you want to keep, and move the `data` folder outside the project. Restart with `SEED_DEMO=true`; a new database will be created. This starts a new demo rather than preserving the old records.
#   N u t r i t i o n _ F i n a l s  
 
