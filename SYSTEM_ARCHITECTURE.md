# WA Commerce - Complete System Architecture Document

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Tech Stack](#2-tech-stack)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Multi-Tenancy Architecture](#4-multi-tenancy-architecture)
5. [Database Schema Design](#5-database-schema-design)
6. [Backend Architecture (NestJS)](#6-backend-architecture-nestjs)
7. [Frontend Architecture (Angular)](#7-frontend-architecture-angular)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Onboarding System (Complete Flow)](#9-onboarding-system-complete-flow)
10. [WhatsApp Integration](#10-whatsapp-integration)
11. [WABA Management & BSP Architecture](#11-waba-management--bsp-architecture)
12. [Workflow Engine](#12-workflow-engine)
13. [E-Commerce Engine](#13-e-commerce-engine)
14. [Billing & Payments](#14-billing--payments)
15. [Campaign & Broadcasting](#15-campaign--broadcasting)
16. [Queue & Background Jobs](#16-queue--background-jobs)
17. [Security Architecture](#17-security-architecture)
18. [API Reference](#18-api-reference)
19. [Environment Configuration](#19-environment-configuration)

---

## 1. Platform Overview

WA Commerce is a **multi-tenant WhatsApp Commerce SaaS platform** that enables businesses to sell products, manage orders, process payments, and automate customer interactions entirely through WhatsApp. The platform acts as a **Business Solution Provider (BSP)** — it owns the Meta infrastructure (WABA accounts, phone number pool, API tokens, webhook subscriptions, billing relationship) and tenants bring their own phone numbers.

### What It Does

- **WhatsApp Storefront**: Customers browse catalogs, add to cart, checkout, and pay — all inside WhatsApp chat
- **Visual Workflow Builder**: Drag-and-drop automation for customer journeys (order confirmations, payment reminders, support routing)
- **Multi-Tenant SaaS**: Each business gets isolated data (schema-per-tenant), their own WhatsApp number, and a subscription plan with conversation quotas
- **Centralized Meta Infrastructure**: Platform owns WABA accounts, manages API tokens, handles Meta billing, and pools phone numbers across tiers
- **Campaign Broadcasting**: Segment customers and send bulk WhatsApp template messages
- **Real-Time Conversations**: WhatsApp-style inbox for manual customer support with 24-hour window tracking

### Business Model

- Platform owns multiple WABA accounts organized in tiers (starter/growth/enterprise/quarantine)
- Tenants subscribe to plans (Starter $49, Growth $190, Professional $390, Enterprise $790/month)
- Each plan includes conversation quotas; overages charged per-conversation with country-based Meta pricing + 15% markup
- Wallet-based billing with Razorpay (INR) for top-ups and subscriptions
- Tenants provide their OWN WhatsApp phone numbers; platform registers them under shared WABAs

---

## 2. Tech Stack

### Backend
| Component | Technology |
|-----------|-----------|
| Framework | NestJS (Node.js) |
| Language | TypeScript |
| Database | PostgreSQL (schema-per-tenant) |
| ORM | TypeORM |
| Cache/Pub-Sub | Redis (ioredis) |
| Queue | BullMQ (10 named queues) |
| Events | EventEmitter2 |
| Sessions | express-session + connect-redis |
| Payments | Razorpay SDK |
| Storage | AWS S3 + CloudFront |
| WhatsApp API | Meta Cloud API v21.0 |
| Scheduling | @nestjs/schedule (cron) |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | Angular 21.2 (standalone components) |
| UI Library | PrimeNG 21 (Aura theme) |
| CSS | Tailwind CSS v4 |
| Charts | Chart.js 4.5 |
| State | Angular Signals |
| Payments | Razorpay Checkout.js |
| WhatsApp Signup | Facebook JavaScript SDK |

---

## 3. High-Level Architecture

```
                                    +-------------------+
                                    |   Angular SPA     |
                                    | (PrimeNG + TW4)   |
                                    +--------+----------+
                                             |
                                             | HTTP (session cookies)
                                             |
                                    +--------v----------+
                                    |    NestJS API     |
                                    |  (Express + Guards)|
                                    +--------+----------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
           +--------v------+       +--------v------+       +---------v-----+
           |  PostgreSQL   |       |    Redis      |       |   BullMQ      |
           | (public +     |       | (sessions,    |       | (10 queues,   |
           |  N tenant     |       |  cache, dedup,|       |  outbound,    |
           |  schemas)     |       |  rate limits, |       |  broadcast,   |
           |               |       |  locks)       |       |  workflows,   |
           +---------------+       +---------------+       |  payments...) |
                                                           +---------------+
                    +--------------------+
                    |  Meta Cloud API    |
                    |  (Graph API v21.0) |
                    +--------------------+
                    |  - Send/receive messages
                    |  - Phone registration
                    |  - Template management
                    |  - Webhook events
                    |  - Embedded Signup OAuth
                    +--------------------+

                    +--------------------+
                    |  External Services |
                    +--------------------+
                    |  - Razorpay (payments)
                    |  - AWS S3 (media storage)
                    |  - CloudFront (CDN)
                    +--------------------+
```

### Request Flow

1. Browser sends request with session cookie
2. `RequestIdMiddleware` assigns UUID
3. `TenantResolutionMiddleware` resolves tenant from session, sets `request.tenantContext`
4. `RateLimitMiddleware` checks Redis sliding window (100 req/tenant/min)
5. `AuthGuard` validates session
6. `RolesGuard` checks `@Roles()` decorator
7. `SubscriptionGuard` verifies active subscription + conversation limits
8. Controller method executes
9. `TransformResponseInterceptor` wraps response in `{ success: true, data: ... }`

---

## 4. Multi-Tenancy Architecture

### Schema-Per-Tenant Isolation

Every tenant gets their own PostgreSQL schema containing 25 tables:

```
public schema (shared):
  - tenants, subscriptions, super_admins, tenant_migration_history
  - waba_accounts, phone_numbers, meta_tokens
  - conversation_sessions, conversation_costs, template_registry, quality_scores
  - audit_logs, onboarding_sessions
  - tenant_quota_config, meta_pricing, number_health, tenant_risk_score, tenant_usage_monthly
  - embedded_signup_sessions, webhook_subscriptions, coexistence_sessions
  - wallets, wallet_transactions, razorpay_orders, razorpay_subscriptions

tenant_<slug> schema (per-tenant, 25 tables):
  - users, customers, addresses
  - categories, products, product_variants
  - inventory, stock_reservations
  - carts, cart_items
  - orders, order_items
  - payments, deliveries
  - conversations, messages, webhook_events
  - campaigns, campaign_segments
  - templates, settings
  - workflows, workflow_executions
```

### How Tenant Isolation Works

```typescript
// TenantConnectionManager sets PostgreSQL search_path per query
async executeInTenantContext(schemaName: string, callback: Function) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.query(`SET search_path TO "${schemaName}"`);
  try {
    return await callback(queryRunner);
  } finally {
    await queryRunner.release();
  }
}
```

### Tenant Provisioning

When a new tenant signs up:
1. Create `tenants` record in public schema
2. Create PostgreSQL schema `tenant_<slug>`
3. Run all 25 migrations in the new schema (users, products, orders, etc.)
4. Create `subscriptions` record with plan limits
5. Create owner user in `tenant_<slug>.users`
6. Seed default settings (currency INR, timezone IST, etc.)

---

## 5. Database Schema Design

### Public Schema Entities (26 total)

#### Core Platform
| Entity | Table | Key Fields |
|--------|-------|------------|
| `Tenant` | tenants | id, name, slug, schemaName, phoneNumberId, wabaId, accessToken, status, onboardingStatus, businessName/Category/Description/Address/LogoUrl, whatsappPhone, settings (jsonb) |
| `Subscription` | subscriptions | tenantId, plan (name, maxProducts, maxConversations, maxCampaigns, conversationLimit), conversationsUsed, status, validUntil, allowExceed |
| `SuperAdmin` | super_admins | email, passwordHash (bcrypt 12), name, role |
| `TenantMigrationHistory` | tenant_migration_history | tenantId, migrationName, version, checksum |

#### WABA & Phone Management
| Entity | Table | Key Fields |
|--------|-------|------------|
| `WabaAccount` | waba_accounts | wabaId (unique), name, businessId, currency, messagingLimitTier (TIER_1K/10K/100K/UNLIMITED), accountReviewStatus, paymentMethodAttached, settings (jsonb: tier, isQuarantine) |
| `PhoneNumber` | phone_numbers | phoneNumberId (unique), phoneNumber, wabaAccountId (FK), tenantId (FK), displayName, verifiedName, qualityRating (GREEN/YELLOW/RED), messagingLimit, status, registrationStatus, platformType (CLOUD_API/COEXISTENCE), metadata (jsonb) |
| `MetaToken` | meta_tokens | wabaAccountId, tokenType (system_user/long_lived_user/embedded_signup), encryptedToken (AES-256-GCM), tokenHash, expiresAt, isActive, scopes |
| `WebhookSubscription` | webhook_subscriptions | wabaAccountId, wabaId, subscribedFields (jsonb array of 10 fields), status, lastVerifiedAt, lastError, retryCount |

#### Conversation Accounting
| Entity | Table | Key Fields |
|--------|-------|------------|
| `ConversationSession` | conversation_sessions | 24-hour billing windows matching Meta's model |
| `ConversationCost` | conversation_costs | Per-session: metaCost, platformCost, tenantCharge |
| `TenantQuotaConfig` | tenant_quota_config | maxConversations, maxMarketing, maxPhones, softLimitPct (80%), hardLimitPct (100%), rateLimitMps/Mph, billingModel (prepaid/postpaid), overageRate |
| `MetaPricing` | meta_pricing | countryCode, category, metaCostUsd, localCost, markupPct (15%), tenantRate, effectiveDateRange |
| `TenantUsageMonthly` | tenant_usage_monthly | billingPeriod, totalConversations, per-category counts, cost breakdown (meta/platform/tenant/overage), quotaUsedPct |

#### Quality & Risk
| Entity | Table | Key Fields |
|--------|-------|------------|
| `QualityScore` | quality_scores | Quality rating change history |
| `NumberHealth` | number_health | deliveryMetrics (24h rolling), abuseSignals (spam/blocks/templateRejections), compositeHealthScore (0-100), throttleState |
| `TenantRiskScore` | tenant_risk_score | 6 signal dimensions (quality/abuse/delivery/content/payment/volume, each 0-100), compositeScore, riskLevel (low/medium/high/critical), isQuarantined |

#### Onboarding & Signup
| Entity | Table | Key Fields |
|--------|-------|------------|
| `OnboardingSession` | onboarding_sessions | 17-state machine (initiated->detecting->fresh/wa/bsp->otp->active/failed), detectionResult, detectedProvider, OTP tracking (attempts, method, sentAt), migration instructions, retryCount (max 10) |
| `EmbeddedSignupSession` | embedded_signup_sessions | 10-state machine (initiated->code_received->token_exchanged->waba_synced->phone_synced->system_token->webhook_subscribed->completed), Facebook auth data, coexistence flags, raw sessionInfo |
| `CoexistenceSession` | coexistence_sessions | 11-state machine (initiated->eligible->consent->provisioning->active->migrating->complete), WA Business App + Cloud API coexistence tracking |

#### Billing
| Entity | Table | Key Fields |
|--------|-------|------------|
| `Wallet` | wallets | tenantId, balance, autoRecharge, autoRechargeThreshold, autoRechargeAmount, lowBalanceAlertThreshold |
| `WalletTransaction` | wallet_transactions | type (credit/debit), amount, balanceAfter, description, referenceType/Id |
| `RazorpayOrder` | razorpay_orders | razorpayOrderId, amount, currency (INR), purpose (wallet_topup/subscription), status |
| `RazorpaySubscription` | razorpay_subscriptions | razorpaySubscriptionId, razorpayPlanId, status, currentPeriodEnd |

#### Shared
| Entity | Table | Key Fields |
|--------|-------|------------|
| `TemplateRegistry` | template_registry | templateName, metaTemplateId, category, language, components (jsonb), status (APPROVED/PENDING/REJECTED) |
| `AuditLog` | audit_logs | tenantId, actorType (admin/system/tenant_user/webhook), actorId, action, resourceType, resourceId, details (jsonb), ipAddress |

### Tenant Schema Tables (25 per tenant)

| Table | Purpose |
|-------|---------|
| users | Tenant's team members (owner, seller, support roles) |
| customers | WhatsApp customers who interact with the store |
| addresses | Customer addresses for delivery |
| categories | Product categories |
| products | Product catalog with translations |
| product_variants | Size/color/etc. variants |
| inventory | Stock levels per product |
| stock_reservations | Temporary holds during checkout (15min TTL) |
| carts | Customer shopping carts |
| cart_items | Items in carts |
| orders | Customer orders with status lifecycle |
| order_items | Line items in orders |
| payments | Payment records (UPI QR, proof upload) |
| deliveries | Delivery tracking |
| conversations | WhatsApp conversation threads |
| messages | Individual messages (inbound + outbound) |
| webhook_events | Raw Meta webhook payloads (for debugging) |
| campaigns | Broadcast campaign definitions |
| campaign_segments | Customer segments for targeting |
| templates | WhatsApp message templates |
| settings | Tenant-specific settings (business hours, payment config, etc.) |
| workflows | Visual workflow definitions (nodes + edges JSONB) |
| workflow_executions | Workflow execution state (current node, variables, wait state) |

---

## 6. Backend Architecture (NestJS)

### Module Structure (25 modules)

```
src/
  app.module.ts              # Root module (25 imports)
  main.ts                    # Bootstrap (helmet, CORS, sessions, pipes, filters)
  config/
    app.config.ts            # Port, CORS, API prefix
    database.config.ts       # PostgreSQL connection
    redis.module.ts          # Global Redis (ioredis) provider
    s3.config.ts             # AWS S3 + CloudFront
    whatsapp.config.ts       # Meta API version, rate limits
  database/
    database.module.ts       # Global TypeORM with 26 entities
    tenant-connection.manager.ts  # search_path isolation
    tenant-migration.service.ts   # Schema creation + migration runner
    seed-admin.ts            # Super admin seeder
    entities/public/         # 26 public schema entities
    migrations/
      public/                # 3 public migrations (initial, waba, billing)
      tenant/index.ts        # 25 tenant migrations
  common/
    guards/                  # auth, roles, subscription, tenant, webhook-signature
    middleware/               # tenant-resolution, request-id, rate-limit
    interceptors/            # transform-response, idempotency, logging, tenant-context
    decorators/              # @Public, @Roles, @CurrentTenant
    filters/                 # GlobalExceptionFilter
    dto/                     # PaginationDto, PaginatedResponse
    enums/                   # OrderStatus, PaymentStatus, DeliveryStatus
  modules/
    auth/                    # Session-based auth (no JWT)
    tenant/                  # CRUD + provisioning + settings
    super-admin/             # Platform admin dashboard
    onboarding/              # Number registration + engine (state machine)
    waba/                    # WABA management + 7 sub-modules
    whatsapp/                # Webhook processing + message handling
    workflow/                # Visual workflow engine (23 node handlers)
    billing/                 # Wallet + Razorpay
    catalog/                 # Products + categories
    order/                   # Orders + carts
    inventory/               # Stock + reservations
    payment/                 # UPI QR + proof verification
    delivery/                # Delivery tracking
    customer/                # Customer management + segmentation
    campaign/                # Broadcasting + segments
    conversation/            # WhatsApp inbox
    media/                   # S3 uploads
    i18n/                    # English + Hindi
    events/                  # Domain event bus (12 event types)
    health/                  # Health check endpoint
  queue/
    queue.module.ts          # 10 BullMQ queues
```

### WABA Module Sub-Modules (7)

```
src/modules/waba/
  waba.module.ts             # Parent module
  waba.controller.ts         # Admin API (/api/admin/waba)
  waba.service.ts            # WABA account CRUD
  meta-cloud-api.client.ts   # Meta Graph API wrapper
  meta-token.service.ts      # AES-256-GCM token encryption
  phone-number.service.ts    # Phone number CRUD
  audit-log.service.ts       # Audit logging
  dto/create-waba.dto.ts     # Validation DTOs
  embedded-signup/           # Meta Embedded Signup + Coexistence
    embedded-signup.module.ts
    embedded-signup.controller.ts
    embedded-signup.service.ts    # 10-step signup flow with session tracking
    system-token.service.ts       # User token -> System User token
    webhook-subscription.service.ts  # Per-WABA webhook management
    coexistence.service.ts        # WA Business App + Cloud API coexistence
  allocation/                # WABA pool management
    allocation.module.ts
    waba-allocation.service.ts    # Least-utilized WABA picker, quarantine
    waba-health-monitor.service.ts # Quality/delivery/abuse tracking
  accounting/                # Conversation cost tracking
    accounting.module.ts
    conversation-accounting.service.ts  # 24h sessions, country pricing, quotas
  risk/                      # Tenant risk scoring
    risk.module.ts
    risk-scoring.service.ts       # 6-signal composite score, auto-quarantine
  metering/                  # Real-time conversation metering
    metering.module.ts
    conversation-metering.service.ts  # Meter each conversation, check quotas
    quota-enforcement.service.ts      # Soft/hard limits, pause/resume
    rate-limit.service.ts             # 3-tier sliding window (80/s, 1000/m, 10000/h)
    metering-cron.service.ts          # Close expired sessions, monthly reset
  template/                  # Template management
    template.module.ts
    template.service.ts
    template.controller.ts
  phone/                     # Phone lifecycle
    phone.module.ts
    phone-onboarding.service.ts   # 6-step phone onboarding
    quality-monitor.service.ts    # Quality change tracking
```

### Domain Events (12 types)

| Event | Trigger | Consumers |
|-------|---------|-----------|
| OrderCreatedEvent | Order created from cart | Workflow event listener |
| OrderStatusChangedEvent | Status updated | Workflow event listener |
| PaymentVerifiedEvent | Payment proof approved | Workflow event listener |
| PaymentRejectedEvent | Payment proof rejected | Workflow event listener |
| PaymentExpiredEvent | Payment timeout | Order status update |
| StockReservedEvent | Stock reserved for cart | Logging |
| StockLowEvent | Stock below threshold | Alerts |
| ReservationExpiredEvent | 15min reservation timeout | Stock release |
| CustomerCreatedEvent | New customer from WhatsApp | Logging |
| WhatsAppMessageReceivedEvent | Inbound message | Conversation tracking |
| WhatsAppMessageSentEvent | Outbound message sent | Conversation tracking |
| CampaignStartedEvent / CompletedEvent | Campaign lifecycle | Stats |
| DeliveryStatusChangedEvent | Delivery updated | Order status cascade |

---

## 7. Frontend Architecture (Angular)

### Project Structure

```
frontend/src/app/
  app.ts                     # Root component (<router-outlet />)
  app.config.ts              # Providers (router, HTTP interceptors, PrimeNG Aura theme)
  app.routes.ts              # Top-level routes with lazy loading
  core/
    models/index.ts          # All TypeScript interfaces
    services/                # 16 API services
      api.service.ts         # Base HTTP client (wraps HttpClient)
      auth.service.ts        # Session auth with signals
      tenant.service.ts      # Admin tenant CRUD
      onboarding.service.ts  # Number registration + state machine
      embedded-signup.service.ts  # Facebook OAuth + coexistence
      product.service.ts     # Products + categories
      order.service.ts       # Orders lifecycle
      inventory.service.ts   # Stock management
      payment.service.ts     # Payment management
      delivery.service.ts    # Delivery tracking
      customer.service.ts    # Customers + segments
      campaign.service.ts    # Campaigns + broadcasting
      conversation.service.ts # WhatsApp inbox
      workflow.service.ts    # Workflow CRUD
      subscription.service.ts # Plans + subscriptions
      billing.service.ts     # Wallet + Razorpay
      waba.service.ts        # Admin WABA management
    guards/
      auth.guard.ts          # Redirects to /auth/login
      admin.guard.ts         # Super admin only
      onboarding.guard.ts    # Redirects to /onboarding if incomplete
    interceptors/
      auth.interceptor.ts    # withCredentials + 401 redirect
      tenant.interceptor.ts  # X-Tenant-ID header injection
      api-response.interceptor.ts  # Unwraps { success, data } envelope
  layout/
    main-layout.component.ts # Sidebar + header (11 nav items)
  features/
    auth/                    # Login + Register (split-screen design)
    dashboard/               # Stats, charts, alerts, recent orders
    onboarding/              # 3-step wizard (WhatsApp + Profile + Complete)
    products/                # Product list + form (create/edit)
    orders/                  # Order list + detail (with status stepper)
    customers/               # Customer list + detail (tags, segments)
    campaigns/               # Campaign list + 4-step form (setup/audience/message/schedule)
    conversations/           # WhatsApp-style split-panel chat inbox
    inventory/               # Stock table + adjust dialog
    payments/                # Payment list + proof viewer + verify/reject
    deliveries/              # Delivery list + courier assignment
    workflow-builder/        # Visual builder (canvas + palette + config panel)
    settings/                # 5-tab settings + billing dashboard + usage dashboard
    super-admin/             # Admin dashboard + tenants + plans + WABA management
```

### Routing Architecture

```
/auth
  /login                     # Login form
  /register                  # Sign-up form

/onboarding                  # [authGuard] 3-step wizard

/admin                       # [adminGuard] Admin portal
  /dashboard                 # Platform stats
  /tenants                   # Tenant management
  /tenants/new               # Create tenant
  /tenants/:id/edit          # Edit tenant
  /subscriptions             # Plan management
  /subscriptions/new         # Create plan
  /subscriptions/:id/edit    # Edit plan
  /waba                      # WABA dashboard (5 tabs)

/                            # [authGuard + onboardingGuard] Main app
  /dashboard                 # Business dashboard
  /products                  # Product list
  /products/new              # Create product
  /products/:id/edit         # Edit product
  /orders                    # Order list
  /orders/:id                # Order detail
  /inventory                 # Inventory management
  /payments                  # Payment management
  /deliveries                # Delivery management
  /customers                 # Customer list
  /customers/:id             # Customer detail
  /campaigns                 # Campaign list
  /campaigns/new             # Create campaign
  /campaigns/:id/edit        # Edit campaign
  /conversations             # WhatsApp inbox
  /workflow-builder          # Visual workflow builder
  /settings                  # Business settings (5 tabs)
  /settings/usage            # Usage & billing dashboard
  /settings/billing          # Wallet & payments
```

### Key Frontend Patterns

1. **Standalone Components**: No NgModules — every component is `standalone: true` with explicit imports
2. **Signal-Based State**: All reactive state uses Angular signals (`signal()`, `computed()`) instead of RxJS BehaviorSubjects
3. **inject() Pattern**: All dependency injection uses `inject()` function instead of constructor injection
4. **Session Auth**: No JWT — uses `withCredentials: true` for cookie-based sessions. `authInterceptor` handles 401 redirects
5. **Envelope Unwrap**: `apiResponseInterceptor` automatically extracts `.data` from `{ success, data }` responses
6. **Tenant Context**: `tenantInterceptor` injects `X-Tenant-ID` header from session; super-admin can impersonate via `setActiveTenantContext()`

---

## 8. Authentication & Authorization

### Auth Flow

```
[Browser]                    [NestJS API]                 [PostgreSQL]
    |                            |                            |
    |  POST /auth/login          |                            |
    |  {email, password}         |                            |
    |------------------------->  |                            |
    |                            |  1. Check super_admins     |
    |                            |------------------------->  |
    |                            |  2. If not admin, iterate  |
    |                            |     ALL tenant schemas     |
    |                            |     for email match        |
    |                            |------------------------->  |
    |                            |  3. bcrypt.compare()       |
    |                            |  4. Set session:           |
    |                            |     userId, userRole,      |
    |                            |     tenantId, schemaName   |
    |  Set-Cookie: sid=...       |                            |
    |<-------------------------  |                            |
    |                            |                            |
    |  GET /auth/me              |                            |
    |  Cookie: sid=...           |                            |
    |------------------------->  |                            |
    |                            |  Read session, load user   |
    |                            |  + tenant + subscription   |
    |  { user, tenant, sub }     |                            |
    |<-------------------------  |                            |
```

### Guard Chain

```
Request → RequestIdMiddleware → TenantResolutionMiddleware → RateLimitMiddleware
        → AuthGuard (@Public skips) → RolesGuard (@Roles) → SubscriptionGuard
        → Controller Method
```

### Roles

- **super_admin**: Platform administrator (separate login, admin portal)
- **owner**: Tenant owner (full access)
- **seller**: Tenant staff (limited: products, orders, inventory, conversations)
- **support**: Tenant support (conversations only)

---

## 9. Onboarding System (Complete Flow)

The onboarding system supports **two parallel paths** — Meta Embedded Signup (recommended) and Manual Number Registration.

### Path 1: Meta Embedded Signup (Recommended)

This is the fastest path. Uses Meta's Facebook Login popup to connect a WhatsApp Business number.

```
[Frontend]                              [Backend]                           [Meta API]
    |                                       |                                   |
    | 1. Click "Connect with Facebook"      |                                   |
    |-------------------------------------->|                                   |
    |   GET /onboarding/embedded-signup/config                                  |
    |<--------------------------------------| Return appId, configId, scopes    |
    |                                       |                                   |
    | 2. Load Facebook SDK                  |                                   |
    |   <script src="sdk.js">               |                                   |
    |   FB.init({appId, version})           |                                   |
    |                                       |                                   |
    | 3. FB.login() with params:            |                                   |
    |   config_id, response_type:'code',    |                                   |
    |   extras: {                           |                                   |
    |     feature: 'whatsapp_embedded_signup',                                  |
    |     sessionInfoVersion: 2             |                                   |
    |   }                                   |                                   |
    |                                       |                                   |
    | 4. User sees Meta popup:              |                                   |
    |   - Select/create Facebook Business   |                                   |
    |   - Select/create WABA                |                                   |
    |   - Select/register phone number      |                                   |
    |   - Grant permissions                 |                                   |
    |                                       |                                   |
    | 5. Meta returns auth code +           |                                   |
    |    sessionInfo (WABA ID, phone ID)    |                                   |
    |                                       |                                   |
    | 6. POST /embedded-signup/callback     |                                   |
    |   {code, sessionInfo}                 |                                   |
    |-------------------------------------->|                                   |
    |                                       | 7. Create EmbeddedSignupSession   |
    |                                       |    state: initiated               |
    |                                       |                                   |
    |                                       | 8. Exchange code for user token   |
    |                                       |---------------------------------->|
    |                                       |    POST /oauth/access_token       |
    |                                       |<----------------------------------| user_token
    |                                       |    state: token_exchanged         |
    |                                       |                                   |
    |                                       | 9. Exchange for long-lived token  |
    |                                       |---------------------------------->|
    |                                       |    grant_type=fb_exchange_token   |
    |                                       |<----------------------------------| 60-day token
    |                                       |                                   |
    |                                       | 10. Generate System User token    |
    |                                       |    (non-expiring, for API calls)  |
    |                                       |    - Assign WABA to system user   |
    |                                       |    - Generate system user token   |
    |                                       |    state: system_token_generated  |
    |                                       |                                   |
    |                                       | 11. Sync WABA from Meta           |
    |                                       |    GET /{wabaId}?fields=...       |
    |                                       |    → Create/update waba_accounts  |
    |                                       |    state: waba_synced             |
    |                                       |                                   |
    |                                       | 12. Sync phone numbers            |
    |                                       |    GET /{wabaId}/phone_numbers    |
    |                                       |    → Create/update phone_numbers  |
    |                                       |    → Assign first phone to tenant |
    |                                       |    state: phone_synced            |
    |                                       |                                   |
    |                                       | 13. Check coexistence eligibility |
    |                                       |    If WA Business App detected:   |
    |                                       |    → Create CoexistenceSession    |
    |                                       |    → isCoexistence = true         |
    |                                       |                                   |
    |                                       | 14. Subscribe webhooks            |
    |                                       |    POST /{wabaId}/subscribed_apps |
    |                                       |    → Create WebhookSubscription   |
    |                                       |    state: webhook_subscribed      |
    |                                       |                                   |
    |                                       | 15. Store encrypted token         |
    |                                       |    (AES-256-GCM in meta_tokens)   |
    |                                       |                                   |
    |                                       | 16. Update tenant record          |
    |                                       |    phoneNumberId, wabaId,         |
    |                                       |    onboardingStatus: connected    |
    |                                       |    state: completed               |
    |                                       |                                   |
    |   { success: true, phoneNumber,       |                                   |
    |     wabaId, isCoexistence }            |                                   |
    |<--------------------------------------|                                   |
    |                                       |                                   |
    | 17. Show success → Continue to        |                                   |
    |     Business Profile step             |                                   |
```

#### EmbeddedSignupSession States

```
initiated → code_received → token_exchanged → waba_synced → phone_synced
  → system_token_generated → webhook_subscribed → completed
  (any state can → failed or expired)
```

### Path 2: Manual Number Registration (Session-Based State Machine)

For users who can't or don't want to use Facebook Login.

```
[Frontend]                              [Backend]                           [Meta API]
    |                                       |                                   |
    | 1. Enter phone number                 |                                   |
    |   POST /onboarding/start              |                                   |
    |   { phone: "+919876543210" }          |                                   |
    |-------------------------------------->|                                   |
    |                                       | 2. Normalize phone, check for:    |
    |                                       |    - Already active on account    |
    |                                       |    - Assigned to another tenant   |
    |                                       |    - Existing pending sessions    |
    |                                       |                                   |
    |                                       | 3. Create OnboardingSession       |
    |                                       |    state: initiated               |
    |                                       |                                   |
    |                                       | 4. DETECT: Try registering on     |
    |                                       |    platform's WABA                |
    |                                       |    state: detecting               |
    |                                       |---------------------------------->|
    |                                       |    POST /{wabaId}/phone_numbers   |
    |                                       |<----------------------------------|
    |                                       |                                   |
    |                                       | 5. ROUTE based on result:         |
```

#### Detection Outcomes (5 cases)

**Case A: Fresh Number** (not on any WhatsApp)
```
    |                                       |    Meta returns success           |
    |                                       |    → Create phone_numbers record  |
    |                                       |    → Auto-request OTP via SMS     |
    |                                       |    state: otp_sent                |
    |   { state: 'otp_sent',               |                                   |
    |     message: 'Code sent via SMS' }    |                                   |
    |<--------------------------------------|                                   |
    |                                       |                                   |
    | 6a. Enter 6-digit code                |                                   |
    |   POST /session/{id}/verify-otp       |                                   |
    |   { code: "123456" }                  |                                   |
    |-------------------------------------->|                                   |
    |                                       |    POST /{phoneId}/verify_code    |
    |                                       |---------------------------------->|
    |                                       |<----------------------------------| verified
    |                                       |    state: otp_verified → active   |
    |                                       |    Update phone: active           |
    |                                       |    Update tenant: connected       |
    |   { verified: true, state: 'active' } |                                   |
    |<--------------------------------------|                                   |
```

**Case B: Regular WhatsApp User** (personal WA installed)
```
    |                                       |    Meta returns error:            |
    |                                       |    "number registered on WhatsApp"|
    |                                       |    state: needs_wa_removal        |
    |   { state: 'needs_wa_removal',        |                                   |
    |     migrationGuide: {                 |                                   |
    |       title: 'Remove WhatsApp',       |                                   |
    |       steps: [                        |                                   |
    |         'Open WhatsApp > Settings',   |                                   |
    |         'Account > Delete Account',   |                                   |
    |         'Wait 5 minutes',             |                                   |
    |         'Click Retry below'           |                                   |
    |       ],                              |                                   |
    |       estimatedTime: '10 minutes',    |                                   |
    |       warnings: ['Backup chats!'] }}  |                                   |
    |<--------------------------------------|                                   |
    |                                       |                                   |
    | User removes WA and clicks Retry      |                                   |
    |   POST /session/{id}/retry            |                                   |
    |-------------------------------------->|                                   |
    |                                       |    Re-detect → hopefully fresh    |
    |                                       |    state: retry_detecting → ...   |
```

**Case C: WA Business App User**
```
    |                                       |    Meta error: "business account" |
    |                                       |    state: needs_business_removal  |
    |   { migrationGuide: {                 |                                   |
    |     title: 'Remove WA Business',      |                                   |
    |     steps: ['Open WA Business >       |                                   |
    |       Settings > Account > Delete',   |                                   |
    |       'Wait 5 minutes', 'Retry'] }}   |                                   |
    |<--------------------------------------|                                   |
```

**Case D: Another BSP** (Wati, Gupshup, Interakt, Twilio, etc.)
```
    |                                       |    Meta error identifies BSP:     |
    |                                       |    "number owned by another BSP"  |
    |                                       |    Detected: 'wati', 'gupshup'...|
    |                                       |    state: needs_bsp_migration     |
    |   { migrationGuide: {                 |                                   |
    |     provider: 'WATI',                 |                                   |
    |     title: 'Migrate from WATI',       |                                   |
    |     steps: ['Login to WATI dashboard',|                                   |
    |       'Settings > Number Management', |                                   |
    |       'Request number release',       |                                   |
    |       'Wait 24-48 hours',             |                                   |
    |       'Click Retry below'],           |                                   |
    |     warnings: ['Templates will be     |                                   |
    |       lost', 'Conversations reset'],  |                                   |
    |     helpUrl: 'https://...',           |                                   |
    |     estimatedTime: '24-48 hours' }}   |                                   |
    |<--------------------------------------|                                   |
```

**Case E: Coexistence** (via Embedded Signup only — WA Business App stays active alongside Cloud API)
```
    Detected during Embedded Signup when sessionInfo indicates existing WA Business App.
    → Both WA Business App and Cloud API work simultaneously
    → Cloud API handles: utility, authentication, service messages
    → WA Business App handles: personal conversations
    → User can later "full migrate" to exclusive Cloud API
```

#### OnboardingSession States (17 total)

```
                           ┌─────────────┐
                           │  initiated   │
                           └──────┬───────┘
                                  │
                           ┌──────v───────┐
                           │  detecting   │
                           └──────┬───────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                    │
     ┌────────v───────┐  ┌───────v────────┐  ┌───────v──────────┐
     │  fresh_number   │  │ regular_wa_    │  │ other_bsp_       │
     │  (auto → OTP)   │  │ detected       │  │ detected         │
     └────────┬────────┘  └───────┬────────┘  └───────┬──────────┘
              │                   │                    │
              │           ┌───────v────────┐  ┌───────v──────────┐
              │           │ needs_wa_      │  │ needs_bsp_       │
              │           │ removal        │  │ migration        │
              │           └───────┬────────┘  └───────┬──────────┘
              │                   │                    │
              │           ┌───────v─────────────v──────┘
              │           │  waiting_user_action │
              │           └───────┬──────────────┘
              │                   │ User clicks "Retry"
              │           ┌───────v──────────┐
              │           │ retry_detecting  │────→ (back to detecting)
              │           └──────────────────┘
              │
     ┌────────v────────┐
     │    otp_sent     │
     └────────┬────────┘
              │ Enter code
     ┌────────v────────┐
     │   otp_verified  │
     └────────┬────────┘
              │
     ┌────────v────────┐
     │   registering   │
     └────────┬────────┘
              │
     ┌────────v────────┐
     │     active      │  ← SUCCESS
     └────────────────┘

     Any state can transition to:
     ┌─────────┐  ┌─────────┐
     │ failed  │  │ expired │
     └─────────┘  └─────────┘
```

### Frontend Onboarding Component (3-Step Wizard)

**Step 0 — Connect WhatsApp Number**

The user sees two options:
1. **"Connect with Facebook" button** (recommended) — launches Meta Embedded Signup popup
2. **"Register number manually"** link — shows phone input with country code dropdown

The component manages these signal states:
- `showManualRegistration` — toggles between Embedded Signup and manual mode
- `embeddedSignupLoading/Error/Result` — tracks Facebook OAuth flow
- `sessionId/sessionState/sessionResult/migrationGuide` — tracks manual onboarding state machine
- `loading` — global loading indicator
- `verificationCode` — OTP input

State-dependent UI:
- `detecting` / `retry_detecting` → spinner + "Checking number status..."
- `needs_bsp_migration` / `needs_business_removal` / `needs_wa_removal` → warning box + migration guide (steps, warnings, help URL) + "Retry" button
- `otp_sent` → code input (6-digit, centered) + Verify button + Resend via SMS/Voice links
- `active` → green success message
- `failed` → red error message

**Step 1 — Business Profile**

Form fields: Business Name (required), Business Category (dropdown, 15 options), Description, Address, Logo URL. Saved via `POST /onboarding/business-profile`.

**Step 2 — Complete**

Success screen with "Go to Dashboard" button. Calls `POST /onboarding/complete`.

### Onboarding Guard

The `onboardingGuard` runs on every main app route. It calls `GET /onboarding/status` and redirects to `/onboarding` if `currentStep !== 'completed'`. This ensures users can't access the main app until onboarding is done (or skipped).

---

## 10. WhatsApp Integration

### Webhook Processing Pipeline

```
Meta Cloud API → POST /webhook/whatsapp → WebhookSignatureGuard (HMAC-SHA256)
                                        → WebhookProcessorService

Processing steps for inbound messages:
1. Parse webhook payload (messages, statuses, errors)
2. Resolve tenant from phone_number_id → phone_numbers → tenant_id
3. Redis dedup check (message_id, 24h TTL)
4. Conversation metering (24h session, quota, cost)
5. Check workflow engine for active execution waiting for reply → RESUME
6. Check workflow trigger matcher for keyword match → START new execution
7. Fallback to hardcoded message handlers:
   - TextMessageHandler: keyword routing (hi/menu/cart/orders/help)
   - InteractiveMessageHandler: e-commerce flow (browse/add-to-cart/checkout)
   - MediaMessageHandler: payment proof upload
8. Update conversation.last_message_at
```

### Message Sending Pipeline

```
Service calls MessageOrchestrator.sendText/sendTemplate/etc.
    → Quota check (ConversationAccountingService)
    → Rate limit check (RateLimitService: 80/s, 1000/m, 10000/h)
    → Conversation metering (24h session creation/reuse)
    → Queue job to QUEUE_WHATSAPP_OUTBOUND
    → BullMQ processor (concurrency 10, rate 70/sec)
    → Meta Cloud API POST /{phoneNumberId}/messages
```

### Webhook Events Handled

| Event | Processing |
|-------|-----------|
| `messages` (text) | Tenant resolution → dedup → metering → workflow/handler |
| `messages` (interactive) | Button/list reply → workflow resume or interactive handler |
| `messages` (image/document) | Media download → payment proof check |
| `phone_number_quality_update` | Quality rating change → health monitor |
| `message_template_status_update` | Template approval/rejection → registry update |
| `account_update` | WABA account changes → account record update |
| `message.status` | Delivery status (sent/delivered/read/failed) → message update |

---

## 11. WABA Management & BSP Architecture

### Pool-Based WABA Allocation

```
WABA Pool:
  Starter Tier (TIER_1K):     up to 50 phone numbers per WABA
  Growth Tier (TIER_10K):     up to 100 phone numbers per WABA
  Enterprise Tier (TIER_100K): up to 200 phone numbers per WABA
  Unlimited Tier:             up to 500 phone numbers per WABA
  Quarantine Pool:            Isolated WABAs for high-risk tenants

Allocation strategy: Least-utilized WABA in the target tier
```

### Token Security

```
User provides phone → Platform registers on WABA → Meta returns phoneNumberId
Token flow:
  Short-lived user token (from Embedded Signup)
    → Long-lived token (60-day, via fb_exchange_token grant)
      → System User Token (non-expiring, via system user API)
        → AES-256-GCM encrypted at rest in meta_tokens table
```

### Risk Scoring

```
Composite Risk Score (0-100):
  Quality Signal:  25% weight  (from phone quality rating history)
  Abuse Signal:    25% weight  (spam reports, blocks, template rejections)
  Delivery Signal: 15% weight  (delivery rate, failure rate)
  Content Signal:  15% weight  (template rejection rate)
  Payment Signal:  10% weight  (payment failure rate)
  Volume Signal:   10% weight  (sudden spikes in messaging volume)

Risk Levels:
  0-30:   Low      (normal operation)
  31-60:  Medium   (increased monitoring)
  61-80:  High     (throttling applied)
  81-100: Critical (auto-quarantine to isolated WABA)
```

### Conversation Accounting

```
Mirrors Meta's 24-hour billing window model:
1. First message from business opens a 24-hour session
2. All messages within window count as ONE conversation
3. Cost = country-specific Meta rate + 15% platform markup

India pricing (INR):
  Marketing:       ₹0.7096
  Utility:         ₹0.3548
  Authentication:  ₹0.3075
  Service:         ₹0.3548

Quota enforcement:
  Soft limit (80%): Warning event
  Hard limit (100%): Block if allowExceed=false, charge overage if true
```

---

## 12. Workflow Engine

### Architecture

The workflow engine is a **state machine that walks a directed graph**. Each execution is bound to a customer phone. It persists position in `workflow_executions.current_node_id` so when the customer replies, the engine resumes from where it paused.

### Execution Loop

```
currentNodeId = firstNodeAfterTrigger
while (currentNodeId && steps < 50):
  node = findNode(currentNodeId)
  handler = handlerMap.get(node.type)
  update DB: current_node_id = currentNodeId
  result = handler.execute(node, context, outEdges)
  steps++
  switch result.action:
    'continue' → currentNodeId = result.nextNodeId
    'wait'     → pause execution, schedule timeout/delay job, RETURN
    'end'      → mark execution completed, RETURN
    'error'    → mark execution failed, RETURN
```

### Node Types (24)

| Category | Node | Behavior |
|----------|------|----------|
| **Trigger** | Message Received | Match keyword (exact/starts_with/contains) |
| | Order Event | Match order.created, order.status_changed |
| | Payment Event | Match payment.verified, payment.expired |
| | Scheduled | Cron-triggered |
| **Message** | Send Text | Send text → advance |
| | Send Buttons | Send 1-3 buttons → PAUSE for reply |
| | Send List | Send list menu → PAUSE for reply |
| | Send Image | Send image → advance |
| | Send Template | Send WhatsApp template → advance |
| **Commerce** | Show Catalog | Query products → send as list → PAUSE |
| | Add to Cart | Add product (transaction) → success/failure edge |
| | View Cart | Show cart summary → advance |
| | Checkout | Create order from cart (transaction) → success/failure |
| | Check Inventory | Check stock → in-stock/out-of-stock edge |
| | Search Products | Search by text → PAUSE |
| | Filter Products | Filter by category/price → advance |
| | Send Payment QR | Generate UPI QR → PAUSE for proof |
| **Logic** | Condition (If/Else) | Evaluate condition → Yes/No edge |
| | Switch (Router) | Multi-way branch by value → matching edge |
| | Wait for Reply | Explicit pause → PAUSE |
| **Action** | Tag Customer | Add/remove tags → advance |
| | Update Order | Change order status → advance |
| | Assign Agent | Hand off to human → advance |
| | HTTP Request | Call external API → success/failure |
| **Utility** | Delay | Schedule BullMQ job → PAUSE |
| | Set Language | Update language → advance |
| | End | Terminal node |

### Edge Routing

- **Single output nodes** (send_text, etc.): Follow the one outgoing edge
- **Button nodes**: Match `lastReply.actionTitle` against edge labels
- **List nodes**: Match `lastReply.actionTitle` against edge labels
- **Condition nodes**: Evaluate condition, follow "Yes" or "No" labeled edge
- **Switch nodes**: Match reply against edge labels, fall back to "default"
- **Commerce 2-output**: "Success" / "Failure" or "In Stock" / "Out of Stock"

### Concurrency Safety

- Redis lock per execution: `wf:exec:lock:{schema}:{executionId}` with 30s TTL
- Cancel stale timeout jobs when resuming from message
- MAX_STEPS=50 guard against infinite loops

### Frontend Workflow Builder

The visual builder has three panels:
1. **Left — Node Palette**: Searchable, draggable list of all 24 node types grouped by 6 categories
2. **Center — Canvas**: SVG-based infinite pan/zoom canvas with:
   - Grid dot pattern background
   - Bezier curve edges between nodes
   - Draggable node cards with input/output ports
   - Click-to-connect edge creation mode
   - Keyboard shortcuts (Delete, Escape)
3. **Right — Config Panel**: Dynamic form for selected node's configuration fields

Templates available: Order Flow (8 nodes), Support Flow (6 nodes), Sales Flow (7 nodes), Blank Canvas.

---

## 13. E-Commerce Engine

### WhatsApp Shopping Flow

```
Customer sends "hi" or "menu"
    → Main Menu (3 buttons: Browse Catalog, My Cart, My Orders)

Browse Catalog → Category list (interactive list message)
    → Select category → Product list (interactive list)
    → Select product → Product detail (text + "Add to Cart" button)
    → Add to Cart → Cart updated confirmation

My Cart → Cart summary with total
    → Checkout button → Address selection
    → Confirm Order → Order created
    → UPI QR code sent for payment
    → Customer sends payment screenshot
    → Admin verifies → Order confirmed

My Orders → Recent order list with status
```

### Order Lifecycle

```
pending → confirmed → shipped → in_transit → delivered
  │                                            │
  └─→ cancelled                                └─→ failed
```

### Inventory Management

- Stock tracking with `available = quantity - reserved`
- Pessimistic DB locks for stock operations
- 15-minute reservation TTL (BullMQ expiry jobs)
- Low stock alerts via `StockLowEvent`
- Variant-aware stock (size/color/etc.)

### Payment Flow

1. Order created → `pending` payment record
2. UPI QR code generated (with order amount)
3. QR sent to customer via WhatsApp
4. Customer pays and sends screenshot
5. `MediaMessageHandler` detects payment proof, uploads to S3
6. Admin verifies/rejects in Payments dashboard
7. On verify → `PaymentVerifiedEvent` → order confirmed

---

## 14. Billing & Payments

### Wallet System

```
Tenant Wallet:
  balance: current INR balance
  autoRecharge: boolean
  autoRechargeThreshold: ₹500 (trigger when balance drops below)
  autoRechargeAmount: ₹1000 (amount to recharge)
  lowBalanceAlertThreshold: ₹200

Debit per conversation:
  1. Check balance >= conversation cost
  2. If low → emit low_balance_alert
  3. If zero → check allowExceed on subscription
  4. Debit with pessimistic_write lock
  5. Record WalletTransaction (type: debit)
```

### Razorpay Integration

- Wallet top-ups: Quick amounts (₹100, ₹500, ₹1000, ₹2000, ₹5000) or custom
- Subscription orders: Monthly plan payments
- Webhook handling: `payment.captured`, `payment.failed`, `subscription.*`
- Signature verification: HMAC-SHA256 with Razorpay secret

### Frontend Billing Dashboard

- Wallet balance card with auto-recharge toggle
- Quick top-up buttons
- Transaction history table
- Razorpay checkout popup integration

---

## 15. Campaign & Broadcasting

### Campaign Types

- Template-based broadcast to segmented customers
- Segment rules: tags, minimum orders, minimum spend, language

### Sending Pipeline

```
1. Resolve segment → customer list
2. Split into batches of 50
3. Queue each batch to QUEUE_BROADCAST
4. BullMQ processor (concurrency 5):
   - For each recipient:
     - Send template via Meta API
     - 50ms delay between messages
     - Update campaign counters (sent/delivered/failed)
5. Emit CampaignCompletedEvent
```

### Frontend Campaign Builder (4 steps)

1. **Setup**: Name, type, description
2. **Audience**: Segment selection or custom rules (field/operator/value)
3. **Message**: Template or text, WhatsApp phone preview mockup
4. **Schedule**: Immediate or scheduled (date picker), review summary

---

## 16. Queue & Background Jobs

### BullMQ Queues (10)

| Queue | Purpose | Config |
|-------|---------|--------|
| `QUEUE_WHATSAPP_OUTBOUND` | Send WhatsApp messages | Rate: 70/sec, concurrency 10 |
| `QUEUE_BROADCAST` | Campaign broadcasting | Concurrency 5, batch size 50 |
| `QUEUE_RESERVATION_CLEANUP` | Expire stock reservations | 15-min delay per job |
| `QUEUE_MEDIA_PROCESSING` | Process uploaded media | Standard |
| `QUEUE_PAYMENT_EXPIRY` | Expire unpaid payments | Configurable delay |
| `QUEUE_WORKFLOW_RESUME` | Resume delayed workflows | Custom delays |
| `QUEUE_ONBOARDING` | Async onboarding tasks | Standard |
| `QUEUE_CONVERSATION_ACCOUNTING` | Async cost recording | Standard |
| `QUEUE_RISK_SCORING` | Background risk calculation | Standard |
| `QUEUE_BILLING` | Billing/invoice tasks | Standard |

### Cron Jobs

| Schedule | Service | Task |
|----------|---------|------|
| Every 5 minutes | MeteringCronService | Close expired conversation sessions |
| 1st of month, 00:00 IST | MeteringCronService | Reset monthly quotas |
| Daily midnight | WabaHealthMonitorService | Reset daily delivery counters |

---

## 17. Security Architecture

### API Security

| Layer | Mechanism |
|-------|-----------|
| Transport | HTTPS (production) |
| Headers | Helmet.js (CSP, HSTS, etc.) |
| CORS | Configurable origins |
| Auth | Express sessions + Redis (not JWT) |
| Rate Limiting | Redis sliding window (100 req/tenant/min) |
| Webhook Verification | HMAC-SHA256 timing-safe comparison |
| Idempotency | Redis-cached responses by X-Idempotency-Key |
| Input Validation | class-validator (whitelist + transform) |

### Data Security

| Data | Protection |
|------|-----------|
| Meta API tokens | AES-256-GCM encryption at rest |
| User passwords | bcrypt (12 rounds) |
| Tenant data | Schema-per-tenant isolation (PostgreSQL search_path) |
| Payment signatures | HMAC-SHA256 verification (Razorpay) |
| Session data | Redis with secure cookies (httpOnly, sameSite) |

### Multi-Tenant Isolation

- Each tenant has a dedicated PostgreSQL schema
- `TenantResolutionMiddleware` sets `request.tenantContext` from session
- `TenantConnectionManager` sets `search_path` per query
- Cross-tenant data access is architecturally impossible via normal API paths
- Phone numbers have unique constraint on `phoneNumberId` preventing double-assignment

---

## 18. API Reference

### Public Endpoints (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health check (DB + Redis) |
| GET | /webhook/whatsapp | Meta webhook verification |
| POST | /webhook/whatsapp | Meta webhook events |
| POST | /auth/login | Unified login (admin + tenant) |
| POST | /auth/signup | Self-service tenant registration |
| POST | /billing/webhook/razorpay | Razorpay webhook |

### Auth Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /auth/register | Add user to tenant |
| POST | /auth/logout | Destroy session |
| GET | /auth/me | Session rehydration |

### Onboarding Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /onboarding/status | Current onboarding step |
| POST | /onboarding/register-number | Legacy: register number |
| POST | /onboarding/request-code | Legacy: request OTP |
| POST | /onboarding/verify-code | Legacy: verify OTP |
| POST | /onboarding/business-profile | Save business profile |
| POST | /onboarding/complete | Mark onboarding done |
| POST | /onboarding/skip | Skip onboarding |
| POST | /onboarding/start | Session-based: start |
| GET | /onboarding/session/:id | Session status |
| GET | /onboarding/session | Latest session |
| POST | /onboarding/session/:id/retry | Retry detection |
| POST | /onboarding/session/:id/request-otp | Request OTP |
| POST | /onboarding/session/:id/verify-otp | Verify OTP |
| GET | /onboarding/embedded-signup/config | FB SDK config |
| POST | /onboarding/embedded-signup/callback | Process FB login |
| GET | /onboarding/embedded-signup/session/:id | Signup session |
| GET | /onboarding/embedded-signup/session | Latest signup session |
| GET | /onboarding/embedded-signup/coexistence | Coexistence session |
| GET | /onboarding/embedded-signup/coexistence/:id | Coexistence status |
| POST | /onboarding/embedded-signup/coexistence/:id/consent | Accept coexistence |
| POST | /onboarding/embedded-signup/coexistence/:id/migrate | Full migration |

### Tenant App Endpoints (require auth + tenant + subscription)

| Prefix | Endpoints |
|--------|-----------|
| /products | CRUD, archive, bulk update, image upload, catalog sync |
| /categories | CRUD |
| /orders | CRUD, status updates, stats, dashboard, chart data, CSV export |
| /cart | Get active, add/update/remove items, clear |
| /inventory | Get all, adjust stock, set stock, bulk adjust, movements, low stock |
| /payments | List, create, upload proof, verify, reject, dispute, summary |
| /deliveries | List, create, assign courier, status updates, proof upload, stats |
| /customers | List, detail, update, block/unblock, tags, orders, stats, export |
| /customers/segments | CRUD, preview, recalculate |
| /campaigns | List, create, stats, send, pause, resume, cancel, duplicate |
| /conversations | List, detail, assign, resolve, reopen, messages, send message |
| /workflows | CRUD, save definition, activate, pause, archive, duplicate, test, logs |
| /settings | Get/update settings, phone management, usage stats |
| /billing | Wallet, transactions, topup, subscribe, verify, payments |

### Super Admin Endpoints (/admin/*)

| Prefix | Endpoints |
|--------|-----------|
| /admin | Login, me, platform stats |
| /admin/tenants | CRUD, suspend, activate, usage |
| /admin/subscriptions | Plan CRUD, toggle active |
| /api/admin/waba | WABA CRUD, sync, phones, tokens, audit logs, pool, health, risk, usage, quota |

---

## 19. Environment Configuration

### Required Environment Variables

```bash
# App
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=whatsapp_commerce
DB_POOL_SIZE=50
DB_SYNCHRONIZE=false

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Meta WhatsApp
META_APP_ID=<facebook_app_id>
META_APP_SECRET=<facebook_app_secret>
META_GRAPH_API_VERSION=v21.0
META_EMBEDDED_SIGNUP_CONFIG_ID=<config_id>
META_SYSTEM_USER_ID=<system_user_id>       # Optional: for non-expiring tokens
META_SYSTEM_USER_TOKEN=<fallback_token>     # Fallback system token
WHATSAPP_VERIFY_TOKEN=<webhook_verify_token>

# Security
TOKEN_ENCRYPTION_KEY=<32-char-key>         # For AES-256-GCM token encryption
SESSION_SECRET=<session_secret>

# AWS S3
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
S3_BUCKET=whatsapp-commerce-media
CLOUDFRONT_DOMAIN=<cdn_domain>

# Razorpay
RAZORPAY_KEY_ID=<key_id>
RAZORPAY_KEY_SECRET=<key_secret>
RAZORPAY_WEBHOOK_SECRET=<webhook_secret>
```
