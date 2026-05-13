# Meta Commerce + WhatsApp Catalog Setup Guide

Complete step-by-step instructions for setting up Meta Commerce with shared WABA architecture and per-tenant catalog isolation.

---

## Architecture Overview

```
Your Meta Business Account
    |
    +-- Commerce Manager (commerce accounts + catalogs)
    |       |
    |       +-- Catalog A  -->  Tenant A  -->  Phone Number A
    |       +-- Catalog B  -->  Tenant B  -->  Phone Number B
    |       +-- Catalog C  -->  Tenant C  -->  Phone Number C
    |
    +-- Shared WABA (one WhatsApp Business Account)
            |
            +-- Phone Number A (Tenant A)
            +-- Phone Number B (Tenant B)
            +-- Phone Number C (Tenant C)
```

Key points:
- ONE Meta Business owns everything
- ONE WABA shared across all tenants
- ONE catalog per tenant (created under your Meta Business)
- Each phone number linked to its tenant's catalog
- Centralized billing (your Meta Business pays)

---

## Prerequisites

- Meta Business Account (verified preferred)
- WhatsApp Business API access
- System User with appropriate permissions
- Existing WABA with phone numbers onboarded

---

## Step 1: Meta Business Setup

If you don't already have a Meta Business Account:

1. Go to: **https://business.facebook.com/**
2. Click **"Create Account"**
3. Enter your business name, your name, and email
4. Verify your email
5. Complete business details

**Note your Business ID:**
1. Go to: **https://business.facebook.com/settings/**
2. Click **"Business Info"** in the left sidebar
3. Your **Business ID** is shown at the top (e.g., `123456789012345`)

---

## Step 2: Commerce Manager Setup

Commerce Manager is where catalogs live. You need a Commerce Account to manage catalogs.

### 2a. Access Commerce Manager

1. Go to: **https://business.facebook.com/commerce/**
2. Or from Business Settings: **All Tools** > **Commerce Manager**

### 2b. Create a Commerce Account (if none exists)

