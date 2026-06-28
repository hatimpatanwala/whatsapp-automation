import { QueryRunner } from 'typeorm';

export interface TenantMigration {
  name: string;
  up: (queryRunner: QueryRunner, schema: string) => Promise<void>;
  down: (queryRunner: QueryRunner, schema: string) => Promise<void>;
}

const migration001Users: TenantMigration = {
  name: '001_create_users',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'seller',
        language VARCHAR(10) DEFAULT 'en',
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".users CASCADE`);
  },
};

const migration002Customers: TenantMigration = {
  name: '002_create_customers',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255),
        language VARCHAR(10) DEFAULT 'en',
        tags TEXT[] DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        total_orders INT DEFAULT 0,
        total_spent DECIMAL(12,2) DEFAULT 0,
        last_order_at TIMESTAMPTZ,
        opted_in BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_customers_phone ON "${schema}".customers(phone)`);
    await qr.query(`CREATE INDEX idx_customers_tags ON "${schema}".customers USING GIN(tags)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".customers CASCADE`);
  },
};

const migration003Addresses: TenantMigration = {
  name: '003_create_addresses',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES "${schema}".customers(id) ON DELETE CASCADE,
        label VARCHAR(50) DEFAULT 'home',
        full_address TEXT NOT NULL,
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(10),
        landmark VARCHAR(255),
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_addresses_customer ON "${schema}".addresses(customer_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".addresses CASCADE`);
  },
};

const migration004Categories: TenantMigration = {
  name: '004_create_categories',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        parent_id UUID REFERENCES "${schema}".categories(id),
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        translations JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".categories CASCADE`);
  },
};

const migration005Products: TenantMigration = {
  name: '005_create_products',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES "${schema}".categories(id),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL,
        sale_price DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'INR',
        images TEXT[] DEFAULT '{}',
        thumbnail VARCHAR(500),
        has_variants BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        sort_order INT DEFAULT 0,
        translations JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_products_category ON "${schema}".products(category_id)`);
    await qr.query(`CREATE INDEX idx_products_active ON "${schema}".products(is_active) WHERE is_active = true`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".products CASCADE`);
  },
};

const migration006ProductVariants: TenantMigration = {
  name: '006_create_product_variants',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        sku VARCHAR(100) UNIQUE,
        name VARCHAR(255) NOT NULL,
        attributes JSONB NOT NULL DEFAULT '{}',
        price DECIMAL(10,2) NOT NULL,
        image VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_variants_product ON "${schema}".product_variants(product_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".product_variants CASCADE`);
  },
};

const migration007Inventory: TenantMigration = {
  name: '007_create_inventory',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
        stock_quantity INT NOT NULL DEFAULT 0,
        reserved_quantity INT NOT NULL DEFAULT 0,
        low_stock_threshold INT DEFAULT 5,
        track_inventory BOOLEAN DEFAULT true,
        version INT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_inventory_product_variant UNIQUE (product_id, variant_id),
        CONSTRAINT chk_stock_non_negative CHECK (stock_quantity >= 0),
        CONSTRAINT chk_reserved_non_negative CHECK (reserved_quantity >= 0),
        CONSTRAINT chk_reserved_lte_stock CHECK (reserved_quantity <= stock_quantity)
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".inventory CASCADE`);
  },
};

const migration008StockReservations: TenantMigration = {
  name: '008_create_stock_reservations',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".stock_reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID REFERENCES "${schema}".inventory(id) ON DELETE CASCADE,
        order_id UUID,
        cart_id UUID,
        customer_id UUID REFERENCES "${schema}".customers(id),
        quantity INT NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_reservations_expires ON "${schema}".stock_reservations(expires_at) WHERE status = 'active'`);
    await qr.query(`CREATE INDEX idx_reservations_inventory ON "${schema}".stock_reservations(inventory_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".stock_reservations CASCADE`);
  },
};

const migration009Carts: TenantMigration = {
  name: '009_create_carts',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".carts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES "${schema}".customers(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'active',
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX idx_carts_active_customer ON "${schema}".carts(customer_id) WHERE status = 'active'`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".carts CASCADE`);
  },
};

