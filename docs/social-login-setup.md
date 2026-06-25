# Social Login Setup (Google + Meta)

How to obtain and configure the OAuth credentials that power **"Continue with Google"**
and **"Continue with Meta"** on the login/signup pages.

Social login is **identity only** — it signs a user into (or creates) their tenant
account. Connecting WhatsApp is a separate step (Embedded Signup). Meta social login
reuses the **same Meta app** as WhatsApp Embedded Signup, so a user who signs in with
Meta can continue into Embedded Signup without logging into Facebook again.

---

## 0. Before you start — know your two URLs

| Placeholder | What it is | Example |
|---|---|---|
| `<BACKEND_URL>` | Public base URL of the API **including the `/api` prefix** this app serves under. No trailing slash. | `https://whatsappdemo.duckdns.org/api` |
| `<FRONTEND_URL>` | Public URL of the web app (where users land after login). | `https://whatsappdemo.duckdns.org` |

> ⚠️ **This app serves the API under `/api`** (nginx + a global `api` prefix), so
> `<BACKEND_URL>` **must include `/api`**. This is exactly the value of
> `OAUTH_CALLBACK_BASE_URL`. Real values:
> - prod: `https://whatsappdemo.duckdns.org/api`
> - staging: `https://staging.whatsappdemo.duckdns.org/api`

The OAuth **redirect URIs** are `<BACKEND_URL>` + a fixed path:

- Google: `<BACKEND_URL>/auth/oauth/google/callback`
  → e.g. `https://whatsappdemo.duckdns.org/api/auth/oauth/google/callback`
- Meta: `<BACKEND_URL>/auth/oauth/meta/callback`
  → e.g. `https://whatsappdemo.duckdns.org/api/auth/oauth/meta/callback`

> ⚠️ These must match **character-for-character** in the provider console
> (https, the `/api` segment, exact domain, no trailing slash). A mismatch is the
> #1 cause of `redirect_uri_mismatch` errors.

---

## 1. Google — Client ID + Client Secret

1. Open **Google Cloud Console** → https://console.cloud.google.com/
2. Create or select a **project** (top bar).
3. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - App name, user support email, developer contact email.
   - Scopes: add `openid`, `email`, `profile`.
   - Add your domain under **Authorized domains**.
   - While testing: add your account under **Test users**. To allow anyone:
     **Publish app** (may require Google verification for many users).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**.
   - **Authorized redirect URIs** → add exactly:
     ```
     <BACKEND_URL>/auth/oauth/google/callback
     ```
   - (Optional) **Authorized JavaScript origins**: `<FRONTEND_URL>`
5. Click **Create** → copy the **Client ID** and **Client Secret**.

---

## 2. Meta — App ID + App Secret (reuse the existing WhatsApp app)

You already use `META_APP_ID` / `META_APP_SECRET` for WhatsApp Embedded Signup.
Add **Facebook Login** to that **same app** — don't create a new one.

> Meta changed the dashboard: the old **"Add Product"** button is often gone, replaced
> by a **"Use cases"** view. Use whichever of these matches what you see.

### a) Find / add Facebook Login

**If you see a "Use cases" tab (newer dashboard):**
1. App dashboard → **Use cases** → **Add use case** (or **Customize** an existing one).
2. Pick **"Authenticate and request data from users with Facebook Login"**.
3. Open it → **Customize** → it exposes the Facebook Login **Settings** (next step).

**If you see a "Products" list in the left sidebar (classic dashboard):**
1. Left sidebar → **+ Add product** → **Facebook Login** → **Set up**.
2. If it's already added, there's nothing to add — it's already listed under **Products**.

**If the dashboard already shows "Facebook Login" in the left nav:** it's installed —
skip straight to (b).

### b) Set the redirect URI

1. Left nav → **Facebook Login → Settings** (under the use case / product).
2. Turn ON **Client OAuth Login** and **Web OAuth Login**.
3. **Valid OAuth Redirect URIs** → add exactly (note the `/api`):
   ```
   <BACKEND_URL>/auth/oauth/meta/callback
   ```
   e.g. `https://whatsappdemo.duckdns.org/api/auth/oauth/meta/callback`
4. **Save changes.**

### c) Get the credentials

**App settings → Basic** → copy **App ID** and **App Secret**.

### Notes / gotchas

- **Email permission:** Facebook only returns the user's **email** if the app has the
  `email` permission. `public_profile` + `email` are standard, but for users outside
  your dev roles in **Live mode**, Meta may require **App Review / Advanced Access**
  for `email`. While developing, add testers under **App roles → Roles** so they can
  log in without review.
