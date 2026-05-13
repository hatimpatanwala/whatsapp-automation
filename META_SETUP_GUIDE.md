# Meta Account Setup Guide for WA Commerce Platform

Complete step-by-step guide to configure your Meta developer account, WhatsApp Cloud API, and Embedded Signup for your WA Commerce SaaS platform.

---

## Table of Contents

1. [Overview — What You're Setting Up](#1-overview)
2. [Phase 1: Meta Developer Account](#2-phase-1-meta-developer-account)
3. [Phase 2: Meta Business Portfolio](#3-phase-2-meta-business-portfolio)
4. [Phase 3: Create the Meta App](#4-phase-3-create-the-meta-app)
5. [Phase 4: WhatsApp API Setup](#5-phase-4-whatsapp-api-setup)
6. [Phase 5: Business Verification](#6-phase-5-business-verification)
7. [Phase 6: Create System User & Permanent Token](#7-phase-6-create-system-user--permanent-token)
8. [Phase 7: Configure Webhooks](#8-phase-7-configure-webhooks)
9. [Phase 8: Set Up Facebook Login for Business (Embedded Signup)](#9-phase-8-set-up-facebook-login-for-business)
10. [Phase 9: Create Embedded Signup Configuration ID](#10-phase-9-create-embedded-signup-configuration-id)
11. [Phase 10: Configure Your .env File](#11-phase-10-configure-your-env-file)
12. [Phase 11: Test the Full Flow](#12-phase-11-test-the-full-flow)
13. [Phase 12: Go Live (Production)](#13-phase-12-go-live)
14. [Phase 13: Tech Provider Program (Optional, for Scale)](#14-phase-13-tech-provider-program)
15. [Troubleshooting](#15-troubleshooting)
16. [Quick Reference — All URLs](#16-quick-reference)

---

## 1. Overview

Your WA Commerce platform needs these Meta components:

```
┌─────────────────────────────────────────────────────────┐
│                  META BUSINESS PORTFOLIO                 │
│            (business.facebook.com)                       │
│                                                         │
│  ┌──────────────────┐    ┌────────────────────────┐     │
│  │   META APP        │    │   WHATSAPP BUSINESS    │     │
│  │ (developers.      │    │   ACCOUNT (WABA)       │     │
│  │  facebook.com)    │    │                        │     │
│  │                   │    │  ┌──────────────────┐  │     │
│  │ • App ID          │    │  │ Phone Number 1   │  │     │
│  │ • App Secret      │    │  │ (Tenant A)       │  │     │
│  │ • Webhooks        │    │  ├──────────────────┤  │     │
│  │ • FB Login config │    │  │ Phone Number 2   │  │     │
│  │ • Permissions     │    │  │ (Tenant B)       │  │     │
│  │                   │    │  ├──────────────────┤  │     │
│  │ SYSTEM USER ──────┼────┤  │ Phone Number N   │  │     │
│  │ (permanent token) │    │  │ (Tenant N)       │  │     │
│  └──────────────────┘    │  └──────────────────┘  │     │
│                           └────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

**What you'll have at the end:**
- `META_APP_ID` — Your app's Facebook App ID
- `META_APP_SECRET` — Your app's secret key
- `META_EMBEDDED_SIGNUP_CONFIG_ID` — Configuration ID for Embedded Signup
- `META_SYSTEM_USER_ID` — System user for API calls
- `META_SYSTEM_USER_TOKEN` — Non-expiring token for API calls
- `WHATSAPP_VERIFY_TOKEN` — Your custom webhook verify token
- Webhook URL configured and verified
- At least one WABA with a test phone number

---

## 2. Phase 1: Meta Developer Account

### Step 1.1: Create a Facebook Account (if you don't have one)

Go to **https://www.facebook.com/r.php** and create a personal Facebook account. This will be the admin of your developer account.

### Step 1.2: Register as a Meta Developer

1. Go to **https://developers.facebook.com/**
2. Click **"Get Started"** in the top-right corner
3. Alternatively, go directly to **https://developers.facebook.com/async/registration**
4. Accept **Meta Platform Terms** and **Developer Policies**
5. Verify your **phone number** (Meta sends an SMS code)
6. Verify your **email address** (Meta sends an email code)
7. Select your occupation/role
8. Click **Done**

You now have access to the **App Dashboard** at **https://developers.facebook.com/apps/**

---

## 3. Phase 2: Meta Business Portfolio

A Business Portfolio (formerly "Business Manager") is REQUIRED for WhatsApp API access.

### Step 2.1: Create a Business Portfolio

1. Go to **https://business.facebook.com/overview**
2. Click **"Create an account"** (or **"Create a Business Portfolio"**)
3. Enter:
   - **Business name**: Your platform/company name (e.g., "WA Commerce Platform")
   - **Your name**: Admin name
   - **Business email**: Your official business email
4. Click **Submit**

### Step 2.2: Note Your Business Portfolio ID

1. Go to **https://business.facebook.com/settings/**
2. In the left sidebar, click **Business info**
3. Copy the **Business Portfolio ID** (a numeric ID like `123456789012345`)
4. Save this — you'll need it later

---

## 4. Phase 3: Create the Meta App

### Step 3.1: Create a New App

1. Go to **https://developers.facebook.com/apps/creation/**
2. Fill in:
   - **App name**: `WA Commerce Platform` (or your platform name)
   - **Contact email**: Your business email
3. Click **Next**

### Step 3.2: Select Use Case

1. Select **"Connect with customers through WhatsApp"** from the use case list
   - This is Meta's dedicated WhatsApp Business Platform use case
   - It automatically configures the correct app type and adds the WhatsApp product
   - **Note**: The old "Other" option is no longer available. Meta now provides direct use case options.
2. Click **Next**

### Step 3.3: Connect Business Portfolio

1. Select your **Business Portfolio** from the dropdown (created in Phase 2)
2. Click **"Create app"**

### Step 3.4: Collect App Credentials

1. You'll land on the **App Dashboard**
2. Go to **Settings > Basic** (left sidebar)
   - URL: `https://developers.facebook.com/apps/{YOUR_APP_ID}/settings/basic/`
3. Copy and save:
   - **App ID** → This is your `META_APP_ID`=1699754718125609
   - **App Secret** → Click "Show", enter password, copy → This is your `META_APP_SECRET`=19e6278a90fc0ac68efd99441ae2f197

4. While here, fill in:
   - **Privacy Policy URL**: Your platform's privacy policy page
   - **Terms of Service URL**: Your platform's terms page
   - **App Icon**: Upload your platform logo (1024x1024, no Meta trademarks)
   - **Category**: Select "Business and Pages" or "Messaging"
5. Click **Save Changes**

---

## 5. Phase 4: WhatsApp API Setup

> **Note**: If you selected the **"Connect with customers through WhatsApp"** use case in Phase 3, the WhatsApp product is already added to your app automatically. You can skip directly to Step 4.1 below.
>
> If you created the app without the WhatsApp use case, you'll need to manually add it:
> 1. From your App Dashboard, click **"Add Product"** in the left sidebar
> 2. Find **"WhatsApp"** in the product list and click **"Set Up"**
> 3. Select your **Business Portfolio** and click **Continue**
> 4. Accept the WhatsApp Business Platform Terms of Service

### Step 4.1: API Setup — Get Test Credentials

1. In the left sidebar, navigate to **WhatsApp > API Setup**
   - URL: `https://developers.facebook.com/apps/{YOUR_APP_ID}/whatsapp-business/wa-dev-console/`
2. You'll see:
   - **Temporary Access Token**: A 24-hour test token (NOT for production)
   - **Phone Number ID**: A Meta-provided test phone number
   - **WhatsApp Business Account ID**: Your test WABA ID
3. Copy all three — you'll use them for testing

### Step 4.2: Send a Test Message

1. On the same API Setup page, scroll down to **"Send and receive messages"**
2. Add your personal phone number under **"To"** (you need to add recipient numbers for test mode)
3. Click **"Send Message"** to verify the test number works
4. Check your WhatsApp — you should receive "Hello World" from the test number

---

## 6. Phase 5: Business Verification

Choose the path that matches your situation:

- **Path A** — Individual developer / no registered business → Skip verification, use test mode
- **Path B** — Registered business → Complete verification for full production access

---

### Path A: Individual Developer (No Business Verification)

You can develop and test the entire platform **without** business verification. Meta automatically gives you a test environment when you add the WhatsApp product.

#### What You Get Without Verification

| Feature | Available? | Limitation |
|---------|-----------|------------|
| Test WABA + test phone number | ✅ Yes | Auto-created in Phase 4 |
| Send messages | ✅ Yes | **Up to 5 recipient numbers only** |
| Receive inbound messages | ✅ Yes | Only from your 5 test recipients |
| Webhooks | ✅ Yes | Fully functional |
| Templates | ✅ Yes | Can create and send |
| Embedded Signup (for tenants) | ❌ No | Requires verification |
| Add your own phone number | ❌ No | Requires verification |
| Messaging limits above 250/day | ❌ No | Requires verification |

#### Step 5A.1: Add Test Recipients

1. Go to **WhatsApp > API Setup** in your app dashboard
2. Under **"Send and receive messages"**, click the **"To"** dropdown
3. Click **"Manage phone number list"**
4. Add up to **5 phone numbers** you want to test with:
   - Enter the phone number (with country code, e.g., `+919876543210`)
   - The number will receive a **confirmation code via WhatsApp**
   - Enter the code to verify the recipient
5. Repeat for each test number (max 5)

#### Step 5A.2: Understand Development Mode Limitations

- Your app is in **Standard Access** — only people with roles on the app can interact
- The test phone number is shared across all developers (you can't customize its display name)
- Message templates may take longer to approve without verification
- **No payment method required** for test messages

#### Step 5A.3: When to Upgrade to Verification

You'll need to complete Path B (business verification) when:
- You're ready to onboard real tenants via Embedded Signup
- You need to send messages to more than 5 numbers
- You want to register your own business phone number
- You need higher messaging throughput (250+ messages/day)

> **Tip**: You can develop and test the entire platform end-to-end — workflows, commerce, payments, webhook processing — using just the test number and 5 recipients. Verification is only needed when going live.

---

### Path B: Business Verification (For Production)

**Business verification is REQUIRED to:**
- Send messages to customers (not just test numbers)
- Add your own phone numbers (not just Meta test numbers)
- Get higher messaging limits (250 → 1K → 10K → 100K/day)
- Use Embedded Signup to onboard tenants

#### Step 5B.1: Start Verification

1. Go to **https://business.facebook.com/settings/security/**
2. Or navigate: Business Settings > Security Center
3. Click **"Start Verification"**

#### Step 5B.2: Provide Business Details

Enter:
- **Legal business name** (must match official documents)
- **Business address**
- **Business phone number**
- **Business website** (must be live and HTTPS)

#### Step 5B.3: Upload Documents

Meta accepts (provide ONE of these):
- Business registration certificate
- Tax registration document (GST certificate in India)
- Utility bill with business name and address
- Bank statement with business name

#### Step 5B.4: Verify Phone or Email

Meta will contact you via the phone/email you provided to confirm identity.

#### Step 5B.5: Wait for Approval

- Typical time: **2-5 business days**
- Check status at **https://business.facebook.com/settings/security/**
- Status will change from "Pending" → "Verified"

---

## 7. Phase 6: Create System User & Permanent Token

The temporary token from Phase 4 expires in 24 hours. You need a **System User** with a **permanent token** for production API calls.

> **Individual developers (Path A)**: You can still create a System User even without business verification. You need a Business Portfolio (created in Phase 2), but it doesn't need to be verified. The System User + permanent token will work with your test WABA and test phone number. This is recommended so your backend doesn't break every 24 hours when the temp token expires.

### Step 6.1: Create a System User

1. Go to **https://business.facebook.com/settings/system-users/**
   - Or: Business Settings > Users > System Users
2. Click **"Add"** button
3. Enter:
   - **System User Name**: `WA Commerce API` (or similar)
   - **Role**: Select **Admin**
4. Click **"Create System User"**

### Step 6.2: Assign WhatsApp Assets to System User

1. Click on the system user you just created
2. Click **"Add Assets"**
3. Select the **"Apps"** tab
4. Find your app (created in Phase 3) and select it
5. Enable **"Full Control"** / **"Manage app"** permission
6. Click **"Save Changes"**
7. Click **"Add Assets"** again
8. Select the **"WhatsApp Accounts"** tab
9. Find your WABA and select it
10. Enable **"Full Control"** permission
11. Click **"Save Changes"**

### Step 6.3: Generate Permanent Token

1. Still on the System User page, click **"Generate New Token"**
2. Select **your app** from the dropdown
3. Set **Token Expiration**: "Never" (for permanent token)
4. Select these permissions:
   - ✅ `whatsapp_business_management`
   - ✅ `whatsapp_business_messaging`
   - ✅ `business_management`
5. Click **"Generate Token"**
6. **COPY THE TOKEN IMMEDIATELY** — it will only be shown once!
7. Save this as your `META_SYSTEM_USER_TOKEN`
<!-- EAAYJ6vwt3ikBRZAoA3zYi2fUwyTrJdiFZCzy5LHcuMlsCbpNyjsmd0AYxZCaOZCdf4MsujlA91vcKvxqQsqczoBN3kMpYElAf4ycvmmU3fsQmnGSyHng5Fqg1tTrJJBGGGpORiV6mD9046bqCqoutRu0KE3LLcOamZBdRA1KZCJX4zusE46n0SlIOit2cHC4vomgZDZD -->
### Step 6.4: Note the System User ID

1. On the System User page, you'll see the user's **ID** (numeric)
2. Save this as your `META_SYSTEM_USER_ID` =61586540331396

---

## 8. Phase 7: Configure Webhooks

Webhooks let Meta notify your server when messages arrive, statuses change, etc.

### Step 7.1: Ensure Your Server is Publicly Accessible

Your webhook endpoint must be:
- **HTTPS** (valid TLS/SSL certificate, NO self-signed)
- **Publicly accessible** from the internet
- Responds within **20 seconds**

Your endpoint URL will be: `https://yourdomain.com/api/webhook/whatsapp`

For local development, use **ngrok**:
```bash
ngrok http 3000
# Use the https URL it gives you, e.g., https://abc123.ngrok-free.app
```

### Step 7.2: Choose a Verify Token

Create a random string for webhook verification. Example:
```
my_wa_commerce_verify_token_2024
```
Save this as your `WHATSAPP_VERIFY_TOKEN`

### Step 7.3: Configure Webhook in Meta Dashboard

1. Go to your app dashboard
2. Navigate to **WhatsApp > Configuration** in the left sidebar
   - URL: `https://developers.facebook.com/apps/{YOUR_APP_ID}/whatsapp-business/wa-settings/`
3. Under **"Webhook"** section, click **"Edit"**
4. Enter:
   - **Callback URL**: `https://yourdomain.com/api/webhook/whatsapp`
   - **Verify Token**: The token you created in Step 7.2
5. Click **"Verify and Save"**

Meta will send a GET request to your URL with `hub.verify_token` — your server must respond with `hub.challenge`. Your NestJS backend already handles this in `whatsapp-webhook.controller.ts`.

### Step 7.4: Subscribe to Webhook Fields

After verification succeeds:
1. On the same Configuration page, under **"Webhook fields"**
2. Click **"Manage"**
3. Subscribe to these fields (toggle each one ON):
   - ✅ `messages` — Inbound messages from customers
   - ✅ `message_template_status_update` — Template approval/rejection
   - ✅ `message_template_quality_update` — Template quality changes
   - ✅ `phone_number_quality_update` — Phone quality rating changes
   - ✅ `phone_number_name_update` — Display name changes
   - ✅ `account_update` — WABA account changes
   - ✅ `account_review_update` — WABA review status
   - ✅ `business_capability_update` — Capability changes
   - ✅ `security` — Security notifications
   - ✅ `flows` — WhatsApp Flows events
4. Click **"Done"**

### Step 7.5: Subscribe App to WABA (CRITICAL)

> **WARNING**: In Meta's newer UI, adding webhook fields does NOT automatically subscribe your app to the WABA. You MUST do this manually or via API.

**Option A — Via API (Recommended):**
```bash
curl -X POST "https://graph.facebook.com/v21.0/{YOUR_WABA_ID}/subscribed_apps" -H "Authorization: Bearer EAAYJ6vwt3ikBRZAoA3zYi2fUwyTrJdiFZCzy5LHcuMlsCbpNyjsmd0AYxZCaOZCdf4MsujlA91vcKvxqQsqczoBN3kMpYElAf4ycvmmU3fsQmnGSyHng5Fqg1tTrJJBGGGpORiV6mD9046bqCqoutRu0KE3LLcOamZBdRA1KZCJX4zusE46n0SlIOit2cHC4vomgZDZD"
```

Expected response:
```json
{ "success": true }
```

**Verify the subscription:**
```bash
curl "https://graph.facebook.com/v21.0/1642870743653301/subscribed_apps" -H "Authorization: Bearer EAAYJ6vwt3ikBRZAoA3zYi2fUwyTrJdiFZCzy5LHcuMlsCbpNyjsmd0AYxZCaOZCdf4MsujlA91vcKvxqQsqczoBN3kMpYElAf4ycvmmU3fsQmnGSyHng5Fqg1tTrJJBGGGpORiV6mD9046bqCqoutRu0KE3LLcOamZBdRA1KZCJX4zusE46n0SlIOit2cHC4vomgZDZD"
```

Expected response:
```json
{
  "data": [{
    "whatsapp_business_api_data": {
      "id": "YOUR_APP_ID",
      "link": "...",
      "name": "WA Commerce Platform"
    }
  }]
}
```

**Option B — Via Dashboard:**
1. Go to **WhatsApp > Configuration**
2. Under your WABA, verify the app subscription is listed
3. If not, click the subscribe/link button

---

## 9. Phase 8: Set Up Facebook Login for Business

This is required for **Embedded Signup** — the "Connect with Facebook" button in your onboarding.

### Step 8.1: Add Facebook Login for Business Product

1. In your App Dashboard, click **"Add Product"** in the left sidebar
2. Find **"Facebook Login for Business"** (NOT regular "Facebook Login")
3. Click **"Set Up"**

### Step 8.2: Configure OAuth Settings

1. Navigate to **Facebook Login for Business > Settings** in the left sidebar
   - URL: `https://developers.facebook.com/apps/{YOUR_APP_ID}/fb-login-for-business/settings/`
2. Under **"Client OAuth settings"**, enable:
   - ✅ **Client OAuth Login** → Yes
   - ✅ **Web OAuth Login** → Yes
   - ✅ **Enforce HTTPS** → Yes
   - ✅ **Embedded Browser OAuth Login** → Yes
   - ✅ **Use Strict Mode for redirect URIs** → Yes
   - ✅ **Login with the JavaScript SDK** → Yes
3. Under **"Valid OAuth Redirect URIs"**, add your domains:
   ```
   https://yourdomain.com/
   https://yourdomain.com/onboarding
   ```
   For development, also add:
   ```
   https://localhost:4200/
   ```
4. Under **"Allowed Domains for the JavaScript SDK"**, add the SAME domains:
   ```
   https://yourdomain.com
   https://localhost:4200
   ```
5. Click **"Save Changes"**

> **IMPORTANT**: The domains in "Allowed Domains" and "Valid OAuth Redirect URIs" MUST include every domain where your Angular app runs. Only HTTPS is supported.

---

## 10. Phase 9: Create Embedded Signup Configuration ID

This is the `META_EMBEDDED_SIGNUP_CONFIG_ID` your frontend needs.

### Step 9.1: Create a Configuration

1. Navigate to **Facebook Login for Business > Configurations** in the left sidebar
   - URL: `https://developers.facebook.com/apps/{YOUR_APP_ID}/fb-login-for-business/configurations/`
2. Click **"Create Configuration"** (or **"Create from template"**)
3. Select the template: **"WhatsApp Embedded Signup Configuration With 60 Expiration Token"**
   - This pre-configures the right permissions and token type

### Step 9.2: Configure Permissions

If creating manually (or editing the template):

1. **Configuration name**: `WA Commerce Embedded Signup`
2. **Choose access token**: Select **"System-user access token"**
3. **Token expiration**: Leave as **60 days** (default)
4. **Assets**: Select **"WhatsApp accounts"** under assets
5. **Permissions**: Ensure these are selected:
   - ✅ `whatsapp_business_management`
   - ✅ `whatsapp_business_messaging`
   - ✅ `business_management`
6. Click **"Create"** (or **"Save"**)

### Step 9.3: Copy the Configuration ID

After creation:
1. You'll see the new configuration listed with a **Configuration ID**
2. Copy this ID (looks like `1234567890123456`)
3. Save it as your `META_EMBEDDED_SIGNUP_CONFIG_ID`=1302193481292705

---

## 11. Phase 10: Configure Your .env File

Now fill in all the environment variables in your backend `.env` file.

> **Tip**: Copy `.env.example` from the project root and fill in the values below.

### Meta / WhatsApp Variables

```bash
# ─── Meta Platform / Embedded Signup ──────────────────────────────────

# From Phase 3, Step 3.4
META_APP_ID=123456789012345
META_APP_SECRET=abcdef1234567890abcdef1234567890

# From Phase 9, Step 9.3
META_EMBEDDED_SIGNUP_CONFIG_ID=987654321098765

# Graph API version (used by onboarding, WABA, and compliance modules)
META_GRAPH_API_VERSION=v21.0

# From Phase 6, Step 6.4
META_SYSTEM_USER_ID=109876543210987

# From Phase 6, Step 6.3
META_SYSTEM_USER_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─── WhatsApp Cloud API (Messaging) ──────────────────────────────────

# IMPORTANT: WHATSAPP_APP_SECRET must be the SAME value as META_APP_SECRET
# It is used separately by the webhook signature verification guard
WHATSAPP_APP_SECRET=abcdef1234567890abcdef1234567890
WHATSAPP_API_VERSION=v21.0
WHATSAPP_API_URL=https://graph.facebook.com

# From Phase 7, Step 7.2
WHATSAPP_VERIFY_TOKEN=my_wa_commerce_verify_token_2024

# ─── Token Encryption (REQUIRED — app will crash without this) ───────
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex').slice(0,32))"
TOKEN_ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### Infrastructure Variables

```bash
# ─── Database (PostgreSQL) ────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=whatsapp_commerce
DB_POOL_SIZE=50

# ─── Redis ────────────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ─── Session ──────────────────────────────────────────────────────────
SESSION_SECRET=change-me-in-production-use-strong-secret

# ─── Queue (BullMQ) ──────────────────────────────────────────────────
QUEUE_REDIS_HOST=localhost
QUEUE_REDIS_PORT=6379

# ─── AWS S3 / CDN (for media uploads) ────────────────────────────────
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
S3_BUCKET=whatsapp-commerce-media
CLOUDFRONT_DOMAIN=cdn.yourapp.com

# ─── Razorpay (Payments — India) ─────────────────────────────────────
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

### Optional Variables

```bash
# ─── Observability ────────────────────────────────────────────────────
SENTRY_DSN=                                    # Sentry error tracking
OTEL_ENABLED=false                             # OpenTelemetry tracing
OTEL_ENDPOINT=http://localhost:4318/v1/traces  # OTLP collector

# ─── Admin Seed ──────────────────────────────────────────────────────
ADMIN_EMAIL=admin@wacommerce.in
ADMIN_PASSWORD=Admin@123456
```

---

## 12. Phase 11: Test the Full Flow

### Test 1: Webhook Verification

```bash
# Your server should be running
curl "https://yourdomain.com/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=my_wa_commerce_verify_token_2024&hub.challenge=1234567890"

# Expected response: 1234567890
```

### Test 2: Send a Test Message via API

```bash
curl -X POST \
  "https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {META_SYSTEM_USER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "YOUR_PERSONAL_PHONE",
    "type": "text",
    "text": { "body": "Hello from WA Commerce!" }
  }'
```

### Test 3: Embedded Signup Config

```bash
# Hit your backend endpoint
curl "https://yourdomain.com/api/onboarding/embedded-signup/config"

# Expected response:
# {
#   "appId": "123456789012345",
#   "configId": "987654321098765",
#   "version": "v21.0",
#   "loginParams": {
#     "scope": "whatsapp_business_management,whatsapp_business_messaging",
#     "extras": {
#       "featureType": "whatsapp_business_app_onboarding",
#       "sessionInfoVersion": 3
#     }
#   }
# }
```

### Test 4: Full Embedded Signup Flow

1. Start your Angular frontend (`ng serve`)
2. Register a new tenant account
3. On the onboarding page, click **"Connect with Facebook"**
4. The Facebook Login popup should appear
5. Log in, select/create a WABA, add a phone number
6. After completion, your backend should:
   - Exchange the auth code for tokens
   - Sync the WABA and phone number
   - Subscribe webhooks
   - Show success in the frontend

### Test 5: Manual Number Registration

1. On the onboarding page, click **"Register number manually instead"**
2. Enter a phone number
3. The system should detect the number's state and route accordingly

---


## 13. Phase 12: Go Live (Production)

### Step 12.1: Enable Production Access

Business-type apps (created with the WhatsApp use case) use **access levels** instead of the traditional Development/Live mode toggle.

1. Go to **App Review > Permissions and Features**
   - URL: `https://developers.facebook.com/apps/{YOUR_APP_ID}/review/`
2. For each permission, ensure it has **Advanced Access** (not just Standard Access):
   - `whatsapp_business_management` → Advanced Access
   - `whatsapp_business_messaging` → Advanced Access
3. If a permission shows **Standard Access**, click **"Request Advanced Access"** and complete App Review (see Step 12.2)

> **Standard Access**: Only app admins/developers/testers can interact (similar to old Development mode)
> **Advanced Access**: Any user can go through Embedded Signup (similar to old Live mode)
>
> **Note**: If your app has a legacy App Mode toggle at the top of the dashboard, switch it to **"Live"** as well. Newer Business apps may not show this toggle.

### Step 12.2: Complete App Review (if required)

If Step 12.1 required you to request Advanced Access, complete the App Review:

1. Go to **App Review > Permissions and Features**
   - URL: `https://developers.facebook.com/apps/{YOUR_APP_ID}/review/`
2. For each permission requiring review, provide:
   - **Screen recording** showing how your platform uses the permission
   - **Description** of use case
3. Submit for review (typically **5 business days**)
4. Once approved, permissions will show **Advanced Access**

### Step 12.3: Add Your Production Phone Number

1. Go to **WhatsApp > API Setup > Phone Numbers**
2. Click **"Add Phone Number"**
3. Enter:
   - **Business display name**: Your platform name
   - **Phone number**: Your production number
4. Verify via OTP (SMS or voice call)

### Step 12.4: Set Up Payment Method (for Meta's messaging fees)

1. Go to **https://business.facebook.com/billing/**
2. Click **"Payment Settings"**
3. Add a payment method:
   - Credit/Debit card
   - UPI auto-debit (India)
   - Direct debit (select countries)
4. This pays Meta's **per-message fees** for ALL phone numbers under your WABA

> **Pricing update (July 1, 2025)**: Meta switched from per-conversation to **per-message pricing**. You are only charged when a template message is delivered. Rates vary by template category (marketing, utility, authentication) and recipient's country. Utility templates sent within an open customer service window (in response to a user message) are **free**.

### Step 12.5: Add Your Production WABA to Your System

Use the admin API or seed script to register your WABA in the database:

```bash
curl -X POST "https://yourdomain.com/api/admin/waba/accounts/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "wabaId": "YOUR_WABA_ID",
    "accessToken": "YOUR_SYSTEM_USER_TOKEN"
  }'
```

This will:
- Create/update the `waba_accounts` record
- Sync all phone numbers from Meta
- Store the encrypted token

---

## 14. Phase 13: Tech Provider Program (Optional, for Scale)

If you plan to onboard many businesses (>10), you should join Meta's **Tech Provider Program**.

### Why

- **Mandatory** for ISVs offering WhatsApp as a service (deadline was June 30, 2025 — now enforced)
- Enables Embedded Signup with Solution ID
- Gets your app officially reviewed and approved by Meta
- Higher rate limits and priority support

### How to Apply

1. Go to **https://developers.facebook.com/apps/{YOUR_APP_ID}/whatsapp-business/wa-settings/**
2. Look for **"Tech Provider"** or **"Partner Solutions"** section
3. Accept Tech Provider Terms
4. Select **"Independent Tech Provider"**
5. Complete App Review with advanced access for both permissions
6. After approval, create a **Partner Solution**:
   - Go to **WhatsApp > Partner Solutions**
   - Click **"Create a partner solution"**
   - Enter your solution name
   - You'll get a **Solution ID**
7. Use the Solution ID in your Embedded Signup code:

```javascript
FB.login(callback, {
  config_id: 'YOUR_CONFIG_ID',
  response_type: 'code',
  override_default_response_type: true,
  extras: {
    setup: {
      solutionID: 'YOUR_SOLUTION_ID',  // <-- from Partner Solutions
    },
    featureType: 'whatsapp_business_app_onboarding',  // Required for business app onboarding
    sessionInfoVersion: 3,  // Use version 3 for latest features
  },
});
```

---

## 15. Troubleshooting

### "Webhook verification failed"

- Ensure your server is running and publicly accessible (HTTPS)
- Verify the callback URL is exactly right (no trailing slash mismatch)
- Verify your `WHATSAPP_VERIFY_TOKEN` matches what you entered in the dashboard
- Check your server logs for incoming GET requests

### "No WhatsApp Business Account found" during Embedded Signup

- Ensure your app has `whatsapp_business_management` permission
- Ensure Facebook Login for Business configuration includes WhatsApp accounts as assets
- Check that the Configuration ID is correct in your `.env`

### "Token exchange failed"

- Verify `META_APP_ID` and `META_APP_SECRET` are correct
- Ensure the auth code hasn't expired (they expire quickly)
- Check that your domain is in "Allowed Domains" for the JavaScript SDK

### Webhook events not arriving

- Run the subscription verification:
  ```bash
  curl "https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps" \
    -H "Authorization: Bearer {TOKEN}"
  ```
- If empty, subscribe manually:
  ```bash
  curl -X POST "https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps" \
    -H "Authorization: Bearer {TOKEN}"
  ```
- Verify the app has **Advanced Access** for WhatsApp permissions (or is in **Live** mode if using legacy App Mode toggle)

### "Phone number already registered on another platform"

This means the number is on another BSP (Wati, Gupshup, etc.) or WhatsApp personal/business app. Your onboarding engine handles this — it will show migration guides to the user.

### Embedded Signup popup doesn't appear

- Check browser console for errors
- Ensure Facebook SDK is loading from `https://connect.facebook.net/en_US/sdk.js`
- Verify your domain is in both "Allowed Domains" AND "Valid OAuth Redirect URIs"
- Ensure the app is not in restricted mode

### "Business not verified" errors

- Complete business verification at https://business.facebook.com/settings/security/
- This can take 2-5 business days
- Ensure documents match the exact business name

---

## 16. Quick Reference — All URLs

### Meta Portals

| What | URL |
|------|-----|
| Meta Developer Portal | https://developers.facebook.com/ |
| Developer Registration | https://developers.facebook.com/async/registration |
| App Dashboard | https://developers.facebook.com/apps/ |
| Create New App | https://developers.facebook.com/apps/creation/ |
| Your App Settings | https://developers.facebook.com/apps/{APP_ID}/settings/basic/ |
| Meta Business Suite | https://business.facebook.com/ |
| Business Settings | https://business.facebook.com/settings/ |
| Business Verification | https://business.facebook.com/settings/security/ |
| System Users | https://business.facebook.com/settings/system-users/ |
| Billing & Payments | https://business.facebook.com/billing/ |

### App Configuration URLs

| What | URL |
|------|-----|
| WhatsApp API Setup | https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/wa-dev-console/ |
| WhatsApp Configuration | https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/wa-settings/ |
| FB Login for Business Settings | https://developers.facebook.com/apps/{APP_ID}/fb-login-for-business/settings/ |
| FB Login Configurations | https://developers.facebook.com/apps/{APP_ID}/fb-login-for-business/configurations/ |
| App Review / Permissions | https://developers.facebook.com/apps/{APP_ID}/review/ |

### Meta API Endpoints

| What | Endpoint |
|------|----------|
| Token Exchange | `POST https://graph.facebook.com/v21.0/oauth/access_token` |
| Long-Lived Token | `GET https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&...` |
| Send Message | `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` |
| Get WABA Info | `GET https://graph.facebook.com/v21.0/{WABA_ID}?fields=name,currency,...` |
| Get Phone Numbers | `GET https://graph.facebook.com/v21.0/{WABA_ID}/phone_numbers` |
| Register Phone | `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/register` |
| Request OTP Code | `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/request_code` |
| Verify OTP Code | `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/verify_code` |
| Subscribe Webhooks | `POST https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps` |
| Check Subscription | `GET https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps` |
| Get Templates | `GET https://graph.facebook.com/v21.0/{WABA_ID}/message_templates` |
| Debug Token | `GET https://graph.facebook.com/v21.0/debug_token?input_token={TOKEN}` |
| Get Business Profile | `GET https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/whatsapp_business_profile` |

### Meta Documentation

| What | URL |
|------|-----|
| WhatsApp Cloud API Docs | https://developers.facebook.com/docs/whatsapp/cloud-api/ |
| Embedded Signup Docs | https://developers.facebook.com/docs/whatsapp/embedded-signup/ |
| Embedded Signup Implementation | https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation/ |
| Facebook Login for Business | https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/ |
| Webhooks Guide | https://developers.facebook.com/docs/graph-api/webhooks/ |
| Tech Provider Program | https://developers.facebook.com/docs/whatsapp/solution-providers/ |
| Access Tokens Guide | https://developers.facebook.com/docs/facebook-login/guides/access-tokens/ |
| Message Pricing | https://developers.facebook.com/docs/whatsapp/pricing/ |
| Rate Limits | https://developers.facebook.com/docs/graph-api/overview/rate-limiting/ |

### Facebook SDK

| What | URL |
|------|-----|
| JavaScript SDK | https://connect.facebook.net/en_US/sdk.js |
| SDK Documentation | https://developers.facebook.com/docs/javascript/ |

---

## Summary Checklist

```
[ ] Phase 1:  Meta Developer account created
[ ] Phase 2:  Meta Business Portfolio created
[ ] Phase 3:  Meta App created, App ID + App Secret saved
[ ] Phase 4:  WhatsApp API setup complete, test message sent
[ ] Phase 5:  Business verification (Path B) OR test recipients added (Path A)
[ ] Phase 6:  System User created, permanent token generated
[ ] Phase 7:  Webhooks configured and verified, app subscribed to WABA
[ ] Phase 8:  Facebook Login for Business added, OAuth settings configured
[ ] Phase 9:  Embedded Signup Configuration ID created and saved
[ ] Phase 10: .env file configured with all variables
[ ] Phase 11: All test cases passing
[ ] Phase 12: Advanced Access enabled, App Review approved
```

Once all boxes are checked, your WA Commerce platform is fully connected to Meta's WhatsApp Business Platform and ready to onboard tenants via Embedded Signup or manual number registration.