const migration010CartItems: TenantMigration = {
  name: '010_create_cart_items',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".cart_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cart_id UUID REFERENCES "${schema}".carts(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schema}".products(id),
        variant_id UUID REFERENCES "${schema}".product_variants(id),
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        reservation_id UUID REFERENCES "${schema}".stock_reservations(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".cart_items CASCADE`);
  },
};

const migration011Orders: TenantMigration = {
  name: '011_create_orders',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number VARCHAR(20) UNIQUE NOT NULL,
        customer_id UUID REFERENCES "${schema}".customers(id),
        address_id UUID REFERENCES "${schema}".addresses(id),
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        subtotal DECIMAL(12,2) NOT NULL,
        discount DECIMAL(10,2) DEFAULT 0,
        delivery_fee DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(12,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',
        notes TEXT,
        cancelled_reason TEXT,
        placed_at TIMESTAMPTZ DEFAULT NOW(),
        confirmed_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_orders_customer ON "${schema}".orders(customer_id)`);
    await qr.query(`CREATE INDEX idx_orders_status ON "${schema}".orders(status)`);
    await qr.query(`CREATE INDEX idx_orders_placed ON "${schema}".orders(placed_at DESC)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".orders CASCADE`);
  },
};

const migration012OrderItems: TenantMigration = {
  name: '012_create_order_items',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES "${schema}".orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schema}".products(id),
        variant_id UUID REFERENCES "${schema}".product_variants(id),
        product_name VARCHAR(255) NOT NULL,
        variant_name VARCHAR(255),
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".order_items CASCADE`);
  },
};

const migration013Payments: TenantMigration = {
  name: '013_create_payments',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES "${schema}".orders(id),
        method VARCHAR(30) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',
        upi_id VARCHAR(255),
        qr_code_url VARCHAR(500),
        proof_image_url VARCHAR(500),
        transaction_ref VARCHAR(255),
        verified_by UUID REFERENCES "${schema}".users(id),
        verified_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_payments_order ON "${schema}".payments(order_id)`);
    await qr.query(`CREATE INDEX idx_payments_status ON "${schema}".payments(status) WHERE status = 'pending'`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".payments CASCADE`);
  },
};

const migration014Deliveries: TenantMigration = {
  name: '014_create_deliveries',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES "${schema}".orders(id),
        provider_type VARCHAR(30) DEFAULT 'self_managed',
        provider_name VARCHAR(100),
        tracking_id VARCHAR(255),
        tracking_url VARCHAR(500),
        assigned_to VARCHAR(255),
        status VARCHAR(30) DEFAULT 'pending',
        estimated_delivery TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        proof_image_url VARCHAR(500),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_deliveries_order ON "${schema}".deliveries(order_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".deliveries CASCADE`);
  },
};

const migration015Conversations: TenantMigration = {
  name: '015_create_conversations',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES "${schema}".customers(id),
        phone VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        last_message_at TIMESTAMPTZ,
        context JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_conversations_customer ON "${schema}".conversations(customer_id)`);
    await qr.query(`CREATE INDEX idx_conversations_phone ON "${schema}".conversations(phone)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".conversations CASCADE`);
  },
};

const migration016Messages: TenantMigration = {
  name: '016_create_messages',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES "${schema}".conversations(id),
        wa_message_id VARCHAR(255) UNIQUE,
        direction VARCHAR(10) NOT NULL,
        type VARCHAR(30) NOT NULL,
        content JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'sent',
        error JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_messages_conversation ON "${schema}".messages(conversation_id)`);
    await qr.query(`CREATE INDEX idx_messages_wa_id ON "${schema}".messages(wa_message_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".messages CASCADE`);
  },
};

const migration017WebhookEvents: TenantMigration = {
  name: '017_create_webhook_events',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'processed',
        processed_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_webhook_events_event_id ON "${schema}".webhook_events(event_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".webhook_events CASCADE`);
  },
};

