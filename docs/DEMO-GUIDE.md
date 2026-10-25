# Savor Care · classroom demonstration

## Your opening

> Savor Care connects the everyday meal to the next conversation with a dietitian. It is designed around familiar Filipino food, a calm interface, and small habits people can actually describe. Today I will show one continuous flow: a patient signs in, records a meal, books a consultation, and receives a care update from their dietitian before both join the same video room.

Keep the demonstration synthetic. Maya, Alex, and all example records are fictional. Explain that the reading content is educational and the platform is a student MVP.

## Prepare before class

1. Run the app and confirm the interface loads.
2. Keep the project open in VS Code for the architecture explanation.
3. Sign in as Maya in one browser profile and Alex in another. Use the credentials in the README.
4. Check the internet connection and camera/microphone permissions. Use headphones to prevent feedback.
5. Test the external Jitsi moderator sign-in flow before presenting. A real video call depends on that service and the local network.
6. Use Manila time when choosing appointments. If a slot is unavailable, pick a different future slot.

## Five-minute presentation flow

| Time | Action | Point to explain |
| --- | --- | --- |
| 0:00–0:40 | Show the patient Overview | One place for everyday habits and upcoming care; custom illustrated food and warm colors |
| 0:40–1:30 | Add a meal in Food journal | A real saved record, with familiar food and contextual notes |
| 1:30–2:15 | Book a future consultation in Appointments | The database connects the selected patient, provider, time, and consultation room |
| 2:15–3:15 | Switch to Alex, open Patient charts, and save a note with sharing enabled | The provider can review the patient's journal and choose which care updates to share |
| 3:15–3:45 | Return to Maya and open Care plan | The patient can see the provider's saved guidance after reloading the view |
| 3:45–4:30 | Open the same appointment's consultation in both profiles | The authenticated application hands off to an embedded external video meeting |
| 4:30–5:00 | Show The reading room and briefly show the project structure | Original, locally relevant content plus a full-stack architecture that can be deployed |

Suggested fictional journal entry:

> Lunch: monggo, rice, and a small serving of fish. I had a short lunch break today and ate at my desk. I would like to make more time to notice when I am comfortably full.

Suggested fictional care update:

> Review the patient's meal rhythm and lunch-break routine together. Agreed experiment: take a short screen-free pause at one lunch this week and bring observations to the next visit. Review what felt practical at follow-up.

This example demonstrates the software workflow, not a clinical recommendation for a real person.

## Manual acceptance checklist

Run these steps against a fresh or known demo database. Record the actual result rather than assuming a check passed.

| Check | Steps | Expected result | Result |
| --- | --- | --- | --- |
| Patient login | Sign in with Maya's demo account | Patient navigation and saved data appear | ☐ |
| Wrong password | Try an incorrect password | A readable error appears and the user stays signed out | ☐ |
| Session restore | Sign in, then refresh | The same user remains signed in | ☐ |
| Sign out | Sign out, then reload | Protected screens require sign-in again | ☐ |
| Registration | Create a fictional patient using a new email | The new account can enter the patient workflow | ☐ |
| Journal save | Add a meal with all required fields | Entry appears in the Food journal | ☐ |
| Journal persistence | Reload after saving the meal | The saved entry remains | ☐ |
| Input validation | Submit a required form with missing values | The form explains what needs correction; no invalid record is saved | ☐ |
| Booking | Choose an available future appointment | The appointment appears in the patient and provider views | ☐ |
| Conflicting booking | Attempt an already-booked slot | The system prevents the duplicate slot | ☐ |
| Provider review | Sign in as Alex and open Maya's chart | Maya's relevant journal information is visible | ☐ |
| Provider update | Add a care update with sharing enabled and reload | The update remains saved in the chart | ☐ |
| Patient continuity | Reopen Maya's Care plan | The shared provider guidance is visible | ☐ |
| Private notes | Add a second provider note with sharing disabled | The provider can see it; the patient cannot | ☐ |
| Role protection | As a patient, attempt a provider API operation | The server rejects access | ☐ |
| Record isolation | Use a second fictional patient account | The new patient cannot read Maya's private records | ☐ |
| Meeting handoff | Open the same appointment in both profiles | Both views receive the same appointment meeting room | ☐ |
| Actual video call | Join on two devices with permissions granted | Participants can hear/see each other after any moderator sign-in | ☐ |
| Video permission denial | Decline camera permission | The application remains usable and permission can be retried in browser settings | ☐ |
| Small screen | Test a narrow mobile viewport | Navigation, cards, forms, and dialogs remain readable and usable | ☐ |
| Keyboard use | Navigate forms and dialogs with Tab/Enter/Escape | Controls can be reached and focus remains visible | ☐ |
| Database persistence | Restart the API and sign in again | Previously saved records remain | ☐ |
| Production bundle | Run the build and start commands | The built interface and API load from the Express service | ☐ |

Run `npm test` for automated backend checks, and record the result separately. Browser usability and real camera/microphone communication need the manual checks above.

## Architecture explanation

- **React + Vite:** the responsive screens, dialogs, forms, and meeting interface.
- **Express:** login, input validation, role checks, journal records, scheduling, and chart updates.
- **SQLite:** persistent users, sessions, meal logs, appointments, and chart information.
- **Jitsi External API:** the embedded third-party WebRTC meeting experience.
- **Production setup:** Express serves the built frontend and API, while a persistent volume retains SQLite data and HTTPS protects the hosted connection.

The app's access checks apply to application records. The default public Jitsi service has its own meeting admission behavior and may require moderator authentication. Explain that separation clearly if asked about security.

## What makes the project distinct

The concept starts with everyday Filipino food and supportive language. It avoids treating nutrition as a contest, gives the provider a view of the patient's actual routine, and connects the journal to the consultation. The custom plate illustration, warm neutral surfaces, deep green navigation, and coral highlights create a coherent identity across both roles.

Use the running application to demonstrate these choices. Present only checks you actually ran and label any live video or hosting step that has not yet been verified in your environment.
