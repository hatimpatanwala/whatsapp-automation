# WA Commerce - Complete Application Testing Guide

## Prerequisites

### Services Required
1. **Docker Desktop** - Must be running for PostgreSQL and Redis
2. **Node.js** v20+

### Start Infrastructure
```bash
cd D:\whatsapp-automation
docker compose up -d postgres redis
```

### Start Backend
```bash
cd D:\whatsapp-automation
npx tsc -p tsconfig.build.json --incremental false
node dist/main.js
# Backend runs on http://localhost:3001
```

### Start Tailwind CSS Watcher
```bash
cd D:\whatsapp-automation\frontend
npx @tailwindcss/cli -i src/tailwind-input.css -o src/tailwind-generated.css --watch
```

### Start Frontend
```bash
cd D:\whatsapp-automation\frontend
npx ng serve --port 4600
# Frontend runs on http://localhost:4600
```

---

## Test Credentials

| Role | Login Type | Credentials |
|------|-----------|-------------|
| **Super Admin** | Email/Password | `admin@whatsapp-commerce.com` / `admin123456` |
| **Tenant Owner** | Slug + Phone + Password | Slug: `demo-store`, Phone: `+919999999999`, Password: `demo123456` |

---

## Test Scenarios

### 1. Login Page (`/auth/login`)

#### 1.1 Visual Check
- [ ] Split-screen layout: green gradient left panel, white card right panel
- [ ] Left panel shows WA Commerce branding with 4 feature cards
- [ ] Right panel has "Welcome back" heading and tab selector
- [ ] Two tabs: "Store Login" (default) and "Super Admin"
- [ ] Pre-filled demo credentials in both forms

#### 1.2 Store Login Tab
- [ ] Shows fields: Store slug (with @ prefix), Phone number, Password
- [ ] "Sign in" button with green color
- [ ] Credentials pre-filled: `demo-store`, `+919999999999`, `demo123456`
- [ ] Click "Sign in" -> redirects to `/onboarding` or `/dashboard`

#### 1.3 Super Admin Tab
- [ ] Click "Super Admin" tab -> shows Email and Password fields
- [ ] "Sign in as Admin" button with orange/warning color
- [ ] Credentials pre-filled: `admin@whatsapp-commerce.com`, `admin123456`
- [ ] Click "Sign in as Admin" -> redirects to `/admin/dashboard`

#### 1.4 Error Handling
- [ ] Invalid credentials show error message
- [ ] Form validation prevents submission with empty fields

---

### 2. Super Admin Portal (`/admin/*`)

#### 2.1 Admin Layout
- [ ] Dark sidebar (gray-950) with WA Commerce logo
- [ ] Sidebar nav: Dashboard, Tenants, Subscription Plans, Billing
- [ ] Top bar: "ADMIN PORTAL" label, "Back to Platform" link, notifications bell
- [ ] User info at bottom: avatar, name, email, logout button
- [ ] Active nav item highlighted

#### 2.2 Platform Dashboard (`/admin/dashboard`)
- [ ] Page title: "Platform Dashboard"
- [ ] 4 stat cards: Total Tenants (47), Active Subscriptions (42), Platform MRR ($8,940), Total Conversations (124,820)
- [ ] Each card has icon, value, subtitle, trend percentage
- [ ] Revenue bar chart (Last 30 days)
- [ ] Scrollable content area

#### 2.3 Tenants (`/admin/tenants`)
- [ ] Status summary cards: Active (38), Trialing (4), Suspended (3), Pending (2)
- [ ] Search bar, Status filter dropdown, Plan filter dropdown
- [ ] Data table with columns: Tenant, Owner, Plan, Status, Conversations, MRR, Joined, Actions
- [ ] Plan badges (Starter, Growth, Professional, Enterprise)
- [ ] Status badges (Active, Trialing, Suspended, Pending)
- [ ] Action buttons: Edit, Suspend/Activate, View
- [ ] Pagination at bottom

#### 2.4 Subscription Plans (`/admin/subscriptions`)
- [ ] "New Plan" button in header
- [ ] 4 plan cards in 2-column grid: Starter ($49), Growth ($190), Professional ($390), Enterprise ($790)
- [ ] Each card shows: name, description, price, yearly price, per-conversation cost
- [ ] Feature limits: Conversations/mo, Products, Campaigns/mo, Team Members
- [ ] Feature badges (Workflow Builder, AI Features, Advanced Analytics)
- [ ] Tenant count per plan
- [ ] Edit and visibility toggle buttons
- [ ] "Most Popular" badge on Growth plan