const migration018Campaigns: TenantMigration = {
  name: '018_create_campaigns',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        template_id UUID,
        segment_id UUID,
        status VARCHAR(20) DEFAULT 'draft',
        scheduled_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        total_recipients INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        delivered_count INT DEFAULT 0,
        read_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".campaigns CASCADE`);
  },
};

const migration019CampaignSegments: TenantMigration = {
  name: '019_create_campaign_segments',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".campaign_segments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        rules JSONB NOT NULL,
        customer_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".campaign_segments CASCADE`);
  },
};

const migration020Templates: TenantMigration = {
  name: '020_create_templates',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_template_name VARCHAR(255) NOT NULL,
        language VARCHAR(10) NOT NULL,
        category VARCHAR(50),
        components JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".templates CASCADE`);
  },
};

const migration021Settings: TenantMigration = {
  name: '021_create_settings',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Seed default settings
    await qr.query(`
      INSERT INTO "${schema}".settings (key, value) VALUES
        ('business_name', '"My Store"'),
        ('default_language', '"en"'),
        ('currency', '"INR"'),
        ('auto_reply_enabled', 'true'),
        ('reservation_ttl_minutes', '15'),
        ('payment_expiry_minutes', '30'),
        ('upi_ids', '[]'),
        ('business_hours', '{"start": "09:00", "end": "21:00", "timezone": "Asia/Kolkata"}'),
        ('commerce_catalog_enabled', 'false'),
        ('commerce_cart_enabled', 'true'),
        ('commerce_order_enabled', 'true'),
        ('commerce_catalog_id', '""'),
        ('commerce_auto_checkout', 'false'),
        ('commerce_order_notification', 'true')
      ON CONFLICT (key) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".settings CASCADE`);
  },
};

const migration022Workflows: TenantMigration = {
  name: '022_create_workflows',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".workflows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        trigger JSONB NOT NULL DEFAULT '{}',
        nodes JSONB NOT NULL DEFAULT '[]',
        edges JSONB NOT NULL DEFAULT '[]',
        version INT NOT NULL DEFAULT 1,
        execution_count INT DEFAULT 0,
        last_executed_at TIMESTAMPTZ,
        created_by UUID REFERENCES "${schema}".users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_workflows_status ON "${schema}".workflows(status)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".workflows CASCADE`);
  },
};

const migration023WorkflowExecutions: TenantMigration = {
  name: '023_create_workflow_executions',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".workflow_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID REFERENCES "${schema}".workflows(id) ON DELETE CASCADE,
        triggered_by VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        steps_executed INT DEFAULT 0,
        error_message TEXT,
        context JSONB DEFAULT '{}',
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_wf_executions_workflow ON "${schema}".workflow_executions(workflow_id)`);
    await qr.query(`CREATE INDEX idx_wf_executions_status ON "${schema}".workflow_executions(status)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".workflow_executions CASCADE`);
  },
};

const migration024WorkflowEngine: TenantMigration = {
  name: '024_workflow_execution_engine',
  async up(qr, schema) {
    // Add execution tracking columns to workflow_executions
    await qr.query(`
      ALTER TABLE "${schema}".workflow_executions
        ADD COLUMN IF NOT EXISTS current_node_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES "${schema}".conversations(id),
        ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
        ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS wait_type VARCHAR(30),
        ADD COLUMN IF NOT EXISTS wait_config JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS resume_job_id VARCHAR(255)
    `);
    // Partial index for fast active-execution lookup by phone
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_wf_exec_active_phone
        ON "${schema}".workflow_executions(customer_phone, status)
        WHERE status IN ('running', 'waiting')
    `);
    // Partial index for lookup by conversation
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_wf_exec_active_conv
        ON "${schema}".workflow_executions(conversation_id, status)
        WHERE status IN ('running', 'waiting')
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_wf_exec_active_phone`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_wf_exec_active_conv`);
    await qr.query(`
      ALTER TABLE "${schema}".workflow_executions
        DROP COLUMN IF EXISTS current_node_id,
        DROP COLUMN IF EXISTS conversation_id,
        DROP COLUMN IF EXISTS customer_phone,
        DROP COLUMN IF EXISTS variables,
        DROP COLUMN IF EXISTS wait_type,
        DROP COLUMN IF EXISTS wait_config,
        DROP COLUMN IF EXISTS resume_job_id
    `);
  },
};

const migration025UsersPhoneNullable: TenantMigration = {
  name: '025_users_phone_nullable',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".users ALTER COLUMN phone DROP NOT NULL`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".users ALTER COLUMN phone SET NOT NULL`);
  },
};

