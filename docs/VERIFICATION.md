# Verification record

Verified on 24 October 2026 using Node.js 25.1.0 on Windows.

- Production Vite build: passed.
- Dependency audit at installation: 0 reported vulnerabilities.
- Automated backend suite: 11 tests passed. Covers authentication, registration, record ownership, nutrition input validation, hydration persistence, appointment conflicts/cancellation, clinician permissions, shared-plan privacy, request origin protection, database persistence, secure production cookies, and logout.
- Browser checks: patient demo login, meal creation, persistence after reload, booking a free appointment slot, consultation prejoin screen and unique room link, logout, clinician login, and patient chart displaying the newly logged meal.
- Narrow-screen visual inspection: login, dashboard, and mobile navigation checked; hero illustration adjusted to avoid heading overlap.

Not verified here: a real two-participant camera/microphone call, third-party Jitsi moderator authentication, Docker image execution, or a public deployment. The manual checklist in DEMO-GUIDE.md covers the two-browser call. Public Jitsi is an external dependency; the app includes a same-room new-tab fallback.

This ZIP is a local, deployable classroom MVP. It has not been published to a hosting service and is not certified for clinical use.
