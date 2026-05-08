# Complete Testing Guide — WA Commerce Platform

Step-by-step instructions to create a new user, connect WhatsApp, and test the full messaging flow.

**Prerequisites:**
- Backend running on `http://localhost:3001` (`npm run start:dev`)
- Frontend running on `http://localhost:4600` (`cd frontend && ng serve --port 4600`)
- PostgreSQL and Redis running locally
- Meta app setup completed (Phases 1-4 + 6-7 from META_SETUP_GUIDE.md)
- At least 1 test recipient added in Meta dashboard (Phase 5, Path A)

---

## Phase 1: Clean Up Old Test Data (Optional)

If you have stale tenants from previous testing, clean them up via the super admin panel or database. This is optional — you can skip to Phase 2 if starting fresh.

---

## Phase 2: Create a New User Account

### Step 2.1: Open the Registration Page

1. Open your browser and go to **http://localhost:4600**
2. You'll be redirected to the login page at `/auth/login`
3. Click **"Create an account"** (or go directly to **http://localhost:4600/auth/register**)

### Step 2.2: Fill in Registration Details

| Field | Required | Example Value |
|-------|----------|--------------|
| Full Name | Yes | `Hatim Patanwala` |
| Business Name | No | `My Test Store` (leave empty to auto-generate) |
| Email | Yes | `hatim@example.com` (use any email) |
| Phone | No | `+919302850917` (optional) |
| Password | Yes | `Test@12345` (min 6 characters) |

4. Click **"Create Account"**

### Step 2.3: What Happens Behind the Scenes

- A new **tenant** is created in the `public.tenants` table
- A new **PostgreSQL schema** is created (e.g., `tenant_my_test_store_m1abc23`)
- **26 migration tables** are created in that schema (users, customers, orders, products, etc.)
- A **trial subscription** is created (20 products, 100 conversations, 2 campaigns/month, 30-day expiry)
- You're auto-logged in and redirected to `/onboarding`

---

## Phase 3: Complete Onboarding

After registration, you'll land on the onboarding page with 3 steps.

### Step 3.1: Connect Your WhatsApp Number (Step 0)

You have two options here. **For individual developers without business verification, use Option B (Manual Registration).**

#### Option A: Embedded Signup (Requires Business Verification)

- Click **"Connect with Facebook"**
- This opens a Facebook Login popup where you authorize your WABA
- **This will NOT work without business verification** — you'll get an error

#### Option B: Manual Registration

1. Click **"Register number manually instead"**
2. Select your country code from the dropdown (e.g., **India +91**)
3. Enter the phone number you want to use

**Which number to enter?**

Since you don't have business verification, you have two approaches:

---

**Approach 1: Use Meta's Test Phone Number (Recommended for first test)**

The Meta test number (`+15551539456`) is already in your platform's phone pool. When you enter it during onboarding, the system checks the local pool first and assigns it to your tenant — no Meta API call needed.

1. Select country code **US +1**
2. Enter: `5551539456`
3. Click **"Start"**
4. The system should detect it in the local pool and assign it automatically
5. If it shows "Number Activated!" — click **Continue**

> **Note**: With the test number, you can only send messages to the **5 test recipients** you added in Meta's API Setup dashboard. But you CAN receive messages from anyone who messages the test number.

---

**Approach 2: Enter Your Own Number (May fail without verification)**

If you enter your personal number (e.g., `+919302850917`):
- The system will try to register it with Meta's API via `POST /{wabaId}/phone_numbers`
- **This will likely fail** without business verification — Meta returns an error for unverified businesses
- You'll see a migration guide or error message
- If this happens, click **"Skip for Now"** and we'll assign the test number manually later (see Phase 3A below)

---

**Approach 3: Skip Onboarding**

1. Click **"Skip for Now"** at the bottom of the page
2. You'll go straight to the dashboard
3. Then manually assign the test number (see Phase 3A)

---

### Step 3A: Manually Assign Test Number (If you skipped or registration failed)

If the test number wasn't automatically assigned, do this via the database:

```bash
# Run this from the project root
node -e "
const { Client } = require('pg');
const client = new Client({ host:'localhost', port:5432, user:'postgres', password:'postgres', database:'whatsapp_commerce' });
(async () => {
  await client.connect();
  // Get your new tenant ID
  const t = await client.query(\"SELECT id, name, schema_name FROM public.tenants ORDER BY created_at DESC LIMIT 1\");
  const tenant = t.rows[0];
  console.log('Tenant:', tenant);

  // Activate and assign the Meta test number to your tenant
  await client.query(
    'UPDATE public.phone_numbers SET tenant_id = \$1, status = \\'active\\' WHERE phone_number_id = \$2',
    [tenant.id, '1100291683170524']
  );

  // Update tenant with the phone number reference
  await client.query(
    'UPDATE public.tenants SET phone_number_id = \$1, waba_id = \$2, whatsapp_phone = \$3, onboarding_status = \\'whatsapp_connected\\' WHERE id = \$4',
    ['1100291683170524', '1642870743653301', '+15551539456', tenant.id]
  );

  console.log('Test number assigned to tenant:', tenant.name);
  await client.end();
})();
"
```

After running this, refresh the onboarding page — it should show the number as connected and move to the next step.

### Step 3.2: Set Business Profile (Step 1)

1. Enter **Business Name**: `My Test Store` (required)
2. Select **Business Category**: `Retail` (or any category from the dropdown)
3. Optionally fill in: Description, Address, Logo URL
4. Click **"Continue"**

### Step 3.3: Complete Setup (Step 2)

1. You'll see a success screen: **"You're All Set!"**
2. Click **"Go to Dashboard"**
3. You're now on the main dashboard at `/dashboard`

---

## Phase 4: Explore the Dashboard

After onboarding, you'll see the main dashboard with:

- **4 stat cards**: Total Revenue, Total Orders, Pending Orders, Avg Order Value (all zero for now)
- **Revenue chart**: empty line chart
- **Low stock alerts**: empty
- **Recent orders**: empty table

### Sidebar Navigation

Explore these sections:

| Page | Path | What It Does |
|------|------|-------------|
| Dashboard | `/dashboard` | Revenue stats, charts, recent orders |
| Products | `/products` | Create/manage product catalog |
| Orders | `/orders` | View and manage orders |
| Inventory | `/inventory` | Stock levels and low-stock alerts |
| Payments | `/payments` | Payment verification |
| Deliveries | `/deliveries` | Delivery tracking |
| Customers | `/customers` | Customer list and segments |
| Campaigns | `/campaigns` | Broadcast message campaigns |
| **Conversations** | `/conversations` | **WhatsApp chat interface** |
| Workflow Builder | `/workflow-builder` | Visual workflow automation |
| Settings | `/settings` | Business config, WhatsApp, billing |

---

## Phase 5: Test WhatsApp Messaging

This is the core flow — sending and receiving WhatsApp messages through your platform.

### Step 5.1: Ensure Webhook Is Configured

Your webhook must be receiving events from Meta. Verify:

1. Your backend is running and publicly accessible (use **ngrok** for local dev):
   ```bash
   ngrok http 3001
   ```
2. Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok-free.app`)
3. Go to your Meta App Dashboard → **WhatsApp > Configuration**
4. Update the webhook **Callback URL** to: `https://abc123.ngrok-free.app/api/webhook/whatsapp`
5. Keep the **Verify Token** as: `my-wa-commerce-verify-token` (or whatever you set in `.env`)
6. Click **"Verify and Save"**

> **Important**: The webhook URL includes `/api/` prefix. Don't forget it!

### Step 5.2: Send a Test Message FROM Your Phone

1. Open **WhatsApp** on your personal phone
2. Add the Meta test number to your contacts: **+1 (555) 153-9456** (or whatever test number Meta gave you)
3. Send a message: `Hi, I want to order something`
4. Watch your backend logs — you should see:
   ```
   [WebhookIngestProcessor] Processing webhook...
   [WebhookProcessorService] Processing message from +91XXXXXXXXXX
   ```

### Step 5.3: View the Message in the Platform

1. Go to **http://localhost:4600/conversations**
2. You should see a new conversation in the left panel with the customer's phone number
3. Click on it to see the message: "Hi, I want to order something"
4. The chat interface shows:
   - Customer name/phone at the top
   - **"Within 24h window"** green badge (you can reply for 24 hours)
   - The message bubble on the left (inbound)

### Step 5.4: Reply From the Platform

1. In the message input area at the bottom, type: `Welcome! How can I help you today?`
2. Press **Enter** or click the send button
3. The message appears as a green bubble on the right (outbound)
4. Check your phone — you should receive the reply on WhatsApp!
5. You'll see delivery status indicators:
   - ✓ Single check = Sent
   - ✓✓ Gray double check = Delivered
   - ✓✓ Blue double check = Read

### Step 5.5: Try Quick Replies

Below the message input, you'll see quick reply chips:
- "Thank you!"
- "I'll check and get back to you."
- "Your order is on its way!"
- "Please share your payment proof."

Click any of these to send them instantly.

### Step 5.6: Test the 24-Hour Window

WhatsApp requires businesses to reply within 24 hours of the customer's last message. After 24 hours:
- The message input area is replaced with: **"The 24-hour messaging window has expired."**
- You can only send **template messages** (pre-approved by Meta)
- A "Send Template Message" button appears

---

## Phase 6: Test Product Catalog & Orders (Optional)

### Step 6.1: Add Products

1. Go to **Products** → Click **"Add Product"**
2. Fill in: Name, Price (INR), Category, Description, Stock quantity
3. Save the product
4. Repeat to add a few test products

### Step 6.2: Test Order Flow via WhatsApp

If you've built workflows with the Workflow Builder, customers can browse products and place orders via WhatsApp conversation. Without workflows, orders can be created manually from the Orders page.

---

## Phase 7: Test Workflow Automation (Optional)

### Step 7.1: Create a Simple Workflow

1. Go to **Workflow Builder**
2. Create a new workflow with:
   - **Trigger**: Message contains "hi" or "hello"
   - **Send Text**: "Welcome to My Test Store! What are you looking for?"
   - **Send Buttons**: "Browse Products", "Track Order", "Help"
3. **Activate** the workflow

### Step 7.2: Test the Workflow

1. From your phone, send **"hi"** to the test number
2. You should receive the welcome message with buttons
3. Tap a button — the workflow continues based on your selection

---

## Phase 8: Test Super Admin Panel (Optional)

### Step 8.1: Login as Super Admin

1. Go to **http://localhost:4600/auth/login**
2. Login with:
   - Email: `admin@whatsapp-commerce.com`
   - Password: `Admin@123456`
3. You'll be redirected to `/admin`

### Step 8.2: Explore Admin Features

| Section | What You Can Do |
|---------|----------------|
| Tenants | View all tenants, suspend/activate them |
| WABA Management | View WABA accounts, phone numbers, assign numbers to tenants |
| Subscriptions | Manage tenant subscription plans |
| Platform Stats | Overall platform metrics |

---

## Troubleshooting

### "No conversations showing up after sending a message"

1. **Check ngrok is running** and the webhook URL is correct in Meta dashboard
2. **Check backend logs** for webhook processing errors
3. **Verify app subscription to WABA**:
   ```bash
   curl "https://graph.facebook.com/v21.0/1642870743653301/subscribed_apps" \
     -H "Authorization: Bearer YOUR_SYSTEM_USER_TOKEN"
   ```
   If empty, subscribe:
   ```bash
   curl -X POST "https://graph.facebook.com/v21.0/1642870743653301/subscribed_apps" \
     -H "Authorization: Bearer YOUR_SYSTEM_USER_TOKEN"
   ```
4. **Check webhook fields** are subscribed in Meta Dashboard → WhatsApp > Configuration → Webhook fields (especially `messages`)

### "Message sent from platform but not received on phone"

1. **Check you're using the test number** (+15551539456) as the sender
2. **Check the recipient is in your test recipient list** (max 5 numbers in Meta API Setup)
3. **Check backend logs** for Meta API errors (rate limit, invalid token, etc.)
4. **Verify access token** hasn't expired — if using temp token, regenerate in Meta API Setup

### "Onboarding phone registration fails"

- Without business verification, Meta API rejects phone registration for your own numbers
- Use **Approach 1** (Meta test number) or **Step 3A** (manual assignment) above
- You can always click **"Skip for Now"** and assign manually

### "Login fails with 'Invalid credentials'"

- Backend searches ALL tenant schemas for the email — if you have many tenants, this can be slow
- Check the email matches exactly (case-sensitive)
- Default super admin: `admin@whatsapp-commerce.com` / `Admin@123456`

### "Dashboard shows all zeros"

- This is normal for a new account — you need to receive messages, create products, and process orders first
- Send a few test messages from your phone to populate conversations
- Add products from the Products page

### "Webhook verification fails in Meta dashboard"

- Ensure your backend is running and publicly accessible
- The webhook URL must be: `https://{your-domain}/api/webhook/whatsapp` (with `/api/` prefix)
- The verify token must match your `.env` `WHATSAPP_VERIFY_TOKEN` value
- Check ngrok is running if using local development

---

## Quick Reference

| Item | Value |
|------|-------|
| Frontend URL | http://localhost:4600 |
| Backend URL | http://localhost:3001 |
| API Prefix | `/api` |
| Webhook Path | `/api/webhook/whatsapp` |
| Super Admin Email | `admin@whatsapp-commerce.com` |
| Super Admin Password | `Admin@123456` |
| Meta Test Number | `+15551539456` |
| Meta Phone Number ID | `1100291683170524` |
| WABA ID | `1642870743653301` |
| Graph API Version | `v21.0` |