const migration026PerformanceIndexes: TenantMigration = {
  name: '026_performance_indexes',
  async up(qr, schema) {
    // Messages: status update lookups (called on EVERY webhook)
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_wa_id_status
        ON "${schema}".messages(wa_message_id, status)
    `);
    // Messages: conversation listing (called on every inbox open)
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created
        ON "${schema}".messages(conversation_id, created_at DESC)
    `);
    // Orders: date range queries for analytics
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_placed_status
        ON "${schema}".orders(placed_at DESC, status)
    `);
    // Webhook events: cleanup/archival queries
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_created
        ON "${schema}".webhook_events(created_at)
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_messages_wa_id_status`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_messages_conv_created`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_orders_placed_status`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_webhook_events_created`);
  },
};

const migration027WorkflowLastActivity: TenantMigration = {
  name: '027_workflow_execution_last_activity',
  async up(qr, schema) {
    await qr.query(`
      ALTER TABLE "${schema}".workflow_executions
        ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW()
    `);
  },
  async down(qr, schema) {
    await qr.query(`
      ALTER TABLE "${schema}".workflow_executions
        DROP COLUMN IF EXISTS last_activity_at
    `);
  },
};

const migration028CommerceSettings: TenantMigration = {
  name: '028_commerce_settings',
  async up(qr, schema) {
    await qr.query(`
      INSERT INTO "${schema}".settings (key, value) VALUES
        ('commerce_catalog_enabled', 'false'),
        ('commerce_cart_enabled', 'true'),
        ('commerce_order_enabled', 'true'),
        ('commerce_catalog_id', '""'),
        ('commerce_auto_checkout', 'false'),
        ('commerce_order_notification', 'true')
      ON CONFLICT (key) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(`
      DELETE FROM "${schema}".settings WHERE key IN (
        'commerce_catalog_enabled', 'commerce_cart_enabled', 'commerce_order_enabled',
        'commerce_catalog_id', 'commerce_auto_checkout', 'commerce_order_notification'
      )
    `);
  },
};