#### 2.5 Billing (`/admin/billing`)
- [ ] Billing management page loads without errors

---

### 3. Tenant Portal (Store Login)

#### 3.1 Onboarding (`/onboarding`)
- [ ] Welcome header with WhatsApp icon
- [ ] 4-step wizard: Phone Number, WhatsApp Business, Business Profile, Complete
- [ ] Step 1: Phone number input with country code selector (IN +91 default)
- [ ] Important Note info box
- [ ] "Skip for Now" button -> navigates to `/dashboard`
- [ ] "Verify Number" button (disabled until valid number entered)

#### 3.2 Main Layout
- [ ] White sidebar with WA Commerce logo and store name
- [ ] Navigation items: Dashboard, Products, Orders, Inventory, Payments, Deliveries, Customers, Campaigns, Conversations, Workflow Builder, Settings
- [ ] Badge counts on Payments (5) and Conversations (12)
- [ ] Top header: hamburger menu, page title, notifications (3), settings, avatar
- [ ] User profile at sidebar bottom: avatar initials, name, role, sign out button
- [ ] Sidebar collapse/expand with smooth transition
- [ ] Active nav item highlighted with primary color

#### 3.3 Dashboard (`/dashboard`)
- [ ] Page heading with "Export" and "New Order" action buttons
- [ ] 4 stat cards: Total Revenue (N2,847,500), Orders Today (47), Pending Payments (N384,200), Active Customers (1,284)
- [ ] Each card has colored icon, value, trend indicator with color coding (green up, red down)
- [ ] Revenue Overview chart with 7D/30D toggle, dual-axis (Revenue + Orders)
- [ ] Low Stock Alerts panel with 4 items, SKU codes, stock/threshold
- [ ] Recent Orders table: Order ID, Customer, Amount, Status badges, Date, action button
- [ ] Status badges color-coded: confirmed (blue), pending (yellow), completed (green), canceled (red)

#### 3.4 Products (`/products`)
- [ ] "Add Product" button in header
- [ ] Search bar, Status filter, Category filter, Reset button
- [ ] Product table with image thumbnails, name, SKU, Category, Price, Stock, Status, Actions
- [ ] Stock numbers color-coded (red for low stock)
- [ ] Status badges: Active (green), Draft (gray), Out_of_stock (red)
- [ ] Edit and delete action buttons

#### 3.5 Orders (`/orders`)
- [ ] Status summary cards: Pending (18), Processing (9), Completed Today (24), Cancelled (3)
- [ ] Search bar, Status filter, Payment filter, Reset button
- [ ] Export button
- [ ] Orders table: Order ID, Customer (name + phone), Items, Total, Status, Payment, Date, Actions
- [ ] Color-coded status and payment badges
- [ ] View and WhatsApp message action buttons

#### 3.6 Inventory (`/inventory`)
- [ ] Summary cards: Total SKUs (10), Low Stock (4), Out of Stock (1), Total Units (111)
- [ ] "Export" and "Stock Movement" buttons
- [ ] Search bar, Stock Level filter, "Low Stock Only" toggle
- [ ] Table: Product (name + SKU), Current Stock, Reserved, Available, Threshold, Status, Location, Actions
- [ ] Low stock rows highlighted
- [ ] Status badges: In Stock, Low Stock (orange), Out of Stock (red)

#### 3.7 Payments (`/payments`)
- [ ] Summary cards: Pending Verification (3), Verified Today (2), Rejected (1)
- [ ] Search bar, Status filter, Method filter
- [ ] Table: Order, Customer, Amount, Method, Reference, Proof, Status, Submitted, Actions
- [ ] "View Proof" links with image icon
- [ ] Approve (checkmark) and Reject (X) action buttons for pending items
- [ ] Status badges: Pending (orange), Verified (green), Rejected (red)

#### 3.8 Deliveries (`/deliveries`)
- [ ] Summary cards with 6 statuses: Pending (6), Assigned (4), Picked Up (3), In Transit (8), Delivered (31), Failed (2)
- [ ] Search bar, Status filter, Export button
- [ ] Table: Order, Customer & Address, Courier (name + phone), Tracking #, Est. Delivery, Status, Actions
- [ ] Color-coded delivery status badges
- [ ] Assign courier and refresh action buttons

