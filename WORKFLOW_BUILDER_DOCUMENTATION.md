# Workflow Builder — Complete Documentation

> A visual drag-and-drop automation engine for WhatsApp commerce. Build customer journeys, automate order processing, route support requests, and create sales funnels — all without writing code.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & How It Works](#2-architecture--how-it-works)
3. [The Visual Builder UI](#3-the-visual-builder-ui)
4. [Node Palette — Complete Reference](#4-node-palette--complete-reference)
   - [Trigger Nodes](#41-trigger-nodes)
   - [Message Nodes](#42-message-nodes)
   - [Commerce Nodes](#43-commerce-nodes)
   - [Logic Nodes](#44-logic-nodes)
   - [Action Nodes](#45-action-nodes)
   - [Utility Nodes](#46-utility-nodes)
5. [Edge Routing & Connections](#5-edge-routing--connections)
6. [Template Variables & Dynamic Content](#6-template-variables--dynamic-content)
7. [Execution Context & Variables](#7-execution-context--variables)
8. [Workflow Lifecycle](#8-workflow-lifecycle)
9. [Default Templates](#9-default-templates)
10. [Business Template Library](#10-business-template-library)
11. [API Reference](#11-api-reference)
12. [Safety Guards & Limits](#12-safety-guards--limits)
13. [Best Practices](#13-best-practices)

---

## 1. Overview

The Workflow Builder is the automation engine at the heart of the WhatsApp Commerce platform. It lets tenant owners and sellers create automated customer journeys using a **visual drag-and-drop interface** with **27 node types** across **6 categories**.

### What You Can Automate

| Use Case | Example |
|----------|---------|
| Welcome & Onboarding | Greet new customers, offer product catalog, set language preference |
| Product Discovery | Browse catalog, search products, show recommendations |
| Order Processing | Confirm orders, send payment QR, track delivery status |
| Payment Collection | Generate UPI QR codes, send payment reminders, verify payments |
| Customer Support | Route queries, escalate to agents, resolve common issues |
| Marketing & Re-engagement | Tag customers, send promotional templates, follow up on abandoned carts |
| Feedback & Reviews | Ask for feedback after delivery, tag satisfied/unsatisfied customers |
| Business Hours Routing | Send different responses based on time of day |

### Key Capabilities

- **27 node types** in 6 categories (Triggers, Messages, Commerce, Logic, Actions, Utility)
- **Visual drag-and-drop canvas** with infinite pan/zoom
- **Conditional branching** (if/else, switch/router, multi-path)
- **State persistence** — workflow execution survives server restarts
- **Event-driven triggers** — message keywords, order events, payment events, schedules
- **Template variables** — dynamic `{{customer_name}}`, `{{order_number}}`, etc.
- **Undo/redo** support in the editor
- **Pre-built templates** — Order Flow, Support Flow, Sales Flow, and more

---

## 2. Architecture & How It Works

### The Execution Engine

The workflow engine is a **state machine that walks a directed graph** of nodes connected by edges.

```
┌────────────────────────────────────────────────────────────────────┐
│                     WORKFLOW EXECUTION ENGINE                      │
│                                                                    │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐     │
│  │ Trigger   │───>│ Run Loop     │───>│ Node Handler         │     │
│  │ Matcher   │    │ (max 50      │    │ (23 handler types)   │     │
│  └──────────┘    │  steps)       │    └──────────────────────┘     │
│       │          └──────────────┘              │                   │
│       │               │                       │                   │
│       │          ┌────v─────┐          ┌──────v──────────┐        │
│       │          │ Continue │          │ Wait (pause)    │        │
│       │          │ to next  │          │ Save state      │        │
│       │          │ node     │          │ Schedule resume │        │
│       │          └──────────┘          └─────────────────┘        │
│       │                                       │                   │
│       │                                ┌──────v──────────┐        │
│       │                                │ Resume from     │        │
│       │                                │ customer reply  │        │
│       │                                │ or delay/timeout│        │
│       │                                └─────────────────┘        │
│       │                                                           │
│  ┌────v────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL                               │   │
│  │  workflow_executions: status, current_node_id, variables,  │   │
│  │                       wait_type, wait_config, resume_job_id│   │
│  └────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### How a Workflow Runs

**1. Triggering:**
- A customer sends a WhatsApp message (e.g., "hi")
- The `WorkflowTriggerMatcher` checks all active workflows for keyword matches
- If matched, `WorkflowExecutionEngine.startExecution()` creates a new execution record
- Domain events (order created, payment verified, etc.) can also trigger workflows via `WorkflowEventListener`

**2. The Run Loop:**
```
currentNode = first node after trigger
stepsExecuted = 0

while (currentNode exists AND stepsExecuted < 50):
    handler = handlerMap.get(node.type)
    result = handler.execute(node, context, outEdges)
    stepsExecuted++

    switch (result.action):
      'continue' → move to result.nextNodeId
      'wait'     → save execution state to DB, schedule timeout → RETURN (paused)
      'end'      → mark execution completed → RETURN
      'error'    → mark execution failed → RETURN

if stepsExecuted >= 50 → fail with "Max steps exceeded"
if no more nodes      → complete (natural end)
```

**3. Pausing & Resuming:**
- When a node needs customer input (buttons, list selection, payment proof), the engine **pauses**
- The current node ID, all variables, and wait configuration are saved to `workflow_executions`
- When the customer replies, the webhook processor finds the active execution and calls `resumeExecution()`
- The engine reconstructs the context, routes the reply to the correct next node, and continues the loop

**4. Edge Routing on Resume:**
- **Button nodes**: Match `lastReply.actionTitle` against edge labels
- **List nodes**: Match `lastReply.actionTitle` against edge labels, extract product/category IDs
- **Button maps**: Some nodes (send_buttons, view_cart) store a `_buttonMap` in variables mapping button IDs to target node IDs
- **Condition nodes**: Follow "Yes" or "No" labeled edge
- **Switch nodes**: Match reply against multiple edge labels, with fallback to unlabeled default edge
- **Single-output nodes**: Follow the one outgoing edge
- **Commerce 2-output nodes**: Follow "Success"/"Failure" or "In Stock"/"Out of Stock" edges

### Trigger Matching

The `WorkflowTriggerMatcher` loads all active workflows for a tenant (cached in Redis for 60 seconds) and checks each workflow's trigger node:

| Match Type | Behavior | Example |
|-----------|----------|---------|
| `contains` | Message text contains the keyword anywhere | "hi there" matches keyword "hi" |
| `exact` | Message text is exactly the keyword | Only "hi" matches keyword "hi" |
| `starts_with` | Message text starts with the keyword | "hi there" matches, "say hi" does not |

Multiple keywords can be specified (comma-separated). The first matching workflow wins.

### Event Triggers

The `WorkflowEventListener` listens for domain events and starts workflows with matching event trigger nodes:

| Event | Trigger Type | Event Values |
|-------|-------------|-------------|
| `order.created` | `trigger_order` | `created` |
| `order.status_changed` | `trigger_order` | `confirmed`, `delivered`, `cancelled` |
| `payment.verified` | `trigger_payment` | `verified` |
| `payment.expired` | `trigger_payment` | `expired` |

---

## 3. The Visual Builder UI

### Three-Panel Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar: [← Back] [Workflow Name] [Status Tag] [Undo][Redo][Save] │
├─────────┬────────────────────────────────────┬─────────────────┤
│         │                                    │                 │
│  Node   │          Canvas                    │  Config         │
│  Palette│  (SVG-based infinite pan/zoom)     │  Panel          │
│         │                                    │                 │
│  Search │  ┌─────┐       ┌─────┐            │  Selected       │
│  ──────│  │Trigger│──────│Send │            │  node's         │
│         │  │ Node ├──────│Text │            │  settings       │
│  Triggers│  └─────┘       └──┬──┘            │                 │
│  Messages│                    │               │  Type, label,   │
│  Commerce│              ┌─────v─────┐         │  description,   │
│  Logic   │              │  Buttons  │         │  config fields  │
│  Actions │              └───────────┘         │                 │
│  Utility │                                    │  [Delete]       │
│         │                                    │  [Duplicate]    │
│  56px   │         Flexible width             │  72px (288px)   │
│  (224px)│                                    │                 │
└─────────┴────────────────────────────────────┴─────────────────┘
```

### Workflow List View

Before opening the editor, users see a card grid of all their workflows showing:
- Workflow name and description
- Status badge (Draft / Active / Paused / Archived)
- Node count and execution count
- Last updated timestamp
- Quick action buttons: Activate/Pause, Edit, Delete

### Creating a New Workflow

1. Click "New Workflow"
2. Enter a name and optional description
3. Choose a template: **Order Flow**, **Support Flow**, **Sales Flow**, or **Blank Canvas**
4. Click "Create Workflow" — opens the editor with pre-built nodes if a template was selected

### Editor Features

| Feature | How It Works |
|---------|-------------|
| **Drag nodes from palette** | Drag a node type from the left panel and drop it on the canvas |
| **Connect nodes** | Click a node's output port, then click another node's input port to create an edge |
| **Move nodes** | Drag nodes anywhere on the canvas |
| **Select & configure** | Click a node to open its configuration panel on the right |
| **Delete nodes** | Select a node, click Delete in config panel (or press Delete key) |
| **Delete edges** | Click an edge to select it, then delete |
| **Duplicate nodes** | Select a node, click Duplicate in config panel |
| **Undo/Redo** | Click toolbar buttons or use keyboard shortcuts |
| **Pan & Zoom** | Scroll to zoom, drag canvas background to pan |
| **Save** | Click Save to persist nodes and edges to the backend |
| **Rename** | Click the workflow name in the toolbar to edit inline |

---

## 4. Node Palette — Complete Reference

### Node Categories

| Category | Color | Icon | Purpose |
|----------|-------|------|---------|
| **Triggers** | Amber (#f59e0b) | `pi-bolt` | Start a workflow based on messages, events, or schedules |
| **Messages** | Green (#25D366) | `pi-comment` | Send WhatsApp messages to the customer |
| **Commerce** | Purple (#8b5cf6) | `pi-shopping-cart` | E-commerce operations (catalog, cart, checkout, payment) |
| **Logic** | Pink (#ec4899) | `pi-sitemap` | Control flow — branching, waiting, routing |
| **Actions** | Blue (#3b82f6) | `pi-cog` | Perform operations (tag customers, update orders, API calls) |
| **Utility** | Slate (#64748b) | `pi-wrench` | Helper nodes (delay, language, end) |

---

### 4.1 Trigger Nodes

Trigger nodes are the **entry points** of every workflow. Each workflow must have exactly one trigger node. They determine **when** the workflow starts.

---

#### Message Received (`trigger_message`)

**Purpose:** Starts the workflow when a customer sends a WhatsApp message matching specified keywords.

**Icon:** `pi-envelope` | **Color:** Amber | **Outputs:** 1

**Configuration:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `keywords` | Text | Comma-separated trigger words | `hi, hello, menu, start` |
| `matchType` | Select | How to match the message against keywords | `contains`, `exact`, `starts_with` |

**How It Works:**
1. Customer sends a message to the WhatsApp business number
2. The trigger matcher loads all active workflows (cached 60s in Redis)
3. For each workflow with a `trigger_message` node, it checks if the message matches any keyword using the configured match type
4. First match wins — the workflow execution starts
5. The engine follows the outgoing edge to the next node

**Match Type Details:**
- **Contains** (default): The keyword can appear anywhere in the message. "hi there" matches "hi". Case-insensitive.
- **Exact**: The entire message must be exactly the keyword. "hi" matches "hi" but not "hi there". Case-insensitive.
- **Starts With**: The message must begin with the keyword. "hi there" matches "hi" but "say hi" does not. Case-insensitive.

**Best Practices:**
- Use short, common keywords like "hi", "menu", "help", "order"
- Avoid keywords that overlap with other workflows
- Use `contains` for flexible matching, `exact` for precise triggers
- Multiple keywords provide fallback triggers (e.g., "hi, hello, hey, start")

---

#### Order Event (`trigger_order`)

**Purpose:** Starts the workflow when an order status changes — used for automated order processing flows.

**Icon:** `pi-shopping-bag` | **Color:** Amber | **Outputs:** 1

**Configuration:**

| Field | Type | Options |
|-------|------|---------|
| `event` | Select | `created`, `confirmed`, `delivered`, `cancelled` |

**How It Works:**
1. When an order is created or its status changes, the system emits a domain event (`OrderCreatedEvent` or `OrderStatusChangedEvent`)
2. The `WorkflowEventListener` catches the event and checks for matching `trigger_order` workflows
3. If found, it looks up the customer, gets/creates a conversation, and starts the workflow
4. Context variables are automatically set: `order_id`, `order_number`, `order_total`, `order_status`

**Use Cases:**
- Send order confirmation message when a new order is created
- Notify customer when order is confirmed, delivered, or cancelled
- Trigger delivery tracking workflow when order is confirmed
- Send feedback request after delivery

---

#### Payment Event (`trigger_payment`)

**Purpose:** Starts the workflow when a payment status changes.

**Icon:** `pi-wallet` | **Color:** Amber | **Outputs:** 1

**Configuration:**

| Field | Type | Options |
|-------|------|---------|
| `event` | Select | `received`, `verified`, `expired` |

**How It Works:**
1. When a payment is verified or expires, the system emits a domain event
2. The event listener checks for matching `trigger_payment` workflows
3. Context variables are set: `payment_id`, `order_id`, `payment_amount`

**Use Cases:**
- Send thank-you message when payment is verified
- Auto-confirm order on payment verification
- Send payment reminder when payment expires
- Offer alternative payment method on expiry

---

#### Scheduled (`trigger_schedule`)

**Purpose:** Starts the workflow on a recurring schedule (cron-based).

**Icon:** `pi-calendar` | **Color:** Amber | **Outputs:** 1

**Configuration:**

| Field | Type | Options |
|-------|------|---------|
| `schedule` | Select | `hourly`, `daily`, `weekly` |
| `time` | Text | Time to run (e.g., `09:00`) |

**Use Cases:**
- Send daily promotions at 9 AM
- Weekly recap messages to VIP customers
- Periodic stock update notifications

---

### 4.2 Message Nodes

Message nodes **send WhatsApp messages** to the customer. Some pause the workflow to wait for a reply.

---

#### Send Text (`send_text`)

**Purpose:** Sends a plain text message to the customer. The most basic messaging node.

**Icon:** `pi-comment` | **Color:** Green | **Outputs:** 1 | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `message` | Textarea | The message text. Supports `{{variable}}` placeholders. |

**How It Works:**
1. Resolves all `{{variable}}` placeholders in the message text using the execution context
2. Sends the message via `WhatsAppMessageService.logAndSendText()`
3. The message is logged in the `messages` table and queued for delivery
4. Immediately advances to the next node (does not wait for reply)

**Template Variables Available:**
- `{{customer_name}}` — Customer's WhatsApp name (fallback: "Customer")
- `{{customer_phone}}` — Customer's phone number
- `{{order_number}}` — Current order number (if set by checkout node)
- `{{order_total}}` — Current order total
- `{{cart_total}}` — Cart total (if set by view_cart node)
- Any custom variable set by previous nodes

**Example Messages:**
```
Hello {{customer_name}}! Welcome to our store.
Your order #{{order_number}} has been confirmed. Total: ₹{{order_total}}
Thank you for shopping with us, {{customer_name}}!
```

---

#### Send Buttons (`send_buttons`)

**Purpose:** Sends an interactive button message (max 3 buttons). Pauses the workflow until the customer clicks a button.

**Icon:** `pi-th-large` | **Color:** Green | **Outputs:** Up to 3 | **Pauses:** Yes (waits for button click)

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `body` | Textarea | Message body text. Supports `{{variable}}` placeholders. |
| `buttons` | Textarea | Button labels, one per line (max 3, each max 20 chars). |

**How It Works:**
1. Resolves template variables in the body text
2. Parses button labels from the `buttons` field (split by newline, max 3)
3. Sends an interactive button message via WhatsApp API
4. Creates a `_buttonMap` in execution variables mapping each button's ID to the corresponding outgoing edge's target node
5. Pauses execution with `waitType: 'reply'`
6. When the customer clicks a button, the engine resumes and routes to the matching edge

**Edge Routing:**
- Each button label corresponds to an outgoing edge label
- Button 1 → first outgoing edge, Button 2 → second, Button 3 → third
- The `_buttonMap` provides direct ID-to-node-ID mapping for precise routing
- If no matching edge is found, falls back to the first outgoing edge

**WhatsApp Limitations:**
- Maximum 3 buttons per message
- Each button title maximum 20 characters
- Button titles must be unique within the message

**Example:**
```
Body: "What would you like to do?"
Buttons:
  Browse Catalog
  View Cart
  Track Order

→ Creates 3 outgoing edges labeled "Browse Catalog", "View Cart", "Track Order"
→ Each edge connects to a different next node
```

---

#### Send List Menu (`send_list`)

**Purpose:** Sends an interactive list picker. Can auto-populate from product categories, products, or custom items.

**Icon:** `pi-list` | **Color:** Green | **Outputs:** 1 | **Pauses:** Yes (waits for list selection)

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `body` | Textarea | Message body text |
| `buttonText` | Text | Text on the list button (default: "View Options") |
| `source` | Select | Where to get list items: `categories`, `products`, or `custom` |

**How It Works:**

**Source: Categories**
1. Queries all active categories from `categories` table (max 10, sorted by `sort_order`)
2. Builds a list section with category names
3. Each item ID is prefixed `wf_cat_` + category ID for identification on reply

**Source: Products**
1. Queries all active products from `products` table (max 10, newest first)
2. Builds a list section with product name and price as description
3. Each item ID is prefixed `wf_prod_` + product ID

**Source: Custom**
1. Currently sends a basic placeholder list
2. Future: configurable custom items in the builder

**On Resume:**
- When the customer selects a list item, the `actionId` is parsed
- If it starts with `wf_prod_`, the product ID is extracted and stored as `selected_product_id`
- If it starts with `wf_cat_`, the category ID is stored as `selected_category_id`
- These variables are available for downstream commerce nodes

**WhatsApp Limitations:**
- Maximum 10 items per list section
- Item title maximum 24 characters
- Item description maximum 72 characters

---

#### Send Image (`send_image`)

**Purpose:** Sends an image with an optional caption.

**Icon:** `pi-image` | **Color:** Green | **Outputs:** 1 | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `imageUrl` | Text | URL of the image (must be publicly accessible HTTPS). Supports `{{variable}}`. |
| `caption` | Text | Optional caption text. Supports `{{variable}}`. |

**How It Works:**
1. Resolves template variables in URL and caption
2. Sends the image via `WhatsAppApiService.sendImage()`
3. Logs the outbound message in the `messages` table
4. Immediately advances to the next node

**Supported Image Formats:** JPEG, PNG (must be publicly accessible via HTTPS URL)

---

#### Send Template (`send_template`)

**Purpose:** Sends a pre-approved WhatsApp message template. Required for sending messages outside the 24-hour customer service window.

**Icon:** `pi-file` | **Color:** Green | **Outputs:** 1 | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `templateName` | Text | The exact name of the Meta-approved template |
| `language` | Select | Template language: `en` (English) or `hi` (Hindi). Default: `en` |

**How It Works:**
1. Sends the template via `WhatsAppApiService.sendTemplate()`
2. Meta renders the template with any configured parameters
3. Logs the outbound message
4. Immediately advances to the next node

**Important Notes:**
- Templates must be pre-approved by Meta before use
- Templates are required for initiating conversations outside the 24-hour window
- Template names must match exactly what's registered in Meta's system

---

### 4.3 Commerce Nodes

Commerce nodes handle **e-commerce operations** — browsing products, managing carts, creating orders, and processing payments.

---

#### Show Catalog (`show_catalog`)

**Purpose:** Displays the product catalog as an interactive WhatsApp list. Customers can browse and select products.

**Icon:** `pi-shopping-cart` | **Color:** Purple | **Outputs:** 1 | **Pauses:** Yes (waits for product selection)

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `categoryFilter` | Select | Filter by category: all or specific |
| `maxProducts` | Number | Maximum products to show (default: 10) |
| `sortBy` | Select | Sort order: `popular`, `price_asc`, `price_desc`, `newest` |

**How It Works:**
1. Queries active products from the tenant's `products` table
2. Applies sorting based on `sortBy` configuration
3. Limits results to `maxProducts`
4. Builds a WhatsApp interactive list with product name, price, and category
5. Sends the list with "View Products" button
6. Pauses for customer selection

**On Empty Catalog:**
- If no products are found, sends "Our catalog is currently empty" message
- Follows the "Empty" labeled edge if one exists, otherwise follows the default edge

**On Product Selection:**
- The selected product's ID is extracted from the `actionId` (format: `wf_prod_{id}`)
- Stored as `ctx.variables.selected_product_id` for use by downstream nodes (Add to Cart, Inventory Check)

---

#### Search Products (`search_products`)

**Purpose:** Searches the product catalog based on the customer's text input.

**Icon:** `pi-search` | **Color:** Purple | **Outputs:** 2 (Results / No Results) | **Pauses:** Yes

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `noResultsMessage` | Text | Message when no products match (default: "No products found. Try different keywords.") |
| `maxResults` | Number | Maximum search results (default: 5) |

**How It Works:**
1. Takes the customer's last message text as the search query
2. If no query, sends "What are you looking for?" and waits for reply
3. Searches products using `ILIKE` on both `name` and `description`
4. If results found: shows as interactive list, waits for selection
5. If no results: sends the configured "no results" message, follows "No Results" edge

**SQL Search:**
```sql
SELECT id, name, price FROM products
WHERE is_active = true AND (name ILIKE '%query%' OR description ILIKE '%query%')
LIMIT maxResults
```

---

#### Filter Products (`filter_products`)

**Purpose:** Filters the product catalog by criteria and stores filtered product IDs for downstream nodes. Does NOT send a message to the customer.

**Icon:** `pi-filter` | **Color:** Purple | **Outputs:** 1 | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `filterBy` | Select | Filter type: `category`, `price`, `in_stock`, `on_sale` |
| `value` | Text | Filter value (category name, price range like "100-500", etc.) |

**How It Works:**

| Filter | SQL Logic |
|--------|----------|
| `category` | Joins `categories`, matches name with ILIKE |
| `price` | Filters `price BETWEEN min AND max` (value format: "min-max") |
| `in_stock` | Joins `inventory`, filters `quantity > 0` |
| `on_sale` | Filters where `compare_at_price IS NOT NULL AND compare_at_price > price` |

**Sets Variables:**
- `filtered_products` — Array of matching product IDs
- `filtered_product_count` — Number of matching products

---

#### Add to Cart (`add_to_cart`)

**Purpose:** Adds the currently selected product to the customer's shopping cart.

**Icon:** `pi-cart-plus` | **Color:** Purple | **Outputs:** 2 (Success / Failure) | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `quantityPrompt` | Boolean | Whether to ask for quantity (default: false, adds 1) |
| `confirmMessage` | Text | Confirmation message (default: "Added to cart!"). Supports `{{variable}}`. |

**Requires:** `selected_product_id` must be set in context (by Show Catalog, Search Products, or Send List nodes)

**How It Works:**
1. Reads `selected_product_id` from execution variables
2. Gets or creates an active cart for the customer
3. Looks up the product (must be active)
4. If the product is already in the cart, increments quantity by 1
5. If not in cart, adds a new cart item with quantity 1
6. Sends the confirmation message
7. Follows the "Success" edge

**Variables Set:**
- `cart_product_name` — Name of the product just added
- `cart_product_price` — Price of the product

**On Failure:**
- If `selected_product_id` is missing → execution error
- If product not found or DB error → follows "Failure" edge

**Transaction Safety:** Uses database transaction to prevent race conditions.

---

#### View Cart (`view_cart`)

**Purpose:** Shows the customer their current cart summary with interactive buttons (Checkout, Clear Cart, Continue Shopping).

**Icon:** `pi-shopping-cart` | **Color:** Purple | **Outputs:** 2 | **Pauses:** Yes (waits for button click)

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `showCheckout` | Boolean | Show "Checkout" button (default: true) |
| `showClear` | Boolean | Show "Clear Cart" button (default: true) |

**How It Works:**
1. Queries all cart items for the customer's active cart
2. If cart is empty: sends "Your cart is empty" message, follows "Empty" edge
3. If cart has items: builds a summary message with each item (name, quantity, subtotal) and total
4. Sends interactive buttons: Checkout, Clear Cart, Continue Shopping (max 3)
5. Creates `_buttonMap` for routing on resume
6. Pauses for button click

**Cart Summary Format:**
```
🛒 Your Cart:
• Product A × 2 — ₹500
• Product B × 1 — ₹200

*Total: ₹700*
```

**Variables Set:** `cart_total`

**Edge Routing:**
- Buttons are mapped to edges by label matching
- "Checkout" → edge labeled "Checkout"
- "Clear Cart" → edge labeled "Clear Cart"
- "Continue Shopping" → edge labeled "Continue Shopping"

---

#### Checkout (`checkout`)

**Purpose:** Converts the customer's cart into an order. Creates the order record and all line items.

**Icon:** `pi-credit-card` | **Color:** Purple | **Outputs:** 2 (Success / Failure) | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `requireAddress` | Boolean | Whether a delivery address is required (default: true) |
| `paymentMethod` | Select | Payment method: `upi_qr`, `upi_manual`, `cod`, `choice` |

**How It Works:**
1. Gets the customer's active cart and all cart items
2. Calculates the subtotal (sum of price × quantity for all items)
3. Generates a unique order number (format: `ORD-{timestamp}{random}`)
4. Creates the order record with status `pending`
5. Creates individual `order_items` records for each cart item
6. Marks the cart as `checked_out`
7. Emits `OrderCreatedEvent` (can trigger order-event workflows)
8. Sends confirmation message: "✅ Order {number} created! Total: ₹{total}"
9. Follows "Success" edge

**Variables Set:**
- `order_id` — UUID of the created order
- `order_number` — Human-readable order number (e.g., "ORD-LXYK2AB")
- `order_total` — Total amount

**On Failure:**
- Empty cart or no active cart → sends error message, follows "Failure" edge
- Database error → sends error message

**Transaction Safety:** Entire operation runs in a database transaction (cart lookup, order creation, item creation, cart status update).

---

#### Check Inventory (`inventory_check`)

**Purpose:** Checks if a product is in stock and branches the workflow accordingly.

**Icon:** `pi-box` | **Color:** Purple | **Outputs:** 2 (In Stock / Out of Stock) | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `outOfStockMessage` | Text | Message when product is out of stock (default: "Sorry, this item is currently out of stock.") |

**Requires:** `selected_product_id` in context

**How It Works:**
1. Reads `selected_product_id` from context
2. Queries the `inventory` table for the product's quantity
3. If quantity > 0 → in stock → follows "In Stock" or "Yes" edge
4. If quantity = 0 → out of stock → sends out-of-stock message → follows "Out of Stock" or "No" edge

**Variables Set:** `stock_quantity`

---

#### Send Payment QR (`payment_qr`)

**Purpose:** Generates a UPI payment instruction and sends it to the customer. Waits for payment proof.

**Icon:** `pi-qrcode` | **Color:** Purple | **Outputs:** 2 | **Pauses:** Yes (waits for payment screenshot)

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `expiryMinutes` | Number | Payment expiry time in minutes (default: 30) |
| `reminderEnabled` | Boolean | Whether to send auto-reminders (default: true) |

**Requires:** `order_id` in context (set by Checkout node)

**How It Works:**
1. Gets the order total from the `orders` table
2. Gets the merchant's UPI ID from `settings` table (key: `upi_ids`)
3. Creates a `payments` record with status `pending` and configured expiry
4. Sends payment instruction message with UPI ID and amount
5. Pauses with `awaitingPaymentProof: true` flag

**Message Sent:**
```
💳 Please pay ₹{amount} to UPI: {upiId}

Payment expires in {expiryMinutes} minutes.
Send a screenshot of the payment as proof.
```

**Variables Set:** `payment_id`

**On Resume:** When the customer sends a media message (screenshot), the webhook processor detects it as payment proof and processes accordingly.

---

### 4.4 Logic Nodes

Logic nodes control the **flow of execution** — branching, routing, waiting, and delaying.

---

#### Condition / If-Else (`condition`)

**Purpose:** Evaluates a condition and branches the workflow into two paths: Yes or No.

**Icon:** `pi-directions` | **Color:** Pink | **Outputs:** 2 (Yes / No) | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `variable` | Select | What to check: `cart_items`, `order_status`, `payment_status`, `customer_tag`, `message_contains`, `time_of_day` |
| `operator` | Select | Comparison: `eq` (equals), `neq` (not equals), `gt` (greater than), `lt` (less than), `contains` |
| `value` | Text | Value to compare against |

**Variable Resolution:**

| Variable | How It's Resolved |
|----------|------------------|
| `cart_items` | Counts items in the customer's active cart (SQL query) |
| `order_status` | Gets the status of the customer's most recent order |
| `payment_status` | Gets the status of the most recent payment |
| `customer_tag` | Gets all tags from the customer record (comma-joined) |
| `message_contains` | Uses the customer's last reply text |
| `time_of_day` | Returns `morning` (before 12), `afternoon` (12-17), or `evening` (after 17) |
| Any other | Looks up in `ctx.variables` (custom variables set by previous nodes) |

**Operator Logic:**

| Operator | Behavior | Example |
|----------|----------|---------|
| `eq` | Case-insensitive string equality | `order_status eq confirmed` |
| `neq` | Not equal | `payment_status neq verified` |
| `gt` | Numeric greater than | `cart_items gt 0` |
| `lt` | Numeric less than | `order_total lt 500` |
| `contains` | String contains substring | `customer_tag contains vip` |

**Edge Routing:**
- If condition is TRUE → follows edge labeled "Yes"
- If condition is FALSE → follows edge labeled "No"
- If no matching edge → workflow ends

---

#### Switch / Router (`switch`)

**Purpose:** Routes the workflow to different paths based on a variable's value. Like a multi-way if/else.

**Icon:** `pi-sitemap` | **Color:** Pink | **Outputs:** Up to 5 | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `variable` | Select | What to route by: `button_reply`, `list_reply`, `message_text`, `language` |

**How It Works:**
1. Reads the match value from the specified variable source
2. Checks all outgoing edges for a label matching the value (case-insensitive)
3. If a match is found, follows that edge
4. If no match, follows the unlabeled "default" edge
5. If no default edge, workflow ends

**Variable Sources:**

| Source | Value Used |
|--------|----------|
| `button_reply` | `lastReply.actionTitle` or `lastReply.text` |
| `list_reply` | `lastReply.actionTitle` or `lastReply.text` |
| `message_text` | `lastReply.text` |
| `language` | `ctx.variables.language` (default: "en") |

**Example:**
A switch node after a "Send Buttons" node with 3 buttons ("Browse", "Cart", "Help"):
- Edge labeled "Browse" → Show Catalog node
- Edge labeled "Cart" → View Cart node
- Edge labeled "Help" → Assign Agent node
- Unlabeled edge → default fallback

---

#### Wait for Reply (`wait_for_reply`)

**Purpose:** Explicitly pauses the workflow and waits for the customer's next message.

**Icon:** `pi-hourglass` | **Color:** Pink | **Outputs:** 2 (Reply / Timeout) | **Pauses:** Yes

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `timeoutMinutes` | Number | How long to wait before timing out (default: 60 minutes) |
| `timeoutMessage` | Text | Optional message to send on timeout (e.g., "Are you still there?") |

**How It Works:**
1. Pauses execution immediately
2. Schedules a BullMQ timeout job (delayed by `timeoutMinutes`)
3. When the customer replies within the timeout, the execution resumes and follows the outgoing edge
4. If the timeout fires first:
   - If a "Timeout" labeled edge exists → follows it
   - If no timeout edge → workflow completes with reason "timeout"

**Use Cases:**
- Wait for customer to provide their address
- Wait for customer to confirm an action
- Collect free-text input from the customer (their reply is stored in `ctx.variables.last_input`)

---

### 4.5 Action Nodes

Action nodes **perform operations** that modify data or integrate with external systems.

---

#### Tag Customer (`tag_customer`)

**Purpose:** Adds or removes a tag on the customer's profile. Useful for segmentation and campaign targeting.

**Icon:** `pi-tag` | **Color:** Blue | **Outputs:** 1 | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `action` | Select | `add` (add tag) or `remove` (remove tag) |
| `tag` | Text | Tag name (e.g., "vip", "new", "returning", "abandoned_cart") |

**How It Works:**
- **Add:** Uses PostgreSQL `array_append()` to add the tag, with a duplicate check (`NOT ($1 = ANY(...))`)
- **Remove:** Uses PostgreSQL `array_remove()` to remove the tag

**Use Cases:**
- Tag customers who complete a purchase as "buyer"
- Tag customers who abandon cart as "abandoned_cart" (for re-engagement campaigns)
- Tag VIP customers who spend over a threshold
- Remove "new" tag after first purchase

---

#### Update Order (`update_order`)

**Purpose:** Changes the status of the current order.

**Icon:** `pi-pencil` | **Color:** Blue | **Outputs:** 1 | **Pauses:** No

**Configuration:**

| Field | Type | Options |
|-------|------|---------|
| `status` | Select | `confirmed`, `processing`, `ready_for_delivery`, `cancelled` |

**Requires:** `order_id` in context

**How It Works:**
1. Gets the current order status
2. Updates to the new status
3. Sets `confirmed_at = NOW()` if status is "confirmed"
4. Sets `delivered_at = NOW()` if status is "delivered"
5. Emits `OrderStatusChangedEvent` (can cascade to other workflows)

**Variables Set:** `order_status` (updated to the new status)

---

#### Assign to Agent (`assign_agent`)

**Purpose:** Hands the conversation off to a human agent and sends a handoff message.

**Icon:** `pi-user` | **Color:** Blue | **Outputs:** 1 | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `assignTo` | Select | `any` (any available agent) or `specific` (named user) |
| `message` | Text | Message sent to customer during handoff (default: "Connecting you with our team...") |

**How It Works:**
1. Sets `assigned_to_agent: true` in the conversation's `context` JSONB field
2. Sends the handoff message to the customer
3. Continues to the next node (workflow doesn't end here — you can add more nodes after)

---

#### HTTP Request (`http_request`)

**Purpose:** Calls an external API and stores the response. Useful for integrating with third-party services.

**Icon:** `pi-globe` | **Color:** Blue | **Outputs:** 2 (Success / Failure) | **Pauses:** No

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `method` | Select | HTTP method: `GET` or `POST` |
| `url` | Text | API endpoint URL. Supports `{{variable}}` placeholders. |

**How It Works:**
1. Resolves template variables in the URL
2. Makes the HTTP request using `fetch()`
3. Parses the response body (auto-detects JSON)
4. On success (2xx): follows "Success" edge
5. On failure (non-2xx or network error): follows "Failure" edge

**Variables Set:**
- `http_status` — HTTP status code (e.g., 200, 404, 500)
- `http_response` — Parsed response body (JSON object or string)
- `http_error` — Error message (only on failure)

**Use Cases:**
- Verify payment with external payment gateway
- Look up customer in CRM
- Send data to analytics service
- Trigger notification in external system (Slack, email, etc.)

---

### 4.6 Utility Nodes

Utility nodes provide **helper functionality** for controlling flow timing, language, and workflow termination.

---

#### Delay / Wait (`delay`)

**Purpose:** Pauses the workflow for a configured duration before continuing to the next node.

**Icon:** `pi-clock` | **Color:** Slate | **Outputs:** 1 | **Pauses:** Yes (time-based)

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `duration` | Number | How long to wait (default: 5) |
| `unit` | Select | Time unit: `seconds`, `minutes`, `hours` (default: minutes) |

**How It Works:**
1. Calculates delay in milliseconds
2. Schedules a BullMQ delayed job with the calculated delay
3. Pauses execution
4. When the delay completes, the queue processor calls `resumeExecution()` with `resumeSource: 'delay'`
5. The engine follows the single outgoing edge

**Use Cases:**
- Wait 5 minutes after order creation before sending payment reminder
- Wait 1 hour after delivery before asking for feedback
- Pause between messages to avoid overwhelming the customer
- Create drip campaign sequences with timed delays

---

#### Set Language (`set_language`)

**Purpose:** Sets the customer's language preference for the conversation.

**Icon:** `pi-globe` | **Color:** Slate | **Outputs:** 1 | **Pauses:** No

**Configuration:**

| Field | Type | Options |
|-------|------|---------|
| `language` | Select | `en` (English), `hi` (Hindi), `auto` (Auto Detect) |

**How It Works:**
1. Sets `ctx.variables.language` for the current execution
2. Updates the `language` field on the customer's database record (persists across sessions)
3. Downstream nodes can use the language preference for localized responses

---

#### End Flow (`end`)

**Purpose:** Explicitly terminates the workflow execution. Marks it as completed.

**Icon:** `pi-stop-circle` | **Color:** Red | **Outputs:** 0 | **Pauses:** No (terminal)

**How It Works:**
- Returns `{ action: 'end' }`, which causes the run loop to mark the execution as `completed`
- The execution record gets `completed_at = NOW()` and `status = 'completed'`

**Note:** A workflow also ends naturally if a node has no outgoing edges. The End node is just an explicit way to indicate termination in the visual builder.

---

## 5. Edge Routing & Connections

Edges connect nodes and define the flow of execution. Different node types use different routing strategies.

### Edge Types

| Node Type | Edge Labels | Routing Strategy |
|-----------|------------|-----------------|
| Single-output nodes (send_text, send_image, tag_customer, etc.) | No label needed | Follow the one outgoing edge |
| send_buttons | Button text labels | Match customer's button click against edge labels |
| send_list | Item labels | Follow single outgoing edge; selected item stored in variables |
| condition | "Yes" / "No" | Evaluation result determines which edge to follow |
| switch | Multiple case labels + optional unlabeled default | Match reply value against edge labels |
| show_catalog | Optional "Empty" + default | "Empty" if no products; default otherwise |
| view_cart | "Checkout" / "Clear Cart" / "Continue Shopping" / "Empty" | Button mapping |
| add_to_cart, checkout | "Success" / "Failure" | Based on operation result |
| inventory_check | "In Stock" / "Out of Stock" (or "Yes" / "No") | Based on stock quantity |
| http_request | "Success" / "Failure" | Based on HTTP response status |
| wait_for_reply | Reply edge + optional "Timeout" | Reply resumes; timeout follows "Timeout" edge |

### Creating Edges in the Builder

1. Hover over a node to see its output port (bottom connector)
2. Click the output port — the builder enters "edge creation mode"
3. Click another node's input port (top connector) to complete the connection
4. The edge appears as a Bezier curve between the two nodes
5. For multi-output nodes, you can label edges by clicking on them

### Edge Data Structure

```typescript
{
  id: string;       // Unique edge ID (auto-generated)
  from: string;     // Source node ID
  to: string;       // Target node ID
  label?: string;   // Edge label (for routing: "Yes", "No", "Checkout", etc.)
  condition?: string; // Optional condition expression
}
```

---

## 6. Template Variables & Dynamic Content

Messages in workflow nodes support `{{variable}}` placeholders that are resolved at runtime.

### How Resolution Works

The `resolveTemplate()` function replaces `{{variable}}` patterns:

1. **Context variables** (highest priority): Values set by previous nodes during execution
2. **Built-in variables**: Well-known keys with automatic resolution
3. **Unresolved**: If no match found, the placeholder is left as-is

### Available Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{customer_name}}` | Built-in | Customer's WhatsApp profile name (fallback: "Customer") |
| `{{customer_phone}}` | Built-in | Customer's phone number |
| `{{order_number}}` | Set by checkout node | Order number (e.g., "ORD-LXYK2AB") |
| `{{order_total}}` | Set by checkout node | Order total amount |
| `{{order_id}}` | Set by checkout node | Order UUID |
| `{{order_status}}` | Set by update_order node | Current order status |
| `{{cart_total}}` | Set by view_cart node | Cart total amount |
| `{{cart_product_name}}` | Set by add_to_cart node | Last added product name |
| `{{cart_product_price}}` | Set by add_to_cart node | Last added product price |
| `{{payment_id}}` | Set by payment_qr node | Payment record ID |
| `{{stock_quantity}}` | Set by inventory_check node | Stock level of checked product |
| `{{http_status}}` | Set by http_request node | HTTP response status code |
| `{{http_response}}` | Set by http_request node | HTTP response body |
| `{{last_input}}` | Set on reply | Customer's last free-text input |
| `{{language}}` | Set by set_language node | Current language preference |
| `{{selected_product_id}}` | Set by catalog/list selection | Selected product's ID |
| `{{selected_category_id}}` | Set by list selection | Selected category's ID |
| `{{filtered_product_count}}` | Set by filter_products node | Number of filtered products |

---

## 7. Execution Context & Variables

Every workflow execution carries a context object that accumulates data as the workflow progresses.

### Context Structure

```typescript
{
  executionId: string;      // Unique execution ID
  workflowId: string;       // Workflow definition ID
  schema: string;           // Tenant schema name (e.g., "tenant_mystore")
  tenant: {
    phoneNumberId: string;  // WhatsApp phone number ID
    accessToken: string;    // Meta API access token
    schemaName: string;     // Tenant schema name
  };
  conversationId: string;   // Conversation thread ID
  customerPhone: string;    // Customer's phone number
  customerId: string;       // Customer record ID
  customerName?: string;    // Customer's name
  variables: {              // Accumulated variables from node executions
    [key: string]: any;
  };
  triggerData?: any;        // Data from the trigger event
  lastReply?: {             // Most recent customer reply
    type: 'text' | 'button_reply' | 'list_reply' | 'media';
    text?: string;          // Raw text content
    actionId?: string;      // Button/list item ID
    actionTitle?: string;   // Button/list item display text
    raw?: any;              // Full raw message object
  };
}
```

### Variable Lifecycle

1. **Trigger data**: Event triggers inject initial variables (e.g., `order_id`, `order_number` from order events)
2. **Node execution**: Each node can read and write variables (e.g., checkout sets `order_id`)
3. **Customer replies**: Reply text is stored in `lastReply` and optionally `last_input`
4. **List/button selection**: Product IDs and category IDs are extracted and stored
5. **Persistence**: The entire `variables` object is saved to `workflow_executions.variables` (JSONB) on every step

---

## 8. Workflow Lifecycle

### Workflow Statuses

```
                     ┌──────────┐
          create()   │          │   activate()
     ────────────>   │  draft   │ ────────────>  ┌──────────┐
                     │          │                │  active  │
                     └──────────┘ <──────────── └──────────┘
                          │          pause()          │
                          │                           │
                     archive()                   archive()
                          │                           │
                          v                           v
                     ┌──────────────────────────────────┐
                     │           archived               │
                     └──────────────────────────────────┘
```

| Status | Description | Trigger Matching | Can Edit |
|--------|------------|-----------------|----------|
| `draft` | Newly created, not yet active | No | Yes |
| `active` | Live — triggers are matched and executions run | Yes | Yes (save pauses triggers briefly) |
| `paused` | Temporarily disabled | No | Yes |
| `archived` | Retired — hidden from main list | No | No |

### Execution Statuses

| Status | Description |
|--------|------------|
| `running` | Currently executing nodes in the run loop |
| `waiting` | Paused — waiting for customer reply, delay, or timeout |
| `completed` | Successfully finished (reached end node or ran out of nodes) |
| `failed` | Execution error (node handler threw, missing required data) |
| `timed_out` | Stale execution cleaned up (>1 hour in running/waiting state) |

### Stale Execution Cleanup

A cron job runs every 10 minutes to clean up stale executions:
- Any execution in `running` or `waiting` state for more than 1 hour is automatically set to `timed_out`
- This prevents zombie executions from accumulating

---

## 9. Default Templates

The builder ships with 3 pre-built templates and a blank canvas option.

### Order Flow Template (8 nodes)

**Purpose:** Automated order confirmation and payment collection.

**Trigger:** Order Created event

```
[Order Created] → [Send Confirmation] → [Payment QR] → [Wait for Reply]
                                                              │
                                                    [Payment Received?]
                                                      ↙           ↘
                                              [Yes: Confirmed]  [No: Reminder]
                                                      ↘           ↙
                                                      [End Flow]
```

**Nodes:**
1. **Order Created** (trigger_order) — Triggers on `created` event
2. **Send Confirmation** (send_text) — "Thank you for your order, {{customer_name}}! Your order #{{order_number}} has been received."
3. **Payment QR** (payment_qr) — Generates UPI payment instruction with 30-min expiry
4. **Wait for Reply** (wait_for_reply) — Waits 30 minutes for payment proof
5. **Payment Received?** (condition) — Checks `payment_status eq verified`
6. **Order Confirmed** (send_text) — "Payment received! Your order is confirmed and being prepared."
7. **Payment Reminder** (send_text) — "Your payment is still pending. Please complete it to confirm your order."
8. **End Flow** (end) — Terminates the workflow

---

### Support Flow Template (6 nodes)

**Purpose:** Customer support routing with topic-based branching.

**Trigger:** Message containing "help", "support", "issue", or "problem"

```
[Message Received] → [Support Menu (Buttons)] → [Switch Router]
                                                    ↙    │    ↘
                                    [Order Help]  [Browse]  [Connect Agent]
```

**Nodes:**
1. **Message Received** (trigger_message) — Keywords: "help, support, issue, problem" (contains)
2. **Support Menu** (send_buttons) — "How can we help you today?" with 3 buttons: Order Issue, Product Question, Other
3. **Switch Router** (switch) — Routes by `button_reply`
4. **Order Help** (send_text) — "Please share your order number and we'll look into it right away."
5. **Browse Products** (show_catalog) — Shows product catalog
6. **Connect to Agent** (assign_agent) — Hands off to human agent

---

### Sales Flow Template (7 nodes)

**Purpose:** End-to-end shopping experience from discovery to checkout.

**Trigger:** Message containing "buy", "shop", "catalog", or "browse"

```
[Message Received] → [Welcome] → [Show Catalog] → [Search Products]
                                                          │
                                              [Add to Cart] → [Checkout] → [End]
```

**Nodes:**
1. **Message Received** (trigger_message) — Keywords: "buy, shop, catalog, browse" (contains)
2. **Welcome** (send_text) — "Welcome to our store! Let me show you our latest products."
3. **Show Catalog** (show_catalog) — Displays products with default settings
4. **Search Products** (search_products) — Searches catalog by customer query
5. **Add to Cart** (add_to_cart) — Adds selected product to cart
6. **Checkout** (checkout) — Creates order with address requirement and customer payment choice
7. **End Flow** (end)

---

## 10. Business Template Library

Below are additional workflow templates designed for common business scenarios. These can be built using the existing 27 node types.

---

### Welcome & Onboarding Flow (9 nodes)

**Purpose:** Greet first-time customers, introduce the store, set language, and tag them as new.

**Trigger:** Message containing "hi", "hello", "hey", "start"

```
[Message Received: hi/hello] → [Set Language: auto] → [Tag: new_customer]
        → [Welcome Message]
        → [Send Buttons: Browse/Search/Help]
        → [Switch Router]
               ↙       │        ↘
     [Show Catalog]  [Search]  [Assign Agent]
                                    ↓
                               [End Flow]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_message | keywords: "hi, hello, hey, start, menu", matchType: contains |
| 2 | set_language | language: auto |
| 3 | tag_customer | action: add, tag: "new_customer" |
| 4 | send_text | "Hello {{customer_name}}! 👋 Welcome to [Your Store]. We sell [products] directly through WhatsApp. How can I help you today?" |
| 5 | send_buttons | body: "Choose an option:", buttons: "Browse Catalog\nSearch Products\nTalk to Us" |
| 6 | switch | variable: button_reply |
| 7 | show_catalog | sortBy: popular, maxProducts: 10 |
| 8 | search_products | maxResults: 5 |
| 9 | assign_agent | assignTo: any, message: "Connecting you with our team..." |

---

### Abandoned Cart Recovery Flow (8 nodes)

**Purpose:** Re-engage customers who added items to cart but didn't checkout. Triggered by a scheduled task or event.

**Trigger:** Scheduled (daily at 10:00 AM)

```
[Scheduled: daily] → [Filter: in_stock] → [Condition: cart_items > 0]
                                                ↙              ↘
                                          [Yes]              [No: End]
                                            ↓
                                   [Send Text: Cart Reminder]
                                            ↓
                                   [Send Buttons: Checkout/Browse/Clear]
                                            ↓
                                      [Switch Router]
                                      ↙      │       ↘
                               [View Cart] [Catalog] [Tag: cleared_cart]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_schedule | schedule: daily, time: 10:00 |
| 2 | filter_products | filterBy: in_stock |
| 3 | condition | variable: cart_items, operator: gt, value: 0 |
| 4 | send_text | "Hi {{customer_name}}! You left some items in your cart. Complete your order before they sell out!" |
| 5 | send_buttons | body: "What would you like to do?", buttons: "Complete Checkout\nBrowse More\nClear Cart" |
| 6 | switch | variable: button_reply |
| 7 | view_cart | showCheckout: true |
| 8 | tag_customer | action: add, tag: "cleared_cart" |

---

### Post-Delivery Feedback Flow (10 nodes)

**Purpose:** Collect customer feedback after delivery, tag satisfied/unsatisfied customers, and route complaints to agents.

**Trigger:** Order event — "delivered"

```
[Order Delivered] → [Delay: 2 hours] → [Send Text: Delivery Confirmation]
        → [Send Buttons: Rate Experience]
        → [Switch Router]
              ↙            │            ↘
     [Great!]        [Average]     [Poor]
        ↓                 ↓             ↓
  [Tag: satisfied]  [Tag: neutral]  [Tag: unsatisfied]
        ↓                 ↓             ↓
   [Send Text:       [Wait Reply]   [Assign Agent +
    Thank You]                       Apology Message]
        ↓                                ↓
    [End Flow]                       [End Flow]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_order | event: delivered |
| 2 | delay | duration: 2, unit: hours |
| 3 | send_text | "Hi {{customer_name}}! Your order #{{order_number}} has been delivered. We hope you love it!" |
| 4 | send_buttons | body: "How was your experience?", buttons: "Excellent! 😊\nIt was okay\nNot great 😕" |
| 5 | switch | variable: button_reply |
| 6 | tag_customer | action: add, tag: "satisfied" |
| 7 | tag_customer | action: add, tag: "neutral" |
| 8 | tag_customer | action: add, tag: "unsatisfied" |
| 9 | send_text | "Thank you for the wonderful feedback, {{customer_name}}! We appreciate your support." |
| 10 | assign_agent | message: "We're sorry to hear that. Let us connect you with our team to make things right." |

---

### Payment Reminder Flow (7 nodes)

**Purpose:** Send progressive payment reminders for unpaid orders.

**Trigger:** Payment event — "expired"

```
[Payment Expired] → [Send Text: Reminder 1]
        → [Delay: 30 minutes]
        → [Condition: payment_status eq pending]
              ↙                ↘
        [Yes: Still Unpaid]   [No: Paid → End]
              ↓
        [Send Buttons: Pay Now / Cancel]
              ↓
        [Switch Router]
           ↙          ↘
   [Payment QR]    [Update Order: cancelled]
        ↓                    ↓
   [End Flow]          [Send Text: Cancelled]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_payment | event: expired |
| 2 | send_text | "Hi {{customer_name}}, your payment for order #{{order_number}} is still pending. Please complete the payment to confirm your order." |
| 3 | delay | duration: 30, unit: minutes |
| 4 | condition | variable: payment_status, operator: eq, value: pending |
| 5 | send_buttons | body: "Your payment is still pending. Would you like to:", buttons: "Pay Now\nCancel Order" |
| 6 | switch | variable: button_reply |
| 7 | payment_qr | expiryMinutes: 30 |
| 8 | update_order | status: cancelled |

---

### Product Recommendation Flow (8 nodes)

**Purpose:** Recommend products based on customer preferences using category browsing and search.

**Trigger:** Message containing "recommend", "suggest", "what's new", "best"

```
[Message Received] → [Send Buttons: Preference]
        → [Switch Router]
              ↙            │            ↘
    [Filter: on_sale]  [Filter: newest] [Search Products]
              ↓            ↓               ↓
     [Show Catalog    [Show Catalog    [Show Results]
      (price_asc)]    (newest)]
              ↓            ↓               ↓
         [Add to Cart] ←──────────────────┘
              ↓
         [View Cart] → [End]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_message | keywords: "recommend, suggest, what's new, best, popular", matchType: contains |
| 2 | send_buttons | body: "What are you looking for?", buttons: "Best Deals\nNew Arrivals\nSearch by Name" |
| 3 | switch | variable: button_reply |
| 4 | filter_products | filterBy: on_sale |
| 5 | filter_products | filterBy: newest (show catalog sorted by newest) |
| 6 | search_products | maxResults: 5, noResultsMessage: "No products found. Try browsing our catalog instead!" |
| 7 | add_to_cart | confirmMessage: "{{cart_product_name}} added to your cart!" |
| 8 | view_cart | showCheckout: true |

---

### Order Tracking Flow (8 nodes)

**Purpose:** Let customers check the status of their recent orders.

**Trigger:** Message containing "track", "order", "status", "where"

```
[Message Received] → [Condition: Has Recent Order?]
                            ↙              ↘
                    [Yes: Has Order]    [No: No Orders]
                          ↓                    ↓
              [Send Text: Order Status]  [Send Text: No orders found]
                          ↓                    ↓
              [Send Buttons: Options]     [Show Catalog]
                          ↓
                   [Switch Router]
                   ↙        │         ↘
            [View Cart]  [Catalog]  [Assign Agent]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_message | keywords: "track, order, status, where is my order, my order", matchType: contains |
| 2 | condition | variable: order_status, operator: neq, value: "" |
| 3 | send_text | "Your latest order #{{order_number}} is currently: *{{order_status}}*. Total: ₹{{order_total}}" |
| 4 | send_text | "You don't have any recent orders. Would you like to browse our products?" |
| 5 | send_buttons | body: "What else can I help with?", buttons: "View Cart\nBrowse Products\nTalk to Support" |
| 6 | switch | variable: button_reply |
| 7 | show_catalog | sortBy: popular |
| 8 | assign_agent | message: "Connecting you with our support team..." |

---

### Business Hours Routing Flow (7 nodes)

**Purpose:** Route customers differently based on business hours (morning/afternoon/evening).

**Trigger:** Message containing "hi", "hello"

```
[Message Received] → [Condition: time_of_day]
                         ↙         │          ↘
                   [Morning]  [Afternoon]  [Evening]
                       ↓           ↓           ↓
               [Send Text:   [Send Text:  [Send Text:
                Good Morning  Good         Store is
                + Menu]       Afternoon    closed,
                              + Menu]      leave message]
                       ↓           ↓           ↓
               [Send Buttons: Browse/Cart/Help] [Wait for Reply]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_message | keywords: "hi, hello", matchType: contains |
| 2 | condition | variable: time_of_day, operator: eq, value: morning |
| 3 | condition | variable: time_of_day, operator: eq, value: afternoon |
| 4 | send_text | "Good morning, {{customer_name}}! ☀️ Our store is open. How can I help you today?" |
| 5 | send_text | "Good afternoon, {{customer_name}}! We're here to help. What are you looking for?" |
| 6 | send_text | "Hi {{customer_name}}, our store is currently closed. Leave us a message and we'll get back to you in the morning!" |
| 7 | wait_for_reply | timeoutMinutes: 720 (12 hours) |

---

### Re-Engagement Campaign Flow (6 nodes)

**Purpose:** Re-engage inactive customers with personalized offers.

**Trigger:** Scheduled (weekly)

```
[Scheduled: weekly] → [Filter: in_stock]
        → [Condition: customer_tag contains inactive]
              ↙                ↘
        [Yes: Inactive]    [No: Active → End]
              ↓
        [Send Template: re_engagement_offer]
              ↓
        [Tag: re_engaged]
              ↓
        [End Flow]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_schedule | schedule: weekly, time: 11:00 |
| 2 | filter_products | filterBy: on_sale |
| 3 | condition | variable: customer_tag, operator: contains, value: inactive |
| 4 | send_template | templateName: re_engagement_offer, language: en |
| 5 | tag_customer | action: add, tag: "re_engaged" |
| 6 | end | — |

---

### VIP Customer Flow (9 nodes)

**Purpose:** Identify high-value customers and provide priority treatment.

**Trigger:** Order event — "created"

```
[Order Created] → [Condition: order_total > 5000]
                         ↙              ↘
                  [Yes: High Value]  [No: Regular → End]
                        ↓
                 [Tag: vip]
                        ↓
                 [Send Text: VIP Thank You]
                        ↓
                 [Send Image: VIP Badge/Offer]
                        ↓
                 [Update Order: confirmed]
                        ↓
                 [Send Text: Auto-Confirmed + Free Delivery]
                        ↓
                 [End Flow]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_order | event: created |
| 2 | condition | variable: order_total, operator: gt, value: 5000 |
| 3 | tag_customer | action: add, tag: "vip" |
| 4 | send_text | "Thank you for your order, {{customer_name}}! As a valued VIP customer, you get priority processing and free delivery." |
| 5 | send_image | imageUrl: "https://cdn.yourstore.com/vip-banner.png", caption: "Exclusive VIP benefits for you!" |
| 6 | update_order | status: confirmed |
| 7 | send_text | "Your order #{{order_number}} has been auto-confirmed with free delivery! Expected delivery: 24-48 hours." |
| 8 | end | — |

---

### Return & Exchange Flow (10 nodes)

**Purpose:** Handle product return and exchange requests.

**Trigger:** Message containing "return", "exchange", "refund", "replace"

```
[Message Received] → [Send Text: Return Policy]
        → [Send Buttons: Return/Exchange/Cancel]
        → [Switch Router]
              ↙            │            ↘
     [Return Flow]   [Exchange Flow]  [End: No Action]
           ↓               ↓
    [Wait: Order #]  [Wait: Order #]
           ↓               ↓
    [Tag: return_    [Tag: exchange_
     requested]       requested]
           ↓               ↓
    [Assign Agent]   [Assign Agent]
           ↓               ↓
     [End Flow]       [End Flow]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_message | keywords: "return, exchange, refund, replace, damaged", matchType: contains |
| 2 | send_text | "We're sorry to hear that! Our return/exchange policy: Returns within 7 days of delivery, items must be unused and in original packaging." |
| 3 | send_buttons | body: "How would you like to proceed?", buttons: "Request Return\nRequest Exchange\nNo, It's Fine" |
| 4 | switch | variable: button_reply |
| 5 | wait_for_reply | timeoutMinutes: 30, timeoutMessage: "Please share your order number to proceed." |
| 6 | tag_customer | action: add, tag: "return_requested" |
| 7 | tag_customer | action: add, tag: "exchange_requested" |
| 8 | assign_agent | message: "Our team will review your return request and get back to you within 24 hours." |
| 9 | assign_agent | message: "Our team will help you with the exchange. Please hold on." |
| 10 | end | — |

---

### Complete Shopping Experience Flow (12 nodes)

**Purpose:** Full end-to-end shopping workflow: welcome → browse → add to cart → checkout → payment → confirmation.

**Trigger:** Message containing "shop", "buy", "order"

```
[Message Received: shop/buy] → [Welcome Text]
        → [Show Catalog (popular)]
        → [Inventory Check]
              ↙             ↘
     [In Stock]         [Out of Stock → Show Catalog again]
        ↓
   [Add to Cart]
        ↓
   [Send Buttons: Checkout/Browse More]
        ↓
   [Switch]
      ↙         ↘
[View Cart]  [Show Catalog]
      ↓
 [Checkout]
      ↓
 [Payment QR]
      ↓
 [Send Text: Order Summary]
      ↓
 [End Flow]
```

**Node Details:**

| # | Node | Config |
|---|------|--------|
| 1 | trigger_message | keywords: "shop, buy, order, purchase", matchType: contains |
| 2 | send_text | "Welcome to our store, {{customer_name}}! Let me show you what we have." |
| 3 | show_catalog | sortBy: popular, maxProducts: 10 |
| 4 | inventory_check | outOfStockMessage: "Sorry, that item is sold out. Let me show you alternatives." |
| 5 | add_to_cart | confirmMessage: "{{cart_product_name}} (₹{{cart_product_price}}) added to your cart!" |
| 6 | send_buttons | body: "What would you like to do next?", buttons: "Proceed to Checkout\nBrowse More Products" |
| 7 | switch | variable: button_reply |
| 8 | view_cart | showCheckout: true, showClear: true |
| 9 | show_catalog | sortBy: newest |
| 10 | checkout | requireAddress: true, paymentMethod: upi_qr |
| 11 | payment_qr | expiryMinutes: 30, reminderEnabled: true |
| 12 | end | — |

---

## 11. API Reference

### Workflow CRUD

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/workflows` | List all workflows (paginated, filterable) | owner, seller |
| GET | `/api/workflows/:id` | Get workflow with full definition | owner, seller |
| POST | `/api/workflows` | Create new workflow | owner, seller |
| PATCH | `/api/workflows/:id` | Update metadata (name, description) | owner, seller |
| PUT | `/api/workflows/:id/definition` | Save node/edge graph | owner, seller |
| DELETE | `/api/workflows/:id` | Delete workflow | owner only |

### Workflow Lifecycle

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/workflows/:id/activate` | Activate workflow (starts trigger matching) | owner, seller |
| POST | `/api/workflows/:id/pause` | Pause workflow (stops triggers) | owner, seller |
| POST | `/api/workflows/:id/archive` | Archive workflow | owner only |
| POST | `/api/workflows/:id/duplicate` | Duplicate workflow | owner, seller |
| POST | `/api/workflows/:id/test` | Test-run workflow | owner, seller |

### Execution Logs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/workflows/:id/executions` | Execution history (paginated) | owner, seller |

### Request/Response Examples

**Create Workflow:**
```bash
POST /api/workflows
{
  "name": "Welcome Bot",
  "description": "Greets new customers",
  "trigger": "message_received"
}
```

**Save Definition:**
```bash
PUT /api/workflows/:id/definition
{
  "nodes": [
    { "id": "n1", "type": "trigger_message", "label": "Message Received", "x": 300, "y": 40, "config": { "keywords": "hi, hello", "matchType": "contains" }, "outputs": [] },
    { "id": "n2", "type": "send_text", "label": "Welcome", "x": 300, "y": 240, "config": { "message": "Hello {{customer_name}}!" }, "outputs": [] },
    { "id": "n3", "type": "end", "label": "End Flow", "x": 300, "y": 440, "config": {}, "outputs": [] }
  ],
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2" },
    { "id": "e2", "from": "n2", "to": "n3" }
  ]
}
```

---

## 12. Safety Guards & Limits

| Guard | Value | Purpose |
|-------|-------|---------|
| **Max steps per execution** | 50 | Prevents infinite loops |
| **Redis execution lock** | 30s TTL | Prevents concurrent resume of the same execution |
| **Stale execution cleanup** | Every 10 minutes | Times out executions stuck >1 hour |
| **Message deduplication** | Redis with 24h TTL | Same inbound message won't trigger twice |
| **Trigger cache** | 60s TTL | Active workflows are cached to avoid DB queries on every message |
| **Max buttons** | 3 | WhatsApp API limit |
| **Max list items** | 10 | WhatsApp API limit per section |
| **Button title length** | 20 chars | WhatsApp API limit |
| **List item title** | 24 chars | WhatsApp API limit |
| **Conversation quota** | Per subscription plan | Enforced before sending outbound messages |
| **Rate limiting** | 70 messages/sec | BullMQ outbound queue rate limit |

---

## 13. Best Practices

### Workflow Design

1. **Start simple** — Begin with 3-5 nodes, test, then expand
2. **Always add an End node** — Explicit termination is clearer than "falling off" the graph
3. **Use descriptive labels** — Rename nodes from defaults ("Send Text" → "Welcome Message")
4. **Handle empty states** — Add "Empty" edges on Show Catalog and View Cart nodes
5. **Set timeouts** — Always configure timeout on Wait for Reply nodes to prevent zombie executions
6. **Test before activating** — Use the Test Run feature to validate the flow

### Performance

1. **Keep workflows under 20 nodes** — Simpler flows execute faster and are easier to debug
2. **Avoid long delays** — Delays over 24 hours may conflict with WhatsApp's messaging window
3. **Use conditions early** — Branch early to avoid executing unnecessary nodes
4. **Limit catalog size** — Set `maxProducts` to 10 or fewer for faster list loading

### Business Tips

1. **One trigger per intent** — Avoid overlapping keywords between workflows
2. **Always offer human escalation** — Include an "Assign Agent" path for complex issues
3. **Tag strategically** — Use tags for campaign targeting ("vip", "repeat_buyer", "abandoned_cart")
4. **Personalize messages** — Use `{{customer_name}}` in every customer-facing message
5. **Follow up after delivery** — Use the Post-Delivery Feedback template to collect reviews
6. **Recover abandoned carts** — Use scheduled reminders to re-engage customers
7. **Respect business hours** — Use time_of_day conditions to route after-hours messages

---

*This documentation covers the complete Workflow Builder system as implemented in the WhatsApp Commerce Platform.*