const migration029CatalogCommerceExtension: TenantMigration = {
  name: '029_catalog_commerce_extension',
  async up(qr, schema) {
    // ─── product_sync_status: per-product Meta sync tracking ─────────
    await qr.query(`
      CREATE TABLE "${schema}".product_sync_status (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        meta_retailer_id VARCHAR(255),
        meta_product_id VARCHAR(50),
        sync_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        last_synced_at TIMESTAMPTZ,
        last_sync_error TEXT,
        retry_count INT DEFAULT 0,
        content_hash VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_product_sync_product UNIQUE (product_id)
      )
    `);
    await qr.query(`CREATE INDEX idx_product_sync_status ON "${schema}".product_sync_status(sync_status)`);
    await qr.query(`CREATE INDEX idx_product_sync_retailer ON "${schema}".product_sync_status(meta_retailer_id)`);

    // ─── catalog_collections: product groupings for WhatsApp ─────────
    await qr.query(`
      CREATE TABLE "${schema}".catalog_collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        image_url VARCHAR(500),
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─── catalog_collection_products: many-to-many ───────────────────
    await qr.query(`
      CREATE TABLE "${schema}".catalog_collection_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL REFERENCES "${schema}".catalog_collections(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_collection_product UNIQUE (collection_id, product_id)
      )
    `);
    await qr.query(`CREATE INDEX idx_coll_products_collection ON "${schema}".catalog_collection_products(collection_id)`);
    await qr.query(`CREATE INDEX idx_coll_products_product ON "${schema}".catalog_collection_products(product_id)`);

    // ─── catalog_media: media assets for products ────────────────────
    await qr.query(`
      CREATE TABLE "${schema}".catalog_media (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        original_url VARCHAR(1000) NOT NULL,
        cdn_url VARCHAR(1000),
        media_type VARCHAR(30) NOT NULL DEFAULT 'image',
        file_size INT,
        width INT,
        height INT,
        content_hash VARCHAR(64),
        upload_status VARCHAR(30) DEFAULT 'pending',
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_catalog_media_product ON "${schema}".catalog_media(product_id)`);
    await qr.query(`CREATE INDEX idx_catalog_media_hash ON "${schema}".catalog_media(content_hash) WHERE content_hash IS NOT NULL`);

    // ─── Extended commerce settings ──────────────────────────────────
    await qr.query(`
      INSERT INTO "${schema}".settings (key, value) VALUES
        ('commerce_collections_enabled', 'false'),
        ('commerce_product_messages_enabled', 'true'),
        ('commerce_auto_sync', 'true'),
        ('commerce_sync_interval_minutes', '60'),
        ('commerce_catalog_status', '"not_provisioned"')
      ON CONFLICT (key) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".catalog_collection_products CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".catalog_collections CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".catalog_media CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".product_sync_status CASCADE`);
    await qr.query(`
      DELETE FROM "${schema}".settings WHERE key IN (
        'commerce_collections_enabled', 'commerce_product_messages_enabled',
        'commerce_auto_sync', 'commerce_sync_interval_minutes', 'commerce_catalog_status'
      )
    `);
  },
};

const migration030Quotes: TenantMigration = {
  name: '030_create_quotes',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE "${schema}".quotes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_number VARCHAR(20) UNIQUE NOT NULL,
        quote_number_seq INT NOT NULL DEFAULT 1,
        customer_id UUID REFERENCES "${schema}".customers(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        notes TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        tax_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        valid_until TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        accepted_at TIMESTAMPTZ,
        converted_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT chk_quote_status CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'))
      )
    `);
    await qr.query(`CREATE INDEX idx_quotes_customer ON "${schema}".quotes(customer_id)`);
    await qr.query(`CREATE INDEX idx_quotes_status ON "${schema}".quotes(status)`);
    await qr.query(`CREATE INDEX idx_quotes_created ON "${schema}".quotes(created_at DESC)`);

    await qr.query(`
      CREATE TABLE "${schema}".quote_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_id UUID NOT NULL REFERENCES "${schema}".quotes(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schema}".products(id) ON DELETE SET NULL,
        description VARCHAR(500) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_quote_items_quote ON "${schema}".quote_items(quote_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".quote_items CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".quotes CASCADE`);
  },
};

const migration031WorkflowAudience: TenantMigration = {
  name: '031_workflow_audience',
  async up(qr, schema) {
    await qr.query(`
      ALTER TABLE "${schema}".workflows
        ADD COLUMN IF NOT EXISTS audience VARCHAR(20) DEFAULT 'customer'
    `);
  },
  async down(qr, schema) {
    await qr.query(`
      ALTER TABLE "${schema}".workflows
        DROP COLUMN IF EXISTS audience
    `);
  },
};

const migration032Invoices: TenantMigration = {
  name: '032_invoices_and_gst',
  async up(qr, schema) {
    // Per-product GST + billable/non-billable stock classification.
    await qr.query(`
      ALTER TABLE "${schema}".products
        ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(15),
        ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT true
    `);

    // Invoices / bills of supply / delivery challans.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES "${schema}".orders(id) ON DELETE SET NULL,
        invoice_number VARCHAR(40) UNIQUE NOT NULL,
        doc_type VARCHAR(20) NOT NULL DEFAULT 'tax_invoice',
        customer_id UUID,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(20),
        seller_gstin VARCHAR(20),
        buyer_gstin VARCHAR(20),
        place_of_supply VARCHAR(80),
        is_interstate BOOLEAN DEFAULT false,
        subtotal DECIMAL(12,2) DEFAULT 0,
        discount DECIMAL(12,2) DEFAULT 0,
        taxable_value DECIMAL(12,2) DEFAULT 0,
        cgst DECIMAL(12,2) DEFAULT 0,
        sgst DECIMAL(12,2) DEFAULT 0,
        igst DECIMAL(12,2) DEFAULT 0,
        total_tax DECIMAL(12,2) DEFAULT 0,
        round_off DECIMAL(6,2) DEFAULT 0,
        total DECIMAL(12,2) DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'INR',
        items JSONB DEFAULT '[]',
        notes TEXT,
        pdf_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'issued',
        issued_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_invoices_order ON "${schema}".invoices(order_id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_invoices_issued ON "${schema}".invoices(issued_at DESC)`);

    // Invoice / GST settings defaults.
    await qr.query(`
      INSERT INTO "${schema}".settings (key, value) VALUES
        ('invoice_enabled', 'true'),
        ('invoice_legal_name', '""'),
        ('invoice_gstin', '""'),
        ('invoice_address', '""'),
        ('invoice_state', '""'),
        ('invoice_state_code', '""'),
        ('invoice_prefix', '"INV"'),
        ('invoice_default_doc_type', '"tax_invoice"')
      ON CONFLICT (key) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".invoices CASCADE`);
    await qr.query(`ALTER TABLE "${schema}".products DROP COLUMN IF EXISTS hsn_code, DROP COLUMN IF EXISTS gst_rate, DROP COLUMN IF EXISTS is_billable`);
  },
};

// Social login/signup (Google + Meta): users may have no password and originate
// from an OAuth provider. Make password_hash optional and track the provider.
const migration033SocialAuth: TenantMigration = {
  name: '033_social_auth',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".users ALTER COLUMN password_hash DROP NOT NULL`);
    await qr.query(`
      ALTER TABLE "${schema}".users
        ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'password',
        ADD COLUMN IF NOT EXISTS provider_user_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512),
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false
    `);
    // One identity per (provider, provider_user_id).
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_provider_uid_uniq
        ON "${schema}".users (auth_provider, provider_user_id)
        WHERE provider_user_id IS NOT NULL
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP INDEX IF EXISTS "${schema}".users_provider_uid_uniq`);
    await qr.query(`
      ALTER TABLE "${schema}".users
        DROP COLUMN IF EXISTS auth_provider,
        DROP COLUMN IF EXISTS provider_user_id,
        DROP COLUMN IF EXISTS avatar_url,
        DROP COLUMN IF EXISTS email_verified
    `);
  },
};

const migration034Brands: TenantMigration = {
  name: '034_create_brands',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".brands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        description TEXT,
        logo_url VARCHAR(500),
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        translations JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_uniq ON "${schema}".brands (slug)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".brands CASCADE`);
  },
};

