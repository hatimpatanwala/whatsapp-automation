# WhatsApp Commerce Platform — Complete System Documentation

> A multi-tenant WhatsApp Business API platform that enables businesses to sell products, manage orders, process payments, and automate customer conversations — all through WhatsApp.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites & Environment Setup](#3-prerequisites--environment-setup)
4. [Installation & First Run](#4-installation--first-run)
5. [Super Admin Guide](#5-super-admin-guide)
6. [Tenant Onboarding Guide](#6-tenant-onboarding-guide)
7. [WhatsApp Business Setup](#7-whatsapp-business-setup)
8. [Feature Guide — All Modules](#8-feature-guide--all-modules)
9. [Workflow Automation Engine](#9-workflow-automation-engine)
10. [Billing & Subscription System](#10-billing--subscription-system)
11. [Database Schema Reference](#11-database-schema-reference)
12. [API Reference](#12-api-reference)
13. [Queue & Background Jobs](#13-queue--background-jobs)
14. [Deployment Guide](#14-deployment-guide)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Platform Overview

### What This Platform Does

This is a **B2B SaaS platform** where each tenant (business) gets:
- A dedicated WhatsApp Business number (own or platform-assigned)
- A full e-commerce backend (products, orders, inventory, payments, deliveries)
- A visual workflow builder to automate WhatsApp conversations
- A campaign system for bulk WhatsApp broadcasts
- A real-time conversation inbox
- Analytics dashboards

### Who Uses It

| Role | Access | What They Do |
|------|--------|-------------|
| **Platform Admin (Super Admin)** | `/admin/*` routes | Manages tenants, monitors usage, assigns phone numbers, manages WABA infrastructure |
| **Tenant Owner** | `/dashboard`, `/settings` etc. | Runs their business — manages products, orders, customers, workflows |
| **Tenant Staff (Seller)** | Same as owner (limited) | Handles day-to-day operations — replies to customers, processes orders |
| **End Customer** | WhatsApp only | Browses products, places orders, makes payments — all via WhatsApp chat |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS (TypeScript), PostgreSQL, Redis, BullMQ |
| Frontend | Angular 21, PrimeNG 21, Tailwind CSS v4 |
| WhatsApp | Meta Cloud API (v18.0 / v21.0) |
| Payments | Razorpay (INR), UPI QR codes |
| Storage | AWS S3 + CloudFront |
| Auth | Session-based (Redis-backed, `connect-redis`) |

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        End Customers                            │
│                     (WhatsApp Mobile App)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WhatsApp Messages
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Meta WhatsApp Cloud API                        │
│              (graph.facebook.com/v18.0)                          │
└──────────────┬───────────────────────────────────┬───────────────┘
               │ Webhooks (inbound)                │ API (outbound)
               ▼                                   ▲
┌──────────────────────────────────────────────────────────────────┐
│                     NestJS Backend (Port 3001)                   │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Webhook     │  │  Workflow     │  │  Message Orchestrator  │  │
│  │  Processor   │→ │  Engine       │→ │  (quota + rate limit)  │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Commerce    │  │  Campaign     │  │  Conversation          │  │
│  │  (Orders,    │  │  Broadcast    │  │  Metering & Quota      │  │
│  │   Products,  │  │  Engine       │  │  Enforcement           │  │
│  │   Payments)  │  │              │  │                        │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Schema-Per-Tenant PostgreSQL                 │    │
│  │  public.*  │  tenant_abc.*  │  tenant_xyz.*  │  ...      │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
               │                          │
               ▼                          ▼
        ┌────────────┐           ┌─────────────────┐
        │   Redis     │           │   BullMQ Queues  │
        │  (sessions, │           │  (outbound msgs, │
        │   cache,    │           │   broadcasts,    │
        │   locks)    │           │   workflows)     │
        └────────────┘           └─────────────────┘
```

### Multi-Tenancy Model

The platform uses **schema-per-tenant** isolation on a single PostgreSQL database:

- **`public` schema** — Platform-wide tables: `tenants`, `subscriptions`, `super_admins`, `waba_accounts`, `phone_numbers`, `meta_tokens`, `wallets`, `conversation_sessions`, etc.
- **`tenant_<slug>` schemas** — One per tenant, containing: `users`, `customers`, `products`, `orders`, `conversations`, `messages`, `workflows`, `settings`, etc.

At runtime, every request resolves the tenant via session/middleware, and `SET search_path TO '<schema>'` is issued on the DB connection before executing queries. This provides full data isolation without separate databases.

### Message Flow (Inbound)

```
1. Customer sends "hi" on WhatsApp
2. Meta delivers webhook to POST /api/webhook/whatsapp
3. WebhookProcessor:
   a. Resolves tenant from phone_number_id
   b. Deduplicates via Redis (wa_message_id)
   c. Meters conversation (24h session tracking)
   d. Checks for active workflow execution waiting for reply → resumes it
   e. Checks if message matches any active workflow trigger → starts new execution
   f. Falls back to hardcoded message handlers (text/interactive/media)
4. Workflow engine walks the node graph:
   - send_text → sends message via WhatsApp API
   - send_buttons → sends interactive message, PAUSEs for reply
   - condition → evaluates, follows Yes/No edge
   - add_to_cart → adds product to cart
   - checkout → creates order
   - etc.
5. Outbound messages are queued to BullMQ (rate-limited: 70/sec)
6. WhatsAppOutboundProcessor sends via Meta Cloud API
```

### Message Flow (Outbound)

```
1. System needs to send a message (workflow node, manual reply, campaign)
2. MessageOrchestrator.sendMessage() called with tenantId + payload
3. Pre-send checks:
   a. QuotaEnforcementService.canSendMessage() — subscription limit check
   b. RateLimitService.checkLimit() — per-tenant throttle check
4. If allowed → enqueue to BullMQ "whatsapp-outbound" queue
5. WhatsAppOutboundProcessor picks up job (70/sec, 10 concurrent workers)
6. Calls Meta Cloud API: POST /{phoneNumberId}/messages
7. ConversationMeteringService.meterConversation() — tracks 24h session
```

---

## 3. Prerequisites & Environment Setup

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18+ | Runtime |
| npm | 9+ | Package manager |
| PostgreSQL | 16+ | Database |
| Redis | 7+ | Cache, sessions, queues |
| Docker (optional) | 24+ | Run Postgres + Redis via docker-compose |

### Environment Variables

Create a `.env` file in the project root. Copy from `.env.example`:

```bash
cp .env.example .env
```

**Required variables:**

```env
# ── Server ──
NODE_ENV=development
PORT=3001
API_PREFIX=api
CORS_ORIGIN=http://localhost:4200

# ── Database (PostgreSQL) ──
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=whatsapp_commerce
DB_POOL_SIZE=50
DB_SYNCHRONIZE=true          # Set to false in production

# ── Redis ──
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ── Session ──
SESSION_SECRET=change-me-in-production-use-a-strong-random-secret
SESSION_TTL=86400             # 24 hours in seconds

# ── WhatsApp Cloud API ──
WHATSAPP_API_VERSION=v18.0
WHATSAPP_API_URL=https://graph.facebook.com
WHATSAPP_VERIFY_TOKEN=my-wa-commerce-verify-2024
WHATSAPP_APP_SECRET=          # From Meta Developer Console

# ── Meta Embedded Signup (optional — for tenant self-service WhatsApp connection) ──
META_APP_ID=
META_APP_SECRET=
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_GRAPH_API_VERSION=v21.0

# ── Token Encryption ──
TOKEN_ENCRYPTION_KEY=change-me-32-char-encryption-key!

# ── BullMQ Rate Limiting ──
WHATSAPP_RATE_LIMIT_MAX=70
WHATSAPP_RATE_LIMIT_DURATION=1000
QUEUE_REDIS_HOST=localhost
QUEUE_REDIS_PORT=6379

# ── AWS S3 (media uploads) ──
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=whatsapp-commerce-media
CLOUDFRONT_DOMAIN=cdn.yourapp.com

# ── Razorpay (payment gateway — optional) ──
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# ── Stock Reservations ──
RESERVATION_TTL_MINUTES=15
```

---

## 4. Installation & First Run

### Step 1: Start Infrastructure (Postgres + Redis)

**Option A: Docker (recommended)**

```bash
docker-compose up -d
```

This starts:
- PostgreSQL 16 on port `5432` (user: `postgres`, pass: `postgres`, db: `whatsapp_commerce`)
- Redis 7 on port `6379`
- pgAdmin on port `5050` (login: `admin@admin.com` / `admin`)

**Option B: Local installations**

Install PostgreSQL and Redis locally, create the database:

```sql
CREATE DATABASE whatsapp_commerce;
```

### Step 2: Install Dependencies

```bash
# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

### Step 3: Seed the Super Admin

```bash
npm run seed:admin
```

This creates the platform super admin account:

| Field | Value |
|-------|-------|
| **Email** | `admin@wacommerce.in` |
| **Password** | `Admin@123456` |
| **Name** | Platform Admin |
| **Role** | admin |

You can override these via environment variables:
```bash
ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=YourPass123 npm run seed:admin
```

### Step 4: Start the Backend

```bash
# Development mode (auto-reload)
npm run start:dev

# Production mode
npm run build && npm run start:prod
```

The backend starts on **http://localhost:3001**. All API routes are prefixed with `/api`.

### Step 5: Start the Frontend

```bash
cd frontend
npm start
```

The Angular dev server starts on **http://localhost:4200**.

### Step 6: Verify

1. Open **http://localhost:4200/admin/login**
2. Login with `admin@wacommerce.in` / `Admin@123456`
3. You should see the Super Admin Dashboard

---

## 5. Super Admin Guide

### Accessing the Admin Panel

- **URL**: `http://localhost:4200/admin/login`
- **Credentials**: `admin@wacommerce.in` / `Admin@123456`

### Admin Dashboard (`/admin/dashboard`)

Shows platform-wide statistics:
- Total tenants, active tenants, suspended tenants
- Platform-wide metrics

### Managing Tenants (`/admin/tenants`)

**Create a new tenant:**
1. Go to `/admin/tenants` → Click "New Tenant"
2. Fill in: Tenant Name, Slug (unique), Owner Name, Owner Email, Owner Password, Owner Phone
3. Click "Create Tenant"

What happens behind the scenes:
- A new PostgreSQL schema is created (e.g., `tenant_mystore`)
- All 24 tenant migrations run (creates tables: users, products, orders, etc.)
- An owner user is created in the tenant's `users` table
- A trial subscription is created (100 conversations/month)
- Default settings are seeded (currency, business hours, etc.)

**Suspend / Activate a tenant:**
- Click the tenant → "Suspend" or "Activate" button

### Managing WABA Infrastructure (`/admin/waba`)

This is where the platform admin manages the WhatsApp Business Account pool.

**Adding a WABA Account:**
1. Go to `/admin/waba`
2. Click "Add WABA Account"
3. Enter: WABA ID (from Meta), Name, Business ID
4. Store the System User access token (encrypted via AES-256-GCM)

**Adding Phone Numbers to the Pool:**
1. In the WABA dashboard, click "Sync from Meta" — this fetches all phone numbers registered under the WABA
2. Or manually add phone numbers
3. Unassigned numbers (where `tenant_id IS NULL`) are available for auto-assignment to new tenants

**Assigning Phone Numbers:**
- Done automatically during tenant onboarding ("Connect via Platform" flow)
- Or manually: WABA dashboard → Phone Numbers → Assign to Tenant

### Managing Subscriptions (`/admin/subscriptions`)

Create and manage subscription plans:
- Plan name, max conversations, max products, max campaigns/month
- Assign plans to tenants

### Viewing Audit Logs

```
GET /api/admin/waba/audit-logs?tenantId=xxx&action=embedded_signup.complete
```

All admin and system actions are logged to `public.audit_logs`.

---

## 6. Tenant Onboarding Guide

### Self-Service Signup

1. Go to **http://localhost:4200/auth/register**
2. Fill in: Name, Email, Password, Phone, Business Name (optional)
3. Click "Sign Up"

What happens:
- A new tenant is provisioned automatically (schema + tables + trial plan)
- You're logged in and redirected to the onboarding flow

### Onboarding Steps

The onboarding wizard (`/onboarding`) walks through 4 steps:

**Step 1: Verify Phone Number**
- Enter the phone number you want to use for WhatsApp Business
- The system normalizes it to international format (e.g., `+91XXXXXXXXXX`)

**Step 2: Connect WhatsApp** (choose one option)

| Option | Who It's For | How It Works |
|--------|-------------|-------------|
| **Connect Your Own** | Users who already have a Meta Developer account + WhatsApp Business API setup | Enter your Phone Number ID, WABA ID, and Access Token. System verifies via Meta API. |
| **Connect via Platform** | Users who want the easiest setup | Platform assigns a pre-registered number from its pool. No Meta account needed. |
| **Meta Embedded Signup** | Users who have a Meta Business account but no developer setup | OAuth flow — click "Connect with Facebook", authorize, and the platform auto-configures everything. |

> **Important**: Regardless of which option is chosen, the phone number and credentials are stored in the platform's centralized pool (`waba_accounts`, `phone_numbers`, `meta_tokens`). This gives the platform control over messaging and quota enforcement.

**Step 3: Business Profile**
- Business Name, Category, Description, Address, Logo
- This information is used in WhatsApp Business Profile

**Step 4: Complete**
- Click "Complete" to finish onboarding
- You're redirected to the main dashboard

### Skipping Onboarding

Users can click "Skip" to go directly to the dashboard and set up WhatsApp later from Settings.

---

## 7. WhatsApp Business Setup

### Option A: Setting Up Your Own WhatsApp Business API (BYO)

Follow these steps if you want to use your own phone number:

**1. Create a Meta Business Account**
- Go to [business.facebook.com](https://business.facebook.com/)
- Create a business account (free, takes ~5 minutes)
- Add your business website or Facebook page

**2. Create a Meta Developer App**
- Go to [developers.facebook.com](https://developers.facebook.com/)
- Click "Create App" → Select "Business" type
- Name it (e.g., "My Store WhatsApp")
- Add WhatsApp as a product

**3. Add Your Phone Number**
- In the WhatsApp section → "API Setup"
- Click "Add Phone Number"
- **IMPORTANT**: The number must NOT be currently registered on WhatsApp or WhatsApp Business app. Delete it from the app first (WhatsApp → Settings → Account → Delete Account), wait 5 minutes.
- Verify via SMS or voice call

**4. Get Your Credentials**

| Credential | Where to Find | Example |
|-----------|--------------|---------|
| Phone Number ID | API Setup page, under your phone number | `1234567890123456` |
| WABA ID | API Setup page or WhatsApp → Account Settings | `9876543210123456` |
| Access Token | Business Settings → System Users → Generate Token (with `whatsapp_business_messaging` + `whatsapp_business_management` permissions) | `EAAxxxxxxxx...` |

**5. Configure Webhook**

In Meta Developer Console → WhatsApp → Configuration:

| Field | Value |
|-------|-------|
| Callback URL | `https://your-domain.com/api/webhook/whatsapp` |
| Verify Token | Same as `WHATSAPP_VERIFY_TOKEN` in your `.env` |
| Subscribe to | `messages`, `message_templates` |

**6. Enter Credentials in the Platform**

During onboarding "Connect Your Own" or in Settings → WhatsApp tab:
- Enter Phone Number ID, WABA ID, Access Token
- Click "Save Configuration"

### Option B: Using Platform-Assigned Number (Shared WABA)

If the platform admin has set up a pool of phone numbers:
1. During onboarding, click "Connect via Platform"
2. A number is automatically assigned to you
3. You can start receiving and sending messages immediately

### Option C: Meta Embedded Signup

1. During onboarding, click "Connect with Facebook"
2. A popup opens for Facebook OAuth
3. Authorize the platform to access your WhatsApp Business Account
4. The platform automatically:
   - Exchanges the auth code for an access token
   - Syncs your WABA and phone numbers
   - Assigns your phone number
   - Subscribes to webhooks
5. Done — no manual credential entry needed

### How Billing Works (WhatsApp Conversations)

| Setup Type | Who Pays Meta | How Platform Charges |
|-----------|--------------|---------------------|
| Shared WABA (Platform Pool) | Platform pays Meta | Platform tracks conversations against subscription quota |
| BYO / Embedded Signup | The WABA owner pays Meta | Platform tracks conversations against subscription quota |

**Subscription-based billing** (no per-conversation charges):
- Each plan includes a fixed number of conversations/month (e.g., Trial = 100, Starter = 1000)
- When the limit is reached:
  - If **Allow Exceed** is OFF → new conversations are **blocked**
  - If **Allow Exceed** is ON → conversations continue beyond the limit
- Quotas reset on the 1st of each month automatically

You can toggle "Allow Exceed" in Settings → Subscription tab.

---

## 8. Feature Guide — All Modules

### 8.1 Dashboard (`/dashboard`)

The main dashboard shows:
- **Stat cards**: Pending Orders, Open Conversations, Pending Payments, Pending Deliveries
- **Revenue chart**: Daily revenue and order count (last 7 days)
- **Quick actions**: Navigate to key sections

### 8.2 Products & Catalog (`/products`)

**Managing Products:**
- Create products with: Name, Description, Price, Sale Price, Images, Category, Variants
- Products support **variants** (e.g., Size: S/M/L, Color: Red/Blue) with individual pricing
- Products support **translations** (i18n) for multi-language WhatsApp responses
- Each product has an **inventory record** with stock quantity and low-stock threshold

**Managing Categories:**
- Categories support parent-child hierarchy
- Each category has a slug (URL-friendly name)
- Products are assigned to categories

### 8.3 Orders (`/orders`)

**Order Lifecycle:**
```
pending → confirmed → processing → out_for_delivery → delivered
                   ↘ cancelled
```

**Order Detail** shows:
- Customer info, shipping address
- Order items with product details
- Payment status and proof
- Delivery tracking
- Status update buttons

**How Orders Are Created:**
1. Customer browses products via WhatsApp (workflow `show_catalog` node)
2. Customer adds items to cart (`add_to_cart` node)
3. Customer reviews cart (`view_cart` node)
4. Customer confirms and selects delivery address (`checkout` node)
5. Order is created, payment QR is sent (`payment_qr` node)
6. Staff verifies payment → order is confirmed

### 8.4 Inventory (`/inventory`)

- View all product stock levels
- **Low Stock Alerts**: Items below their threshold are highlighted
- **Stock Adjustment**: Manually adjust stock with a reason (e.g., "Damaged goods", "New shipment")
- **Stock Reservations**: When a customer adds an item to cart, stock is reserved for 15 minutes (configurable via `RESERVATION_TTL_MINUTES`). If checkout doesn't happen, the reservation expires and stock is released.
- Pessimistic locking prevents overselling

### 8.5 Payments (`/payments`)

**Payment Flow (UPI QR):**
1. Order is created
2. System generates a UPI QR code with the order amount
3. QR code is sent to the customer via WhatsApp
4. Customer scans QR, pays via their UPI app
5. Customer sends a screenshot of payment confirmation
6. Staff reviews and clicks "Verify" or "Reject"
7. If verified → order status moves to "confirmed" (if auto-confirm is on)

**Payment Statuses:** `pending` → `verified` / `rejected` / `expired`

### 8.6 Deliveries (`/deliveries`)

**Delivery Lifecycle:**
```
pending → assigned → in_transit → delivered
                              ↘ failed
```

- Assign a delivery agent with estimated delivery time
- Update delivery status
- When status changes to `in_transit`, order status updates to `out_for_delivery`
- When status changes to `delivered`, order status updates to `delivered`

**Delivery Stats:**
- Total deliveries, pending, assigned, in-transit, delivered, failed
- Delivery success rate (%)
- Average delivery time (hours)

### 8.7 Customers (`/customers`)

Customers are **auto-created** when they first message the WhatsApp number.

**Customer Profile:**
- Phone number, name (from WhatsApp)
- Tags (for segmentation — e.g., "VIP", "New", "Inactive")
- Total orders, total spent, last order date
- Address book (multiple addresses)
- Order history

**Customer Stats:**
- Total customers, active, blocked
- New this month, repeat customers
- Average order value
- Top spenders

### 8.8 Conversations / Inbox (`/conversations`)

The real-time WhatsApp inbox:
- List of all conversations, sorted by last message
- Filter by status: Open, Pending, Resolved
- Click a conversation to see message history
- **Send manual replies** — type a message and send directly to the customer
- Message types visible: Text, Images, Interactive (buttons/lists), Templates

**Conversation Stats:**
- Total conversations, open, pending, resolved today, unassigned

### 8.9 Campaigns (`/campaigns`)

Bulk WhatsApp message broadcasting:

**Creating a Campaign:**
1. Name your campaign
2. Select a **message template** (must be pre-approved by Meta)
3. Select a **customer segment** (filter rules like "all customers", "ordered in last 30 days", etc.)
4. Schedule or send immediately

**Campaign Sending Flow:**
1. Click "Send Campaign"
2. The system resolves the segment → gets customer list
3. Enqueues individual messages to the `broadcast` BullMQ queue
4. Messages are sent rate-limited (70/sec)
5. Delivery statuses are tracked: sent, delivered, read, failed, opted out

**Customer Segments:**
- Create reusable segments with filter rules
- Rules can filter by: tags, order count, last order date, total spent, etc.

### 8.10 Workflow Builder (`/workflow-builder`)

A **visual drag-and-drop** workflow automation engine.

See [Section 9](#9-workflow-automation-engine) for full details.

### 8.11 Settings (`/settings`)

Five tabs:

**Business Tab:**
- Business Name, Slug, Description
- Currency (INR, USD, NGN, GHS, KES), Timezone, Order Prefix
- Notification Email
- Business Hours (per-day toggle with open/close times)

**WhatsApp Tab:**
- Phone Number, Business Account ID, Access Token, Webhook Token
- "Test Connection" button
- "Save Configuration" button

**Payments Tab:**
- Bank Accounts / UPI IDs (add multiple)
- Order Settings:
  - Auto-confirm orders on payment (toggle)
  - Enable Delivery (toggle)
  - Enable Pickup (toggle)

**Notifications Tab:**
- Per-event notification preferences (Email + WhatsApp toggles):
  - New Order, Payment Received, Low Stock Alert, Delivery Update, Campaign Completed, New Customer

**Subscription Tab:**
- Current plan name and status
- Usage meters: Conversations used / limit, Products limit, Campaigns/month limit
- Progress bars with color coding (green < 80%, orange 80-95%, red > 95%)
- Included features list
- **Allow Exceed toggle**: Controls whether conversations continue or stop when the limit is reached
- "Upgrade Plan" button

### 8.12 Usage Dashboard (`/settings/usage`)

Detailed usage analytics for the current billing period.

### 8.13 Billing Dashboard (`/settings/billing`)

Wallet balance, transaction history, and Razorpay payment management.

---

## 9. Workflow Automation Engine

### Overview

The workflow engine is a **state machine that walks a directed graph** of nodes. Each workflow has:
- A **trigger** (e.g., message containing "hi", or a domain event like "order.created")
- A **node graph** (stored as `nodes[]` + `edges[]` JSONB)
- **Execution state** persisted in `workflow_executions` (so it survives server restarts)

### Node Types (22 total)

#### Communication Nodes
| Node | What It Does | Pauses? |
|------|-------------|---------|
| `send_text` | Sends a plain text message | No — advances immediately |
| `send_buttons` | Sends interactive buttons (max 3) | Yes — waits for button click |
| `send_list` | Sends a list picker (max 10 items) | Yes — waits for selection |
| `send_image` | Sends an image with optional caption | No |
| `send_template` | Sends a pre-approved Meta template | No |

#### Logic Nodes
| Node | What It Does | Pauses? |
|------|-------------|---------|
| `condition` | Evaluates a condition, follows Yes/No edge | No |
| `switch` | Routes by variable value (multiple edges) | No |
| `wait_for_reply` | Explicitly waits for customer's next message | Yes |
| `delay` | Waits N seconds/minutes (BullMQ delayed job) | Yes |
| `end` | Marks execution as completed | Terminal |

#### Commerce Nodes
| Node | What It Does | Pauses? |
|------|-------------|---------|
| `show_catalog` | Queries products, sends as WhatsApp list | Yes — waits for selection |
| `search_products` | Searches products by customer's last message | Yes |
| `filter_products` | Filters products by criteria, sets context variable | No |
| `add_to_cart` | Adds selected product to customer's cart | No |
| `view_cart` | Shows cart summary with Edit/Checkout buttons | Yes |
| `checkout` | Creates order from cart | No |
| `inventory_check` | Checks stock, branches In Stock / Out of Stock | No |
| `payment_qr` | Generates UPI QR code, sends to customer | Yes — waits for payment proof |

#### Utility Nodes
| Node | What It Does | Pauses? |
|------|-------------|---------|
| `tag_customer` | Adds/removes a customer tag | No |
| `update_order` | Changes order status | No |
| `assign_agent` | Hands off conversation to a human agent | No |
| `set_language` | Updates customer's language preference | No |
| `http_request` | Calls an external API, stores response | No (branches on success/failure) |

### How It Works

**Starting an execution:**
1. Inbound WhatsApp message arrives
2. `WorkflowTriggerMatcher` checks if message text matches any active workflow's trigger keyword
3. If match → `WorkflowExecutionEngine.startExecution()` creates a new execution record
4. Engine enters the **run loop**

**The Run Loop:**
```
currentNode = first node after trigger
while (currentNode && steps < 50):
    handler = handlerMap.get(node.type)
    result = handler.execute(node, context, outEdges)
    steps++

    if result.action == 'continue':
        currentNode = result.nextNodeId
    if result.action == 'wait':
        save execution state (current_node_id, variables, wait_type)
        schedule timeout job if needed
        RETURN (execution paused)
    if result.action == 'end':
        mark execution completed
        RETURN
    if result.action == 'error':
        mark execution failed
        RETURN
```

**Resuming an execution:**
1. Customer sends a reply
2. `WebhookProcessor` checks for an active execution waiting for reply (by customer phone)
3. If found → `WorkflowExecutionEngine.resumeExecution()` is called
4. The customer's reply is placed into `context.lastReply`
5. Engine continues from the paused node, advancing to the next node
6. Run loop continues until next pause or end

**Edge Routing:**
- **Button nodes**: Customer's button click title is matched against edge labels
- **List nodes**: Customer's list selection title is matched against edge labels
- **Condition nodes**: Edges labeled "Yes" / "No"
- **Switch nodes**: Edges labeled with case values
- **Single-output nodes**: Follow the one outgoing edge
- **Commerce nodes**: Edges labeled "Success" / "Failure" or "In Stock" / "Out of Stock"

### Execution Context

Every execution carries a context object:
```typescript
{
  executionId: string;
  workflowId: string;
  schema: string;           // tenant schema
  tenant: { phoneNumberId, accessToken };
  conversationId: string;
  customerPhone: string;
  customerId: string;
  customerName?: string;
  variables: Record<string, any>;  // accumulated data from nodes
  lastReply?: {
    type: 'text' | 'button_reply' | 'list_reply';
    text?: string;
    actionId?: string;
    actionTitle?: string;
  };
}
```

### Creating a Workflow (API)

```bash
# 1. Create workflow
POST /api/workflows
{
  "name": "Welcome Bot",
  "description": "Greets new customers",
  "trigger": { "type": "keyword", "value": "hi" }
}

# 2. Save definition (nodes + edges)
PUT /api/workflows/:id/definition
{
  "nodes": [
    { "id": "1", "type": "trigger", "data": { "keyword": "hi" }, "position": { "x": 100, "y": 100 } },
    { "id": "2", "type": "send_text", "data": { "text": "Welcome! How can I help?" }, "position": { "x": 100, "y": 250 } },
    { "id": "3", "type": "send_buttons", "data": { "text": "Choose an option:", "buttons": ["Browse Products", "Track Order", "Help"] }, "position": { "x": 100, "y": 400 } },
    { "id": "4", "type": "end", "data": {}, "position": { "x": 100, "y": 550 } }
  ],
  "edges": [
    { "id": "e1", "source": "1", "target": "2" },
    { "id": "e2", "source": "2", "target": "3" },
    { "id": "e3", "source": "3", "target": "4", "label": "Help" }
  ]
}

# 3. Activate
POST /api/workflows/:id/activate
```

### Safety Guards

- **Max 50 steps** per execution — prevents infinite loops
- **Redis lock** per execution — prevents concurrent resume
- **Timeout jobs** — if customer doesn't reply within configured time, the execution can auto-expire
- **Deduplication** — same inbound message won't trigger twice

---

## 10. Billing & Subscription System

### Subscription Plans

Each tenant has one active subscription with these limits:

| Field | Description | Default (Trial) |
|-------|------------|-----------------|
| `plan` | Plan name | `trial` |
| `max_conversations` | WhatsApp conversations per month | 100 |
| `max_products` | Maximum products in catalog | 50 |
| `max_campaigns_per_month` | Campaigns per month | 5 |
| `valid_until` | Expiry date (null = no expiry) | 30 days from signup |
| `allow_exceed` | Whether to allow exceeding conversation limit | `false` |

### How Conversation Quotas Work

```
Every new 24-hour conversation session counts as 1 conversation.
Multiple messages within the same 24h window = 1 conversation.

subscription.conversations_used is incremented for each new session.
subscription.max_conversations is the plan limit.

Monthly reset: 1st of every month at 00:00 IST (automatic cron).
```

**When limit is reached:**
- `allow_exceed = false` → New conversations are **blocked**. Customer messages still arrive but the system won't create new sessions or send outbound messages.
- `allow_exceed = true` → Conversations continue. The tenant is notified but not blocked.

**Soft limit warning** at 80%: An event is emitted (`quota.soft_limit`) which can trigger email/WhatsApp notifications.

### Wallet System

Each tenant has an INR wallet for platform charges:
- **Credit**: Via Razorpay payment (top-up)
- **Debit**: Currently disabled for per-conversation billing (subscription-only model)
- **Auto-recharge**: Can be configured to auto-top-up when balance falls below threshold

### Razorpay Integration

```
Tenant clicks "Top Up Wallet" → Frontend calls POST /api/billing/topup
→ Backend creates a Razorpay order → Returns order_id
→ Frontend opens Razorpay checkout popup
→ Customer pays → Razorpay redirects back
→ Frontend calls POST /api/billing/verify with payment signature
→ Backend verifies HMAC signature → Credits wallet
```

---

## 11. Database Schema Reference

### Public Schema (Platform-Wide)

```
public.tenants                    — Tenant registry
public.subscriptions              — Billing plans and quotas
public.super_admins               — Platform admin accounts
public.tenant_migration_history   — Migration tracking
public.waba_accounts              — WhatsApp Business Accounts
public.phone_numbers              — Phone number pool (assigned to tenants)
public.meta_tokens                — Encrypted Meta API tokens
public.conversation_sessions      — 24h conversation windows
public.conversation_costs         — Per-conversation cost tracking
public.quota_events               — Quota change audit trail
public.billing_events             — Billing event log
public.template_registry          — Shared WhatsApp template registry
public.quality_scores             — Phone number quality rating history
public.audit_logs                 — Admin action audit trail
public.rate_limits                — Per-tenant rate limiting config
public.wallets                    — Tenant wallets (INR balance)
public.wallet_transactions        — Wallet ledger (credits/debits)
public.razorpay_subscriptions     — Razorpay subscription records
public.razorpay_orders            — Razorpay order records
```

### Tenant Schema (Per-Business)

Each tenant gets their own schema with these tables:

```
users                  — Staff accounts (owner, seller roles)
customers              — WhatsApp customers (auto-created from messages)
addresses              — Customer delivery addresses
categories             — Product categories (hierarchical)
products               — Product catalog
product_variants       — Product variants (size, color, etc.)
inventory              — Stock levels per product/variant
stock_reservations     — Temporary stock holds during checkout
carts                  — Customer shopping carts
cart_items             — Items in carts
orders                 — Purchase orders
order_items            — Line items in orders
payments               — UPI payment records
deliveries             — Delivery tracking
conversations          — WhatsApp conversation threads
messages               — Individual WhatsApp messages
webhook_events         — Raw webhook event log
campaigns              — Bulk broadcast campaigns
campaign_segments      — Customer segments for targeting
templates              — WhatsApp message templates
settings               — Key-value settings store
workflows              — Visual workflow definitions
workflow_executions    — Workflow execution state and history
```

---

## 12. API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | Public | Self-service signup (creates tenant + user) |
| POST | `/api/auth/login` | Public | Login (admin or tenant user) |
| POST | `/api/auth/logout` | Authenticated | Destroy session |
| GET | `/api/auth/me` | Authenticated | Session rehydration |
| POST | `/api/auth/register` | Owner | Add team member to tenant |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (paginated) |
| GET | `/api/products/:id` | Get product detail |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |
| GET | `/api/products/categories` | List all categories |

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders (filter by status, search, payment status) |
| GET | `/api/orders/stats` | Order statistics |
| GET | `/api/orders/dashboard/counts` | Dashboard count tiles |
| GET | `/api/orders/dashboard/chart?days=7` | Revenue chart data |
| GET | `/api/orders/:id` | Order detail with items, payment, delivery |
| PUT | `/api/orders/:id/status` | Update order status |

### Cart

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/carts/:customerId` | Get active cart |
| POST | `/api/carts/:customerId/items` | Add item to cart |
| PUT | `/api/carts/:customerId/items/:itemId` | Update quantity |
| DELETE | `/api/carts/:customerId/items/:itemId` | Remove item |
| POST | `/api/carts/:customerId/checkout` | Convert cart to order |

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory` | All inventory records |
| GET | `/api/inventory/low-stock` | Low-stock items only |
| PUT | `/api/inventory/:id/adjust` | Adjust stock (body: `{ adjustment, reason }`) |

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments` | List payments |
| POST | `/api/payments/:id/verify` | Verify payment |
| POST | `/api/payments/:id/reject` | Reject payment |

### Deliveries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deliveries` | List deliveries |
| GET | `/api/deliveries/stats` | Delivery statistics |
| POST | `/api/deliveries/:id/assign` | Assign delivery agent |
| PUT | `/api/deliveries/:id/status` | Update delivery status |

### Customers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers` | List customers (paginated, searchable) |
| GET | `/api/customers/stats` | Customer statistics |
| GET | `/api/customers/:id` | Customer profile |
| GET | `/api/customers/:id/orders` | Customer order history |
| PUT | `/api/customers/:id/tags` | Update tags |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/stats` | Conversation statistics |
| GET | `/api/conversations/:id/messages` | Message history |
| POST | `/api/conversations/:id/send` | Send manual reply |

### Campaigns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id/stats` | Campaign statistics |
| POST | `/api/campaigns/:id/send` | Trigger send |
| GET | `/api/campaigns/segments` | List segments |
| POST | `/api/campaigns/segments` | Create segment |

### Workflows

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows` | List workflows |
| GET | `/api/workflows/:id` | Get workflow with definition |
| POST | `/api/workflows` | Create workflow |
| PATCH | `/api/workflows/:id` | Update metadata |
| PUT | `/api/workflows/:id/definition` | Save node/edge graph |
| DELETE | `/api/workflows/:id` | Delete workflow |
| POST | `/api/workflows/:id/activate` | Activate |
| POST | `/api/workflows/:id/pause` | Pause |
| POST | `/api/workflows/:id/archive` | Archive |
| POST | `/api/workflows/:id/duplicate` | Duplicate |
| POST | `/api/workflows/:id/test` | Test-run |
| GET | `/api/workflows/:id/executions` | Execution history |

### Onboarding

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/onboarding/status` | Current onboarding step |
| POST | `/api/onboarding/check-phone` | Verify phone number |
| POST | `/api/onboarding/connect-whatsapp` | Connect with own credentials |
| POST | `/api/onboarding/connect-platform` | Connect via platform pool |
| POST | `/api/onboarding/business-profile` | Save business profile |
| POST | `/api/onboarding/complete` | Mark complete |
| POST | `/api/onboarding/skip` | Skip onboarding |
| GET | `/api/onboarding/setup-guide` | Setup instructions |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get all settings |
| PUT | `/api/settings` | Update settings (key-value pairs) |
| PUT | `/api/settings/allow-exceed` | Toggle conversation exceed |

### Billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/wallet` | Wallet balance |
| GET | `/api/billing/wallet/transactions` | Transaction history |
| POST | `/api/billing/topup` | Create Razorpay top-up order |
| POST | `/api/billing/subscribe` | Create Razorpay subscription order |
| POST | `/api/billing/verify` | Verify Razorpay payment |
| GET | `/api/billing/config` | Get Razorpay key ID |
| POST | `/api/billing/webhook/razorpay` | Razorpay webhook |

### WhatsApp Webhook

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhook/whatsapp` | Webhook verification handshake |
| POST | `/api/webhook/whatsapp` | Receive inbound messages/statuses |

### Super Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/auth/login` | Admin login |
| GET | `/api/admin/stats` | Platform statistics |
| GET | `/api/admin/tenants` | List tenants |
| POST | `/api/admin/tenants` | Create tenant |
| GET | `/api/admin/tenants/:id/usage` | Tenant usage |
| PUT | `/api/admin/subscriptions/:id` | Update subscription |

### WABA Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/waba/accounts` | List WABA accounts |
| POST | `/api/admin/waba/accounts` | Create WABA account |
| POST | `/api/admin/waba/accounts/sync` | Sync from Meta |
| GET | `/api/admin/waba/phones` | List phone numbers |
| POST | `/api/admin/waba/phones/:id/assign` | Assign to tenant |
| POST | `/api/admin/waba/phones/:id/unassign` | Unassign |
| POST | `/api/admin/waba/tokens` | Store access token |
| GET | `/api/admin/waba/templates` | List templates |
| POST | `/api/admin/waba/templates` | Create template |
| GET | `/api/admin/waba/audit-logs` | View audit logs |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (DB + Redis) |

---

## 13. Queue & Background Jobs

Six BullMQ queues backed by Redis:

| Queue | Purpose | Rate | Concurrency | Retries |
|-------|---------|------|-------------|---------|
| `whatsapp-outbound` | Send WhatsApp messages via Meta API | 70/sec | 10 | 3 (exponential backoff) |
| `broadcast` | Campaign bulk sends | — | 5 | 3 |
| `workflow-resume` | Resume paused workflow executions (delay nodes) | — | 5 | 2 |
| `reservation-cleanup` | Expire stock reservations after TTL | — | 3 | 1 |
| `payment-expiry` | Expire unpaid UPI payments | — | 3 | 1 |
| `media-processing` | Process uploaded media files | — | 3 | 2 |

### Cron Jobs

| Schedule | Job | Description |
|----------|-----|-------------|
| Every 5 minutes | Close expired sessions | Marks conversation sessions past 24h as `closed` |
| 1st of month, 00:00 IST | Reset monthly quotas | Resets `conversations_used` to 0 for all active subscriptions |

---

## 14. Deployment Guide

### Development

```bash
# Terminal 1: Infrastructure
docker-compose up -d

# Terminal 2: Backend
npm run start:dev

# Terminal 3: Frontend
cd frontend && npm start
```

Access:
- Frontend: http://localhost:4200
- Backend API: http://localhost:3001/api
- pgAdmin: http://localhost:5050

### Production

```bash
# Build
npm run build
cd frontend && npm run build

# The Angular build output is at frontend/dist/wa-commerce/
# Serve it with nginx or similar, proxying /api to the backend

# Start backend
NODE_ENV=production npm run start:prod
```

**Production checklist:**
- [ ] Set `DB_SYNCHRONIZE=false`
- [ ] Set strong `SESSION_SECRET`
- [ ] Set strong `TOKEN_ENCRYPTION_KEY`
- [ ] Configure real `WHATSAPP_APP_SECRET`
- [ ] Set up SSL/HTTPS (required for Meta webhooks)
- [ ] Configure a public domain for webhook URL
- [ ] Set `CORS_ORIGIN` to your production frontend URL
- [ ] Run `npm run seed:admin` with custom credentials
- [ ] Set up log aggregation (the app logs via NestJS Logger)
- [ ] Set up Redis persistence (AOF or RDB)
- [ ] Configure PostgreSQL backups

### Docker (Full Stack)

```bash
npm run docker:dev
```

Uses `.docker/docker-compose.yml` which containerizes the full app (backend + Postgres + Redis + pgAdmin).

---

## 15. Troubleshooting

### Common Issues

**"No active subscription found" error**
- The tenant's subscription may have expired or doesn't exist
- Fix: Super admin → update subscription, or re-run tenant provisioning

**WhatsApp messages not being received**
- Check webhook configuration in Meta Developer Console
- Verify `WHATSAPP_VERIFY_TOKEN` matches what's in Meta's webhook config
- Ensure your server is publicly accessible (Meta can't reach localhost)
- Check `webhook_events` table for raw events

**"Conversation limit reached" blocking messages**
- Tenant has hit their subscription's `max_conversations`
- Fix: Enable "Allow Exceed" in Settings → Subscription tab, or upgrade the plan

**500 error on product listing**
- Usually a column mismatch between SQL and actual DB schema
- Check backend logs for the exact SQL error
- Run `npm run migration:run` to ensure all migrations are applied

**Frontend shows "undefined" in stats**
- The backend API may be returning keys in unexpected format
- The global `TransformResponseInterceptor` converts snake_case → camelCase
- Ensure frontend reads camelCase keys from API responses

**Session expired / login redirect loop**
- Redis may not be running (sessions are Redis-backed)
- Check `REDIS_HOST` and `REDIS_PORT` in `.env`
- Check `SESSION_SECRET` hasn't changed (invalidates existing sessions)

**"Phone number already assigned" during onboarding**
- The phone number is already assigned to another tenant
- Super admin can unassign it: `POST /api/admin/waba/phones/:id/unassign`

### Useful Commands

```bash
# Check health
curl http://localhost:3001/api/health

# View running queues (via BullMQ)
# Open Redis CLI and check keys: KEYS bull:*

# Reset a tenant's conversation quota
# (via psql)
UPDATE public.subscriptions SET conversations_used = 0 WHERE tenant_id = 'xxx';

# Re-run tenant migrations
npm run migration:run

# Create a tenant via CLI
npm run tenant:create
```

### Log Locations

- Backend logs: stdout (NestJS Logger)
- Webhook events: `<tenant_schema>.webhook_events` table
- Audit trail: `public.audit_logs` table
- Wallet transactions: `public.wallet_transactions` table
- Queue failures: Redis (BullMQ failed job list)

---

## Quick Reference Card

| What | Where |
|------|-------|
| Super Admin Login | `http://localhost:4200/admin/login` |
| Super Admin Email | `admin@wacommerce.in` |
| Super Admin Password | `Admin@123456` |
| Tenant Signup | `http://localhost:4200/auth/register` |
| Tenant Login | `http://localhost:4200/auth/login` |
| Backend API Base | `http://localhost:3001/api` |
| Health Check | `http://localhost:3001/api/health` |
| pgAdmin | `http://localhost:5050` (admin@admin.com / admin) |
| Database | `whatsapp_commerce` on localhost:5432 |
| Redis | localhost:6379 |
| WhatsApp Webhook | `POST https://your-domain.com/api/webhook/whatsapp` |
| Webhook Verify Token | `my-wa-commerce-verify-2024` (from .env) |

---

*This documentation covers the complete WhatsApp Commerce Platform as of May 2026. For the latest code, always refer to the source files in the repository.*