- **"Facebook Login **for Business**" only?** Business-type apps (WhatsApp apps are
  Business apps) sometimes expose only *Facebook Login for Business*, which uses a
  **configuration** and business-asset permissions instead of the simple
  `email`/`public_profile` consumer flow this app's social login uses. If your app
  shows only the "for Business" variant and the Meta button then returns no email or
  errors, tell us — the backend can be pointed at a Facebook-Login-for-Business
  **configuration ID**, or you can use a separate consumer app just for login. Many
  Business apps still expose the plain **Facebook Login** product, which works as-is.
- The WhatsApp Embedded Signup config (`META_EMBEDDED_SIGNUP_CONFIG_ID`) is **separate**
  from Facebook Login and must have **Coexistence** enabled — that's the WhatsApp setup,
  not this.

---

## 3. Where to enter the credentials

The backend reads each value from the **database first, then the environment**, so
either method works (DB overrides env).

### Option A — Super-admin UI (recommended)
1. Log in as a super-admin → **`/admin/settings` → "Auth & Social Login"**.
2. Paste **Google Client ID / Secret** (and Meta App ID / Secret / Embedded Signup
   Config ID if you want to manage them here too).
3. Toggle each provider **Enabled**.
4. **Save.**

Secrets are encrypted at rest and shown masked. A provider's button only appears on
the login/signup page once it is **enabled AND configured**.

### Option B — Environment variables (`.env`)
```env
# Social login (Google)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Meta social login reuses the WhatsApp app:
META_APP_ID=...
META_APP_SECRET=...

# Public URLs (no trailing slash). OAUTH_CALLBACK_BASE_URL MUST include /api.
OAUTH_CALLBACK_BASE_URL=https://whatsappdemo.duckdns.org/api   # = <BACKEND_URL>
FRONTEND_URL=https://whatsappdemo.duckdns.org                  # = <FRONTEND_URL>
```
Restart the backend after editing `.env`.

> `OAUTH_CALLBACK_BASE_URL` and `FRONTEND_URL` are deployment-level and only come
> from env (not the admin UI), because they define where redirects go.

---

## 4. Environment variable reference

| Variable | Required | Set in | Notes |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | for Google | admin UI or env | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | for Google | admin UI or env | keep secret |
| `META_APP_ID` | for Meta | admin UI or env | same app as WhatsApp |
| `META_APP_SECRET` | for Meta | admin UI or env | keep secret |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | for WhatsApp connect | admin UI or env | Coexistence-enabled config |
| `OAUTH_CALLBACK_BASE_URL` | yes | env only | backend public URL **including `/api`**, no trailing slash |
| `FRONTEND_URL` | yes | env only | frontend public URL, no trailing slash |

---

## 5. Verify it works

1. Open the login page — the enabled provider button(s) should appear.
   - No buttons? The provider isn't enabled + configured (check `/admin/settings`).
2. Click **Continue with Google / Meta** → the provider consent screen opens.
3. Approve → you're redirected back and land in the app:
   - **New email →** a tenant account is created and you go to `/onboarding`.
   - **Existing email →** you're logged in and go to `/dashboard`.

### Troubleshooting
| Symptom | Likely cause |
|---|---|
| `redirect_uri_mismatch` | Redirect URI in the console ≠ `<BACKEND_URL>/auth/oauth/<provider>/callback` exactly |
| Button doesn't appear | Provider not enabled or creds missing in `/admin/settings` |
| Redirected to login with `?error=oauth&message=...` email error | Provider didn't share an email (grant email permission / Meta App Review) |
| Returns to login with `oauth_unconfigured` | Creds not set for that provider |
| Logged in but session lost on next page | Cookie/CORS: confirm `OAUTH_CALLBACK_BASE_URL` and `FRONTEND_URL` are correct and `CORS_ORIGIN` includes the frontend |

---

## 6. How it maps to the code (for reference)
- Routes: `GET /auth/oauth/:provider` (start) and `GET /auth/oauth/:provider/callback`
  (`src/modules/auth/auth.controller.ts`).
- Provider availability: `GET /auth/oauth/providers` (public) → drives which buttons show.
- Credential resolution + encryption: `src/modules/platform-config/platform-config.service.ts`
  (DB-first, env fallback).
- Super-admin endpoints: `GET/PUT /admin/platform-config`.
- Frontend buttons: `frontend/src/app/features/auth/social-login-buttons.component.ts`.
- Admin settings page: `frontend/src/app/features/super-admin/settings/admin-settings.component.ts`.