const migration035ProductBrand: TenantMigration = {
  name: '035_add_brand_to_products',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES "${schema}".brands(id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_products_brand ON "${schema}".products (brand_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_products_brand`);
    await qr.query(`ALTER TABLE "${schema}".products DROP COLUMN IF EXISTS brand_id`);
  },
};

const migration036SystemWorkflows: TenantMigration = {
  name: '036_workflow_is_system',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".workflows ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".workflows DROP COLUMN IF EXISTS is_system`);
  },
};

const migration037WorkflowMenuItem: TenantMigration = {
  name: '037_workflow_menu_item',
  async up(qr, schema) {
    // When set, a workflow appears in the Welcome hub's dynamic menu: { label, order }.
    await qr.query(`ALTER TABLE "${schema}".workflows ADD COLUMN IF NOT EXISTS menu_item JSONB`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".workflows DROP COLUMN IF EXISTS menu_item`);
  },
};

const migration038OrderTax: TenantMigration = {
  name: '038_order_tax_amount',
  async up(qr, schema) {
    // Tax (GST) total for an order — so the order summary can show Subtotal,
    // Tax, Discount, Delivery, Total consistently (quotes already have tax_amount).
    await qr.query(`ALTER TABLE "${schema}".orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) DEFAULT 0`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".orders DROP COLUMN IF EXISTS tax_amount`);
  },
};

const migration039ProductUom: TenantMigration = {
  name: '039_product_uom',
  async up(qr, schema) {
    // Unit of measurement (compulsory) — NOT NULL DEFAULT backfills every
    // existing product with 'pcs'. New products must provide one (form-enforced).
    await qr.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS uom VARCHAR(20) NOT NULL DEFAULT 'pcs'`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".products DROP COLUMN IF EXISTS uom`);
  },
};

const migration040Schemes: TenantMigration = {
  name: '040_schemes',
  async up(qr, schema) {
    // Promotions / offers / loyalty schemes.
    //  type:   'instant' (applied at cart) | 'cumulative' (loyalty target → reward)
    //  action: 'discount' | 'buy_x_get_y_free' | 'buy_x_get_x_free' | 'qty_discount' | 'gift'
    //  scope:  'all' | 'category' | 'brand' | 'product'  (+ scope_ids)
    //  conditions JSONB: { discountType:'percent'|'amount', discountValue, buyQty, getQty,
    //                      getProductId, minQty, minCartValue, targetType, targetValue, period }
    //  weight (priority, higher wins among non-combinable) + combinable (can stack).
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".schemes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        description TEXT,
        type VARCHAR(20) NOT NULL DEFAULT 'instant',
        action VARCHAR(30) NOT NULL DEFAULT 'discount',
        scope VARCHAR(20) NOT NULL DEFAULT 'all',
        scope_ids UUID[] NOT NULL DEFAULT '{}',
        conditions JSONB NOT NULL DEFAULT '{}',
        reward JSONB NOT NULL DEFAULT '{}',
        weight INTEGER NOT NULL DEFAULT 0,
        combinable BOOLEAN NOT NULL DEFAULT false,
        audience VARCHAR(20) NOT NULL DEFAULT 'all',
        valid_from TIMESTAMPTZ,
        valid_until TIMESTAMPTZ,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_schemes_status ON "${schema}".schemes (status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_schemes_scope ON "${schema}".schemes USING GIN (scope_ids)`);

    // Per-customer targeting (audience = 'specific').
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".scheme_customers (
        scheme_id UUID NOT NULL REFERENCES "${schema}".schemes(id) ON DELETE CASCADE,
        customer_id UUID NOT NULL,
        PRIMARY KEY (scheme_id, customer_id)
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".scheme_customers CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".schemes CASCADE`);
  },
};

const migration041Coupons: TenantMigration = {
  name: '041_coupons',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".coupons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(40) NOT NULL,
        description TEXT,
        discount_type VARCHAR(10) NOT NULL DEFAULT 'percent',
        discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        min_cart_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        max_discount NUMERIC(12,2),
        scope VARCHAR(20) NOT NULL DEFAULT 'all',
        scope_ids UUID[] NOT NULL DEFAULT '{}',
        usage_limit INTEGER,
        per_customer_limit INTEGER NOT NULL DEFAULT 1,
        used_count INTEGER NOT NULL DEFAULT 0,
        audience VARCHAR(20) NOT NULL DEFAULT 'all',
        valid_from TIMESTAMPTZ,
        valid_until TIMESTAMPTZ,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_uniq ON "${schema}".coupons (UPPER(code))`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".coupon_customers (
        coupon_id UUID NOT NULL REFERENCES "${schema}".coupons(id) ON DELETE CASCADE,
        customer_id UUID NOT NULL,
        PRIMARY KEY (coupon_id, customer_id)
      )
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".coupon_redemptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coupon_id UUID NOT NULL REFERENCES "${schema}".coupons(id) ON DELETE CASCADE,
        customer_id UUID,
        order_id UUID,
        discount_applied NUMERIC(12,2) DEFAULT 0,
        redeemed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON "${schema}".coupon_redemptions (coupon_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".coupon_redemptions CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".coupon_customers CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".coupons CASCADE`);
  },
};

