# Admin accounts, Google sign-in, and Gmail recovery

The code supports three roles: patient, dietitian, and administrator. Public registration and new Google users receive patient access only. Only an administrator can create dietitian accounts.

Existing clinical tables are retained. Administrator identities and sessions are stored separately; the update does not rebuild or delete patient records.

## 1. Create the first administrator

In **Render → Environment**, add:

| Key | Value |
| --- | --- |
| `ADMIN_EMAIL` | Your own email address, not already used by a patient or dietitian account |
| `ADMIN_PASSWORD` | A private password with 12–256 characters |
| `ADMIN_NAME` | Your preferred display name |

Save and deploy. Sign in through the normal sign-in form using those credentials. There is no public admin-registration page and no default admin password.

This configuration initializes the first admin even when the database already has patients. It runs once: changing these environment values later does not replace the admin, change their password, or create another admin. After verifying sign-in, remove `ADMIN_PASSWORD` from Render to avoid retaining the bootstrap password there. Use password recovery for future changes once email is configured.

Inside the admin workspace:

1. Select **Add a dietitian**.
2. Enter the dietitian’s name, email, and initial password.
3. Confirm with your own administrator password.
4. Share the initial credentials privately with that dietitian. They can use password recovery to choose a new password after Gmail is configured.
5. Use **Patient assignments** to connect registered patients to their provider.

Patients with scheduled visits cannot be reassigned until those visits are completed or cancelled. Existing notes and appointments keep their original provider. Admins manage account metadata and assignments; they do not receive a clinical chart view.

## 2. Configure Google sign-in

Open [Google Cloud Console](https://console.cloud.google.com/) using the account that will own the integration.

1. Create or select a project for Savor Care.
2. Open **Google Auth Platform**. Complete the app name, support email, developer contact, and audience settings.
3. For classroom testing, choose the audience permitted by your account and add the intended testers where required.
4. Under **Clients**, create an OAuth client with application type **Web application**.
5. Add this exact **Authorized redirect URI**:

   ```text
   https://nutrition-finals.onrender.com/api/auth/google/callback
   ```

6. For local development, optionally add `http://localhost:5173/api/auth/google/callback`. If you preview the built app on port 3001, add `http://localhost:3001/api/auth/google/callback` too.
7. Copy the client ID and client secret directly into Render:

| Key | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Web OAuth client ID from Google |
| `GOOGLE_CLIENT_SECRET` | Private client secret from the same client |

Keep the existing start command:

```sh
APP_ORIGIN="$RENDER_EXTERNAL_URL" npm start
```

Save and redeploy. **Continue with Google** becomes available on the sign-in page. This redirect-based integration does not require placing client secrets in frontend code.

### How roles are handled

- A new Google identity creates a patient account and is assigned an existing dietitian.
- Google cannot request or choose an admin/dietitian role.
- A verified Gmail address, or a managed Google Workspace address, can sign into an existing account with the same email and retain its authorized role.
- Google accounts using other email providers are not automatically linked to existing password accounts; those users should use password sign-in.
- The verified Google subject is saved as the identity binding. Role information comes from the application database.
- State, browser cookies, PKCE, token verification, and nonce checks protect the callback.

Regular Google sign-in asks only for identity scopes: `openid`, `email`, and `profile`. It does not ask patients or dietitians for Gmail sending access.

## 3. Enable password recovery through Gmail

This uses the **Gmail HTTPS API**, not SMTP or a Gmail account password. Only the sender mailbox owner authorizes sending recovery emails.

1. In the same Cloud project, enable **Gmail API** from the API library.
2. Configure the consent screen for the send-only scope:

   ```text
   https://www.googleapis.com/auth/gmail.send
   ```

3. Add the sender Gmail account as a test user if the project is in testing mode.
4. Add `https://developers.google.com/oauthplayground` to the web client's authorized redirect URIs.
5. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
6. In its settings, enable **Use your own OAuth credentials**, then enter your client ID and client secret privately. Use offline access so a refresh token can be issued.
7. Authorize only the send-only scope above, signing in as the mailbox that should send Savor Care emails.
8. Exchange the authorization code for tokens. Copy the **refresh token**, not the access token, directly to Render.

Add these Render values:

| Key | Value |
| --- | --- |
| `GMAIL_FROM` | The exact Gmail/Workspace mailbox address you authorized |
| `GMAIL_REFRESH_TOKEN` | Private refresh token issued for that mailbox and OAuth client |

Retain `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Save and redeploy.

Do not share passwords, client secrets, access tokens, refresh tokens, or recovery links in screenshots or Git. Do not use the Playground's default credentials for this deployment.

**Testing-mode limitation:** Google's external testing authorizations for Gmail scopes normally expire after seven days, including refresh tokens. A public deployment must satisfy Google's applicable publishing/verification requirements; leaving a test grant in place is not a permanent email-delivery setup.

## 4. Verify recovery and Google access

Use real inboxes that you control for live acceptance:

- [ ] Sign in as the administrator.
- [ ] Create a dietitian and verify normal password sign-in.
- [ ] Sign out, choose **Forgot password?**, and submit a known account email.
- [ ] Check the inbox and spam folder for the recovery message.
- [ ] Open the link within 30 minutes, set a new password, and sign in.
- [ ] Confirm the old password and old signed-in sessions no longer work.
- [ ] Reusing the recovery link must fail.
- [ ] Repeat recovery for patient, dietitian, and admin accounts.
- [ ] Test Google with a new patient and an authorized existing dietitian/admin Gmail or Workspace address.
- [ ] Confirm a new Google user cannot access admin endpoints.

Recovery uses the same generic response for registered and unregistered addresses. Links are single-use, expire after 30 minutes, and only their hashes are stored. Requests are limited by IP and a persistent per-email cooldown. Delivery failure is recorded in a generic server warning without printing tokens or email addresses.

The admin status card reports whether email configuration is present; it does not prove inbox delivery. Until configuration is present, recovery explicitly reports that the website owner must configure it. There is no production fallback that prints or returns reset links.

## Current verification

Local browser checks cover admin login, dietitian creation, mobile assignments layout, simulated recovery, and sign-in with the recovered password. Automated Google tests use a mocked verifier; live Google consent and Gmail inbox delivery require the owner's configuration and have not been verified yet.

See [account verification](ACCOUNT-VERIFICATION.md) for test coverage.

## Official references

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Sending Gmail messages](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google app audience and testing](https://support.google.com/cloud/answer/15549945)
- [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