1. In Commerce Manager, click **"Get Started"**
2. Select **"Create a catalog"**
3. Choose catalog type: **"E-commerce"** (for product catalogs)
4. Select **"Upload product info"** (we'll manage via API)
5. Name your catalog (this is a default catalog; tenant catalogs will be created via API)
6. Assign to your **Meta Business Account**
7. Click **"Create"**

**Important:** You don't need to create catalogs manually for each tenant. The platform creates them automatically via the API when a tenant provisions their catalog.

---

## Step 3: System User Setup

System Users are non-human accounts that call Meta APIs on behalf of your business.

### 3a. Create System User

1. Go to: **https://business.facebook.com/settings/**
2. Left sidebar: **Users** > **System users**
3. Click **"Add"**
4. Name: `platform-commerce-bot` (or your preferred name)
5. Role: **Admin** (required for catalog creation)
6. Click **"Create system user"**

### 3b. Assign Assets to System User

You need to assign these assets to the system user:

#### Assign WABA:
1. On the System User page, click **"Add Assets"**
2. Select **"Apps"** tab, find your WhatsApp app
3. Toggle **"Full Control"** on
4. Click **"Save Changes"**

#### Assign Catalog Permissions:
1. Click **"Add Assets"** again
2. Select **"Catalogs"** tab
3. Select your default catalog (or all catalogs)
4. Toggle **"Full Control"** on
5. Click **"Save Changes"**

#### Assign Pages (if applicable):
1. Click **"Add Assets"** > **"Pages"** tab
2. Select your business page
3. Toggle permissions as needed

### 3c. Generate System User Token

1. On the System User page, click **"Generate New Token"**
2. Select your **WhatsApp App**
3. Select these permissions:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
   - `catalog_management`
   - `business_management`
4. Token expiration: **Never** (for production) or set a long expiry
5. Click **"Generate Token"**
6. **COPY AND SAVE THIS TOKEN IMMEDIATELY** - it won't be shown again

**Store this token as `META_SYSTEM_USER_TOKEN` in your `.env` file.**

---

## Step 4: Token Permissions Explained

| Permission | Purpose | Required For |
|---|---|---|
| `whatsapp_business_management` | Manage WABA, phone numbers, templates | All WhatsApp operations |
| `whatsapp_business_messaging` | Send/receive messages | Messaging |
| `catalog_management` | Create, edit, delete catalogs and products | Catalog CRUD |
| `business_management` | Access business assets and settings | Asset management |

### Verify Token Permissions

```bash
curl -X GET "https://graph.facebook.com/v21.0/debug_token?input_token=YOUR_TOKEN&access_token=YOUR_TOKEN"
```

Response should include all four permissions in the `scopes` array.

---

## Step 5: Catalog API Testing

### 5a. List Existing Catalogs

```bash
curl -X GET "https://graph.facebook.com/v21.0/{BUSINESS_ID}/owned_product_catalogs?access_token={TOKEN}"
```

### 5b. Create a New Catalog

```bash
curl -X POST "https://graph.facebook.com/v21.0/{BUSINESS_ID}/owned_product_catalogs" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Tenant Catalog", "access_token": "{TOKEN}"}'
```

Response: `{"id": "CATALOG_ID"}`

### 5c. Add Products to Catalog (Batch API)

```bash
curl -X POST "https://graph.facebook.com/v21.0/{CATALOG_ID}/batch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{
    "item_type": "PRODUCT_ITEM",
    "requests": [
      {
        "method": "UPDATE",
        "retailer_id": "product-slug-001",
        "data": {
          "name": "Test Product",
          "description": "A test product",
          "availability": "in stock",
          "price": "9999",
          "currency": "INR",
          "image_url": "https://example.com/image.jpg",
          "url": "https://example.com/product"
        }
      }
    ]
  }'
```

### 5d. Link Catalog to Phone Number

```bash
curl -X POST "https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/whatsapp_commerce_settings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{
    "is_catalog_visible": true,
    "is_cart_enabled": true,
    "catalog_id": "{CATALOG_ID}"
  }'
```

### 5e. Get Commerce Settings for Phone Number

```bash
curl -X GET "https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/whatsapp_commerce_settings?access_token={TOKEN}"
```

---

## Step 6: Product Message Testing

### 6a. Single Product Message

```bash
curl -X POST "https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "CUSTOMER_PHONE",
    "type": "interactive",
    "interactive": {
      "type": "product",
      "body": {"text": "Check out this product!"},
      "action": {
        "catalog_id": "{CATALOG_ID}",
        "product_retailer_id": "product-slug-001"
      }
    }
  }'
```

### 6b. Multi-Product Message

```bash
curl -X POST "https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "CUSTOMER_PHONE",
    "type": "interactive",
    "interactive": {
      "type": "product_list",
      "header": {"type": "text", "text": "Our Products"},
      "body": {"text": "Browse our selection"},
      "action": {
        "catalog_id": "{CATALOG_ID}",
        "sections": [
          {
            "title": "Featured",
            "product_items": [
              {"product_retailer_id": "product-slug-001"},
              {"product_retailer_id": "product-slug-002"}
            ]
          }
        ]
      }
    }
  }'
```

### 6c. Catalog Message (Opens Full Catalog)

```bash
curl -X POST "https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "CUSTOMER_PHONE",
    "type": "interactive",
    "interactive": {
      "type": "catalog_message",
      "body": {"text": "Browse our full catalog"},
      "action": {"name": "catalog_message"}
    }
  }'
```

---

## Step 7: Environment Variables

Add these to your `.env` file:

```env
# Meta Commerce Configuration
META_SYSTEM_USER_TOKEN=your_system_user_token_here
META_BUSINESS_ID=your_business_id_here

# These should already exist from WhatsApp setup:
WHATSAPP_API_URL=https://graph.facebook.com
WHATSAPP_API_VERSION=v21.0
WHATSAPP_APP_SECRET=your_app_secret
```

---

## Step 8: Platform Catalog Provisioning Flow

Once the setup is complete, the platform handles catalog management automatically:

### For New Tenants:

1. Tenant completes onboarding (Embedded Signup or Coexistence)
2. Phone number is registered under the shared WABA
3. Tenant navigates to **WhatsApp Catalog** in the dashboard
4. Clicks **"Provision Catalog"**
5. Platform creates a new Meta catalog via `POST /{business-id}/owned_product_catalogs`
6. Platform links catalog to phone via `POST /{phone-number-id}/whatsapp_commerce_settings`
7. Platform syncs all tenant products to the new catalog
8. Catalog is live on WhatsApp

### For Product Updates:

1. Tenant creates/updates/deletes a product
2. Platform queues a sync job (BullMQ `catalog-sync` queue)
3. Processor batches products (max 20 per batch) and sends to Meta
4. Per-product sync status tracked in `product_sync_status` table
5. Content hashing prevents re-syncing unchanged products

### Hourly Reconciliation:

1. Cron job runs every hour
2. Distributed lock prevents duplicate runs
3. Queues full sync for all active tenant catalogs
4. Reports sync results per tenant

---

## Step 9: API Endpoints Reference

### Catalog Lifecycle

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/commerce/catalog/status` | Get catalog status and diagnostics |
| POST | `/api/commerce/catalog/provision` | Provision a new catalog for tenant |
| POST | `/api/commerce/catalog/deprovision` | Delete catalog and unlink from phone |
| POST | `/api/commerce/catalog/visibility` | Toggle catalog/cart visibility |
| GET | `/api/commerce/catalog/history` | Get catalog assignment audit trail |

### Product Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/commerce/sync` | Trigger full or partial sync |
| GET | `/api/commerce/sync/:jobId` | Get sync job status |

### Collections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/commerce/collections` | List all collections |
| GET | `/api/commerce/collections/:id` | Get collection with products |
| POST | `/api/commerce/collections` | Create collection |
| PUT | `/api/commerce/collections/:id` | Update collection |
| DELETE | `/api/commerce/collections/:id` | Delete collection |
| POST | `/api/commerce/collections/:id/products` | Add products to collection |
| DELETE | `/api/commerce/collections/:id/products` | Remove products from collection |

### Product Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/commerce/messages/product` | Send single product message |
| POST | `/api/commerce/messages/multi-product` | Send multi-product message |
| POST | `/api/commerce/messages/catalog` | Send catalog browse message |

---

## Step 10: Meta Limitations and Considerations

### Catalog Limits
- **Max products per catalog:** 100,000 (standard), 1,000,000 (with approval)
- **Batch API limit:** 20 items per request
- **Rate limit:** 600 calls per 600 seconds per catalog
- **Image requirements:** JPEG/PNG, min 100x100px, max 8MB

### WhatsApp Commerce Limits
- **One catalog per phone number** at a time
- **Multi-product messages:** Max 30 products, max 10 sections
- **Section titles:** Max 24 characters
- **Product names:** Max 200 characters

### Important Meta Behaviors
- Catalog changes may take up to 10 minutes to appear on WhatsApp
- Deleting a product from catalog doesn't delete the product data
- Cart is session-based; it persists for 24 hours on the user's device
- Commerce settings require the catalog to be in "approved" state
- New catalogs may require review before they become visible

### Shared WABA Considerations
- Each phone number can only be linked to ONE catalog
- Catalogs are created under the Meta Business, not the WABA
- System User must have catalog_management permission for all catalogs
- Token must include both `whatsapp_business_management` AND `catalog_management` scopes

---

## Troubleshooting

### "catalog_management permission required"
- Go to Business Settings > System Users > Your System User
- Click "Add Assets" > "Catalogs" > toggle "Full Control"
- Regenerate the system user token with `catalog_management` scope

### "Catalog not visible on WhatsApp"
1. Verify catalog is linked: `GET /{phone-number-id}/whatsapp_commerce_settings`
2. Check `is_catalog_visible` is `true`
3. Ensure catalog has at least one approved product
4. Wait up to 10 minutes for propagation

### "Products not syncing"
1. Check sync job status in the dashboard
2. Verify product has required fields: name, description, price, image_url
3. Check Meta's product validation rules (price must be in cents, image must be a valid URL)
4. Review `product_sync_status` table for per-product errors

### "Rate limit exceeded"
- The platform implements exponential backoff with retry
- If persistent, reduce sync frequency in settings
- Contact Meta for higher rate limits if needed

### "Token expired"
- System User tokens can be set to never expire
- If using temporary tokens, rotate via Business Settings > System Users > Generate New Token
- Update `META_SYSTEM_USER_TOKEN` in your `.env` file