const migration042Loyalty: TenantMigration = {
  name: '042_loyalty',
  async up(qr, schema) {
    // Per-customer accrual toward each cumulative (loyalty) scheme.
    //  conditions: { metric:'spend'|'orders', target, period:'lifetime'|'monthly', minOrderValue? }
    //  reward:     { type:'coupon', discountType, discountValue, maxDiscount?, validDays? }
    //  period_key: 'lifetime' or 'YYYY-MM' — keeps monthly windows separate.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".loyalty_progress (
        scheme_id UUID NOT NULL REFERENCES "${schema}".schemes(id) ON DELETE CASCADE,
        customer_id UUID NOT NULL,
        period_key VARCHAR(16) NOT NULL DEFAULT 'lifetime',
        progress NUMERIC(14,2) NOT NULL DEFAULT 0,
        awards INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (scheme_id, customer_id, period_key)
      )
    `);

    // One order accrues at most once per scheme (idempotent re-delivery guard).
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".loyalty_accruals (
        scheme_id UUID NOT NULL REFERENCES "${schema}".schemes(id) ON DELETE CASCADE,
        order_id UUID NOT NULL,
        customer_id UUID NOT NULL,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (scheme_id, order_id)
      )
    `);

    // Every reward granted to a customer (for history + the WhatsApp message).
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".scheme_awards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scheme_id UUID NOT NULL REFERENCES "${schema}".schemes(id) ON DELETE CASCADE,
        customer_id UUID NOT NULL,
        order_id UUID,
        period_key VARCHAR(16) NOT NULL DEFAULT 'lifetime',
        reward JSONB NOT NULL DEFAULT '{}',
        coupon_id UUID,
        coupon_code VARCHAR(40),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_scheme_awards_customer ON "${schema}".scheme_awards (customer_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".scheme_awards CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".loyalty_accruals CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".loyalty_progress CASCADE`);
  },
};