#### 3.9 Customers (`/customers`)
- [ ] Total count header, Export and Import buttons
- [ ] Search bar, Status filter, Reset button
- [ ] Table: Customer (avatar + name + join date), Contact (phone + email), Tags, Orders, Total Spent, Status, Last Order, Actions
- [ ] Tag badges (VIP, loyal, new, at-risk, fashion, accessories, etc.)
- [ ] View and WhatsApp message action buttons

#### 3.10 Campaigns (`/campaigns`)
- [ ] Summary cards: Total Campaigns (12), Running (2), Avg Delivery Rate (94%), Avg Read Rate (67%)
- [ ] "New Campaign" button
- [ ] Search bar, Status filter, Type filter
- [ ] Campaign cards with: name, status badge, type, recipient count, date
- [ ] Metrics: Sent, Delivered %, Read Rate %, Replies
- [ ] Progress bars for delivery and read rates
- [ ] Pause/Resume, Edit, Duplicate action buttons

#### 3.11 Conversations (`/conversations`)
- [ ] WhatsApp-style split layout: conversation list (left) + chat area (right)
- [ ] Conversation list with search, filter tabs (All, Open, Pending, Resolved)
- [ ] Each conversation: avatar initials, customer name, last message preview, timestamp, status badge, unread count
- [ ] Online indicator (green dot)
- [ ] Empty state when no conversation selected: WhatsApp icon + "Select a conversation"

#### 3.12 Workflow Builder (`/workflow-builder`)
- [ ] "New Workflow" button
- [ ] Workflow cards in 2-column grid
- [ ] Each card: name, description, status badge (Active/Paused/Draft), node count, run count, last modified
- [ ] Pause/Activate, Edit, Delete action buttons

#### 3.13 Settings (`/settings`)
- [ ] Business settings: Currency (Nigerian Naira), Timezone (Africa/Lagos), Order Prefix
- [ ] Notification Email field
- [ ] Business Hours: day-by-day toggle with open/close time selectors
- [ ] Sunday shown as "Closed"
- [ ] "Save Business Settings" button

---

### 4. Cross-Cutting Tests

#### 4.1 Responsive Design
- [ ] Sidebar collapses on mobile
- [ ] Login page hides left panel on mobile
- [ ] Tables scroll horizontally on small screens

#### 4.2 Navigation
- [ ] All sidebar links navigate to correct pages
- [ ] Active route highlighting works
- [ ] Browser back/forward navigation works
- [ ] Direct URL navigation works (e.g., typing `/orders` directly)

#### 4.3 Authentication
- [ ] Unauthenticated users redirected to `/auth/login`
- [ ] Admin guard protects `/admin/*` routes
- [ ] Session persists across page refreshes
- [ ] Logout clears session and redirects to login

#### 4.4 CORS & API
- [ ] Backend CORS allows `http://localhost:4600`
- [ ] Session cookies sent with `credentials: include`
- [ ] API responses unwrapped from `{ success, data }` envelope

---

## Screenshots Directory

All test screenshots are saved in `frontend/screenshots/`:

| File | Page |
|------|------|
| `login-with-tailwind.png` | Login page (Store tab) |
| `login-admin-tab.png` | Login page (Admin tab) |
| `admin-dashboard-styled.png` | Super Admin Dashboard |
| `admin-subscriptions.png` | Subscription Plans |
| `onboarding.png` | Tenant Onboarding |
| `tenant-dashboard.png` | Tenant Dashboard |
| `products.png` | Products |
| `orders.png` | Orders |
| `inventory.png` | Inventory |
| `payments.png` | Payments |
| `deliveries.png` | Deliveries |
| `customers.png` | Customers |
| `campaigns.png` | Campaigns |
| `conversations.png` | Conversations |
| `workflow-builder.png` | Workflow Builder |
| `settings.png` | Settings |

---

## Known Configuration Notes

- **Tailwind CSS v4**: Uses `@tailwindcss/cli` to generate CSS (Angular 21's Vite builder doesn't support PostCSS for Tailwind). Run the CLI watcher alongside the Angular dev server.
- **CORS**: Backend `.env` must have `CORS_ORIGIN=http://localhost:4600`
- **Session**: Uses `connect-redis` v7 (not v9) for ioredis compatibility
- **TypeScript Build**: If `dist/main.js` is stale, delete `tsconfig.build.tsbuildinfo` and rebuild with `--incremental false`
