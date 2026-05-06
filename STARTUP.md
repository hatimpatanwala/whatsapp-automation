# WhatsApp Commerce Platform - Startup Guide

## Prerequisites

- **Node.js** v20+ (recommended v20.19+)
- **Docker Desktop** (for PostgreSQL, Redis, PgAdmin)
- **npm** (comes with Node.js)

## Quick Start (3 steps)

### Step 1: Start Infrastructure Services

```bash
docker-compose up -d
```

This starts:

| Service      | Container     | Port  | Purpose                  |
|-------------|---------------|-------|--------------------------|
| PostgreSQL  | wa-postgres   | 5432  | Database                 |
| Redis       | wa-redis      | 6379  | Sessions, cache, queues  |
| PgAdmin     | wa-pgadmin    | 5050  | Database admin UI        |

Wait for health checks to pass:

```bash
docker-compose ps
```

All services should show `healthy` or `running`.

### Step 2: Start Backend

```bash
# Install dependencies (first time only)
npm install

# Start in development mode (hot reload)
npm run start:dev
```

Backend will be available at **http://localhost:3000**

Verify health:
```bash
curl http://localhost:3000/health
```

### Step 3: Start Frontend

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start Angular dev server
npx ng serve
```

Frontend will be available at **http://localhost:4200**

---

## Initial Setup

### Seed Super Admin

```bash
npm run seed:admin
```

**Default super admin credentials:**

| Field    | Value                          |
|----------|--------------------------------|
| Email    | `admin@whatsapp-commerce.com`  |
| Password | `admin123456`                  |

Custom credentials:
```bash
npx ts-node --files -r tsconfig-paths/register scripts/seed-super-admin.ts your@email.com yourpassword
```

### Create a Tenant (Store)

```bash
npx ts-node --files -r tsconfig-paths/register scripts/create-tenant.ts \
  --name "My Store" \
  --slug my-store \
  --owner-phone "+919999999999" \
  --owner-password "password123"
```

**Demo tenant credentials (if you ran the command above):**

| Field    | Value             |
|----------|-------------------|
| Phone    | `+919999999999`   |
| Password | `password123`     |

---

## API Endpoints

### Super Admin

| Method | Endpoint                       | Description              |
|--------|--------------------------------|--------------------------|
| POST   | `/api/admin/auth/login`        | Super admin login        |
| GET    | `/api/admin/stats`             | Platform stats           |
| GET    | `/api/admin/tenants/:id/usage` | Tenant usage stats       |
| PUT    | `/api/admin/subscriptions/:id` | Update subscription      |

### Tenant Auth

All tenant endpoints require the `x-tenant-slug` header.

| Method | Endpoint            | Description         |
|--------|---------------------|---------------------|
| POST   | `/api/auth/login`   | Tenant user login   |
| POST   | `/api/auth/register`| Register new user   |
| POST   | `/api/auth/logout`  | Logout              |
| GET    | `/api/auth/me`      | Current user + tenant info |

### Onboarding

| Method | Endpoint                           | Description                      |
|--------|------------------------------------|----------------------------------|
| GET    | `/api/onboarding/status`           | Get onboarding status            |
| POST   | `/api/onboarding/check-phone`      | Validate phone number            |
| POST   | `/api/onboarding/connect-whatsapp` | Connect WhatsApp Business API    |
| POST   | `/api/onboarding/business-profile` | Save business profile            |
| POST   | `/api/onboarding/complete`         | Complete onboarding              |
| POST   | `/api/onboarding/skip`             | Skip onboarding                  |
| GET    | `/api/onboarding/setup-guide`      | Get WhatsApp setup instructions  |

### Other Modules

| Module        | Base Path              | Key Operations                   |
|---------------|------------------------|----------------------------------|
| Catalog       | `/api/categories`, `/api/products` | CRUD for categories & products |
| Inventory     | `/api/inventory`       | Stock management                 |
| Customers     | `/api/customers`       | Customer list, tags              |
| Orders        | `/api/orders`, `/api/cart` | Cart, checkout, order management |
| Payments      | `/api/payments`        | Payment verification             |
| Delivery      | `/api/deliveries`      | Delivery tracking                |
| Campaigns     | `/api/campaigns`       | Broadcast campaigns              |
| Conversations | `/api/conversations`   | WhatsApp conversation threads    |
| Workflows     | `/api/workflows`       | Visual workflow automation       |
| Media         | `/api/media`           | S3 presigned URL upload          |
| WhatsApp      | `/api/webhook/whatsapp`| Webhook receive/verify           |

---

## Access Points

| Service           | URL                          | Credentials                              |
|-------------------|------------------------------|------------------------------------------|
| Frontend          | http://localhost:4200        | Tenant login (phone + password)          |
| Backend API       | http://localhost:3000/api    | Session-based auth                       |
| Health Check      | http://localhost:3000/health | No auth required                         |
| PgAdmin           | http://localhost:5050        | Email: `admin@admin.com` / Pass: `admin` |
| Super Admin Login | POST `/api/admin/auth/login` | Email: `admin@whatsapp-commerce.com` / Pass: `admin123456` |

### PgAdmin Database Connection

When connecting to the database from PgAdmin:

| Field    | Value              |
|----------|--------------------|
| Host     | `postgres` (Docker network) or `host.docker.internal` |
| Port     | `5432`             |
| Database | `whatsapp_commerce`|
| Username | `postgres`         |
| Password | `postgres`         |

---

## Environment Configuration

All configuration is in the `.env` file at the project root. Key settings:

| Variable          | Default             | Description                    |
|-------------------|---------------------|--------------------------------|
| `PORT`            | `3000`              | Backend port                   |
| `DB_SYNCHRONIZE`  | `true`              | Auto-create tables (dev only!) |
| `SESSION_SECRET`  | dev key             | Change in production           |
| `CORS_ORIGIN`     | `http://localhost:4200` | Frontend origin            |

---

## Stopping Services

```bash
# Stop Docker services (preserves data)
docker-compose stop

# Stop and remove containers + data
docker-compose down -v
```

Backend and frontend: `Ctrl+C` in their respective terminals.

---

## Troubleshooting

| Problem                        | Solution                                         |
|-------------------------------|--------------------------------------------------|
| Port 5432 already in use      | Stop local PostgreSQL or change `DB_PORT` in `.env` |
| Port 3000 already in use      | `taskkill /F /PID <pid>` or change `PORT` in `.env` |
| Redis connection refused      | Ensure `docker-compose up -d` ran successfully   |
| `Cannot find module` errors   | Run `npm install` in both root and `frontend/`   |
| TypeORM sync issues           | Set `DB_SYNCHRONIZE=true` in `.env` for dev      |
| Frontend can't reach backend  | Check CORS_ORIGIN matches frontend URL           |