const migration043CustomerProfile: TenantMigration = {
  name: '043_customer_profile',
  async up(qr, schema) {
    // Editable profile fields: a friendly display name / nickname, email, notes.
    await qr.query(`ALTER TABLE "${schema}".customers ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`);
    await qr.query(`ALTER TABLE "${schema}".customers ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
    await qr.query(`ALTER TABLE "${schema}".customers ADD COLUMN IF NOT EXISTS notes TEXT`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".customers DROP COLUMN IF EXISTS display_name`);
    await qr.query(`ALTER TABLE "${schema}".customers DROP COLUMN IF EXISTS email`);
    await qr.query(`ALTER TABLE "${schema}".customers DROP COLUMN IF EXISTS notes`);
  },
};

export const tenantMigrations: TenantMigration[] = [
  migration001Users,
  migration002Customers,
  migration003Addresses,
  migration004Categories,
  migration005Products,
  migration006ProductVariants,
  migration007Inventory,
  migration008StockReservations,
  migration009Carts,
  migration010CartItems,
  migration011Orders,
  migration012OrderItems,
  migration013Payments,
  migration014Deliveries,
  migration015Conversations,
  migration016Messages,
  migration017WebhookEvents,
  migration018Campaigns,
  migration019CampaignSegments,
  migration020Templates,
  migration021Settings,
  migration022Workflows,
  migration023WorkflowExecutions,
  migration024WorkflowEngine,
  migration025UsersPhoneNullable,
  migration026PerformanceIndexes,
  migration027WorkflowLastActivity,
  migration028CommerceSettings,
  migration029CatalogCommerceExtension,
  migration030Quotes,
  migration031WorkflowAudience,
  migration032Invoices,
  migration033SocialAuth,
  migration034Brands,
  migration035ProductBrand,
  migration036SystemWorkflows,
  migration037WorkflowMenuItem,
  migration038OrderTax,
  migration039ProductUom,
  migration040Schemes,
  migration041Coupons,
  migration042Loyalty,
  migration043CustomerProfile,
];
