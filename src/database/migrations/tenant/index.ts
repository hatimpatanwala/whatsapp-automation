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

const migration044AudienceSegment: TenantMigration = {
  name: '044_audience_segment',
  async up(qr, schema) {
    // Schemes/coupons can target a dynamic customer segment (audience='segment').
    await qr.query(`ALTER TABLE "${schema}".schemes ADD COLUMN IF NOT EXISTS audience_segment VARCHAR(30)`);
    await qr.query(`ALTER TABLE "${schema}".coupons ADD COLUMN IF NOT EXISTS audience_segment VARCHAR(30)`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".schemes DROP COLUMN IF EXISTS audience_segment`);
    await qr.query(`ALTER TABLE "${schema}".coupons DROP COLUMN IF EXISTS audience_segment`);
  },
};

const migration045CustomFields: TenantMigration = {
  name: '045_custom_fields',
  async up(qr, schema) {
    // Admin-defined custom fields for customers and products. Values are stored
    // in a `custom_fields` JSONB on the entity, keyed by field_key — additive,
    // so nothing existing changes. Customer fields double as workflow variables.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".custom_field_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity VARCHAR(20) NOT NULL,                 -- 'customer' | 'product'
        field_key VARCHAR(64) NOT NULL,              -- slug used as the variable key
        label VARCHAR(120) NOT NULL,
        field_type VARCHAR(20) NOT NULL DEFAULT 'text', -- text|textarea|number|date|select|boolean|phone|email
        options JSONB DEFAULT '[]',                  -- choices for 'select'
        placeholder VARCHAR(160),
        help_text VARCHAR(255),
        is_required BOOLEAN DEFAULT false,           -- (customer) gate workflows until collected
        collect_from_customer BOOLEAN DEFAULT false, -- show on the customer onboarding webview
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS cfd_entity_key_uniq ON "${schema}".custom_field_definitions (entity, field_key)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_cfd_entity ON "${schema}".custom_field_definitions (entity, is_active)`);
    await qr.query(`ALTER TABLE "${schema}".customers ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'`);
    await qr.query(`ALTER TABLE "${schema}".products  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".products  DROP COLUMN IF EXISTS custom_fields`);
    await qr.query(`ALTER TABLE "${schema}".customers DROP COLUMN IF EXISTS custom_fields`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".custom_field_definitions CASCADE`);
  },
};

// ─── ERP foundation ─────────────────────────────────────────────────────────
// Premium ERP/CRM layer (IDURAR feature parity). Additive only: this migration
// creates the per-tenant document numbering table used by ERP documents
// (invoices, quotes, offers, supplier orders, payment receipts) and seeds ERP
// settings defaults. It does NOT alter or gate any existing table — the ERP
// becomes visible per-tenant purely via the subscription plan's `features.erp`
// flag, so running this on every tenant schema is safe and breaks nothing.
const migration046ErpSequences: TenantMigration = {
  name: '046_erp_sequences',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".erp_sequences (
        doc_type VARCHAR(40) NOT NULL,
        year INT NOT NULL,
        last_number INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (doc_type, year)
      )
    `);
    // ERP provisioning marker + defaults, stored in the existing settings KV table.
    // 'erp_provisioned' flips to true the first time the tenant's ERP is enabled;
    // it gates one-time seeding/backfill so re-enabling after a downgrade is instant.
    await qr.query(`
      INSERT INTO "${schema}".settings (key, value) VALUES
        ('erp_provisioned', 'false'),
        ('erp_currency', '"INR"'),
        ('erp_default_tax_rate', '0'),
        ('erp_invoice_prefix', '"INV"'),
        ('erp_quote_prefix', '"QUO"'),
        ('erp_offer_prefix', '"OFR"')
      ON CONFLICT (key) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".erp_sequences CASCADE`);
    await qr.query(`
      DELETE FROM "${schema}".settings WHERE key IN (
        'erp_provisioned', 'erp_currency', 'erp_default_tax_rate',
        'erp_invoice_prefix', 'erp_quote_prefix', 'erp_offer_prefix'
      )
    `);
  },
};

// ─── ERP Phase 1: Invoicing core (AR) ────────────────────────────────────────
// Extends the EXISTING GST `invoices` table (mig 032) and order/UPI `payments`
// table (mig 013) for standalone accounts-receivable: amount paid, balance due,
// payment status, due date — plus a `payment_modes` reference table. All columns
// are nullable/defaulted and additive, so existing invoice/payment flows are
// untouched. ERP visibility remains purely plan-gated (`features.erp`).
const migration047ErpInvoicingCore: TenantMigration = {
  name: '047_erp_invoicing_core',
  async up(qr, schema) {
    // AR tracking on invoices (existing table keeps `items` JSONB, totals, GST).
    await qr.query(`
      ALTER TABLE "${schema}".invoices
        ADD COLUMN IF NOT EXISTS year INT,
        ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
        ADD COLUMN IF NOT EXISTS note TEXT
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_payment_status
        ON "${schema}".invoices(payment_status)
    `);

    // Payment modes (Cash / UPI / Bank Transfer / …) — IDURAR PaymentMode.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".payment_modes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        ref VARCHAR(100),
        is_default BOOLEAN NOT NULL DEFAULT false,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Link payments to an invoice + payment mode for AR reconciliation
    // (existing order/UPI columns stay; both order_id and invoice_id are nullable).
    await qr.query(`
      ALTER TABLE "${schema}".payments
        ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES "${schema}".invoices(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS payment_mode_id UUID REFERENCES "${schema}".payment_modes(id),
        ADD COLUMN IF NOT EXISTS ref VARCHAR(100),
        ADD COLUMN IF NOT EXISTS description TEXT
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_invoice ON "${schema}".payments(invoice_id)
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_payments_invoice`);
    await qr.query(`
      ALTER TABLE "${schema}".payments
        DROP COLUMN IF EXISTS invoice_id,
        DROP COLUMN IF EXISTS payment_mode_id,
        DROP COLUMN IF EXISTS ref,
        DROP COLUMN IF EXISTS description
    `);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".payment_modes CASCADE`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_invoices_payment_status`);
    await qr.query(`
      ALTER TABLE "${schema}".invoices
        DROP COLUMN IF EXISTS year,
        DROP COLUMN IF EXISTS due_date,
        DROP COLUMN IF EXISTS amount_paid,
        DROP COLUMN IF EXISTS balance_due,
        DROP COLUMN IF EXISTS payment_status,
        DROP COLUMN IF EXISTS note
    `);
  },
};

// ─── ERP Phase 2: CRM (clients, leads, offers) ───────────────────────────────
const migration048ErpCrm: TenantMigration = {
  name: '048_erp_crm',
  async up(qr, schema) {
    // Enrich customers with B2B/client fields (additive, nullable).
    await qr.query(`
      ALTER TABLE "${schema}".customers
        ADD COLUMN IF NOT EXISTS company VARCHAR(255),
        ADD COLUMN IF NOT EXISTS gstin VARCHAR(20),
        ADD COLUMN IF NOT EXISTS billing_address TEXT,
        ADD COLUMN IF NOT EXISTS is_erp_client BOOLEAN NOT NULL DEFAULT false
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name VARCHAR(120) NOT NULL,
        last_name VARCHAR(120),
        company VARCHAR(255),
        job_title VARCHAR(120),
        email VARCHAR(255),
        phone VARCHAR(20),
        address TEXT,
        country VARCHAR(80),
        source VARCHAR(80),
        status VARCHAR(30) NOT NULL DEFAULT 'new',
        notes TEXT,
        converted_customer_id UUID,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_leads_status ON "${schema}".leads(status) WHERE removed = false`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        offer_number VARCHAR(40) UNIQUE NOT NULL,
        year INT NOT NULL,
        lead_id UUID REFERENCES "${schema}".leads(id) ON DELETE SET NULL,
        title VARCHAR(255),
        subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
        total_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount NUMERIC(14,2) NOT NULL DEFAULT 0,
        total NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'INR',
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        note TEXT,
        valid_until TIMESTAMPTZ,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".offer_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        offer_id UUID NOT NULL REFERENCES "${schema}".offers(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schema}".products(id) ON DELETE SET NULL,
        description VARCHAR(500) NOT NULL,
        quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
        unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
        line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_offer_items_offer ON "${schema}".offer_items(offer_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".offer_items CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".offers CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".leads CASCADE`);
    await qr.query(`ALTER TABLE "${schema}".customers
      DROP COLUMN IF EXISTS company, DROP COLUMN IF EXISTS gstin,
      DROP COLUMN IF EXISTS billing_address, DROP COLUMN IF EXISTS is_erp_client`);
  },
};

// ─── ERP Phase 3: Procurement (suppliers, supplier orders, expenses) ──────────
const migration049ErpProcurement: TenantMigration = {
  name: '049_erp_procurement',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company VARCHAR(255) NOT NULL,
        contact_name VARCHAR(200),
        email VARCHAR(255),
        phone VARCHAR(20),
        gstin VARCHAR(20),
        address TEXT,
        bank_account VARCHAR(120),
        notes TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".expense_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        description TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        ref VARCHAR(100),
        expense_category_id UUID REFERENCES "${schema}".expense_categories(id) ON DELETE SET NULL,
        supplier_id UUID REFERENCES "${schema}".suppliers(id) ON DELETE SET NULL,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        total NUMERIC(14,2) NOT NULL DEFAULT 0,
        payment_mode_id UUID REFERENCES "${schema}".payment_modes(id),
        expense_date TIMESTAMPTZ DEFAULT NOW(),
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_expenses_category ON "${schema}".expenses(expense_category_id) WHERE removed = false`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".supplier_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number VARCHAR(40) UNIQUE NOT NULL,
        year INT NOT NULL,
        supplier_id UUID REFERENCES "${schema}".suppliers(id) ON DELETE SET NULL,
        subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
        total_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount NUMERIC(14,2) NOT NULL DEFAULT 0,
        total NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'INR',
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
        note TEXT,
        expected_date TIMESTAMPTZ,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".supplier_order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_order_id UUID NOT NULL REFERENCES "${schema}".supplier_orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schema}".products(id) ON DELETE SET NULL,
        description VARCHAR(500) NOT NULL,
        quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
        unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
        line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_so_items_order ON "${schema}".supplier_order_items(supplier_order_id)`);

    // Optional ERP product fields tying products to procurement.
    await qr.query(`
      ALTER TABLE "${schema}".products
        ADD COLUMN IF NOT EXISTS sku VARCHAR(100),
        ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES "${schema}".suppliers(id)
    `);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".products DROP COLUMN IF EXISTS sku, DROP COLUMN IF EXISTS cost_price, DROP COLUMN IF EXISTS supplier_id`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".supplier_order_items CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".supplier_orders CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".expenses CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".expense_categories CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".suppliers CASCADE`);
  },
};

// ─── ERP Phase 4: HR (employees) ──────────────────────────────────────────────
const migration050ErpHr: TenantMigration = {
  name: '050_erp_hr',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        surname VARCHAR(150),
        email VARCHAR(255),
        phone VARCHAR(20),
        department VARCHAR(120),
        position VARCHAR(120),
        gender VARCHAR(20),
        birthday DATE,
        address TEXT,
        urgent_contact VARCHAR(120),
        salary NUMERIC(14,2),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".employees CASCADE`);
  },
};

// ─── ERP Phase 6: Enterprise (multi-currency, multi-warehouse, tax rates) ─────
const migration051ErpEnterprise: TenantMigration = {
  name: '051_erp_enterprise',
  async up(qr, schema) {
    // Multi-currency: a table of currencies with exchange rate to the base currency.
    // exchange_rate = how many BASE units equal 1 unit of this currency.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".erp_currencies (
        code VARCHAR(3) PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        symbol VARCHAR(8) NOT NULL DEFAULT '',
        exchange_rate NUMERIC(16,6) NOT NULL DEFAULT 1,
        is_base BOOLEAN NOT NULL DEFAULT false,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Snapshot the rate + base-currency total on invoices for reporting.
    await qr.query(`
      ALTER TABLE "${schema}".invoices
        ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(16,6) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS base_total NUMERIC(16,2)
    `);
    await qr.query(`UPDATE "${schema}".invoices SET base_total = total WHERE base_total IS NULL`);

    // Tax rates (named, reusable on documents).
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".erp_tax_rates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(80) NOT NULL,
        rate NUMERIC(6,4) NOT NULL DEFAULT 0,
        is_default BOOLEAN NOT NULL DEFAULT false,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Multi-warehouse stock.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".erp_warehouses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        code VARCHAR(40),
        address TEXT,
        is_default BOOLEAN NOT NULL DEFAULT false,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".erp_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id UUID NOT NULL REFERENCES "${schema}".erp_warehouses(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
        quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_erp_stock UNIQUE (warehouse_id, product_id, variant_id)
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_erp_stock_product ON "${schema}".erp_stock(product_id)`);
    // Stock movement ledger (adjust / transfer in/out) for auditability.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".erp_stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id UUID NOT NULL REFERENCES "${schema}".erp_warehouses(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        variant_id UUID,
        quantity_delta NUMERIC(14,2) NOT NULL,
        type VARCHAR(20) NOT NULL,
        ref VARCHAR(120),
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_erp_stock_mov_wh ON "${schema}".erp_stock_movements(warehouse_id, created_at DESC)`);

    // Seed base currency from the existing erp_currency setting + ERP company/format settings.
    await qr.query(`
      INSERT INTO "${schema}".erp_currencies (code, name, symbol, exchange_rate, is_base, enabled)
      SELECT
        COALESCE((SELECT value::text FROM "${schema}".settings WHERE key='erp_currency'), '"INR"')::jsonb #>> '{}',
        'Base Currency', '₹', 1, true, true
      WHERE NOT EXISTS (SELECT 1 FROM "${schema}".erp_currencies WHERE is_base = true)
      ON CONFLICT (code) DO NOTHING
    `);
    await qr.query(`
      INSERT INTO "${schema}".settings (key, value) VALUES
        ('erp_base_currency', '"INR"'),
        ('erp_company_name', '""'),
        ('erp_company_email', '""'),
        ('erp_company_phone', '""'),
        ('erp_company_website', '""'),
        ('erp_currency_position', '"before"'),
        ('erp_currency_decimals', '2')
      ON CONFLICT (key) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".erp_stock_movements CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".erp_stock CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".erp_warehouses CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".erp_tax_rates CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".erp_currencies CASCADE`);
    await qr.query(`ALTER TABLE "${schema}".invoices DROP COLUMN IF EXISTS exchange_rate, DROP COLUMN IF EXISTS base_total`);
  },
};

// ─── ERP Phase 7: Enterprise CRM (companies/people), branches, API keys ───────
const migration052ErpEnterprise2: TenantMigration = {
  name: '052_erp_enterprise2',
  async up(qr, schema) {
    // Companies (CRM organisations) + People (contacts under a company) — the
    // IDURAR Enterprise "Companies & Peoples" CRM hierarchy.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        registration_number VARCHAR(80),
        tax_number VARCHAR(40),
        email VARCHAR(255),
        phone VARCHAR(20),
        website VARCHAR(255),
        industry VARCHAR(120),
        address TEXT,
        country VARCHAR(80),
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".people (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES "${schema}".companies(id) ON DELETE SET NULL,
        first_name VARCHAR(120) NOT NULL,
        last_name VARCHAR(120),
        job_title VARCHAR(120),
        email VARCHAR(255),
        phone VARCHAR(20),
        notes TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_people_company ON "${schema}".people(company_id) WHERE removed = false`);

    // Branches (sub-entities within the company — multi-branch operations).
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        code VARCHAR(40),
        manager VARCHAR(150),
        phone VARCHAR(20),
        address TEXT,
        is_default BOOLEAN NOT NULL DEFAULT false,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Developer API keys (only a hash is stored; the raw key is shown once).
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        key_prefix VARCHAR(16) NOT NULL,
        key_hash VARCHAR(255) NOT NULL,
        last_used_at TIMESTAMPTZ,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".api_keys CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".branches CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".people CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".companies CASCADE`);
  },
};

// ─── ERP Phase 8: Vyapar parity (returns, cash & bank, reminders) ─────────────
const migration053ErpVyapar: TenantMigration = {
  name: '053_erp_vyapar',
  async up(qr, schema) {
    // Credit Notes (sale returns) + Debit Notes (purchase returns).
    for (const t of ['credit_notes', 'debit_notes']) {
      const partyCol = t === 'credit_notes'
        ? `customer_id UUID, customer_name VARCHAR(255), customer_phone VARCHAR(20), invoice_id UUID REFERENCES "${schema}".invoices(id) ON DELETE SET NULL,`
        : `supplier_id UUID REFERENCES "${schema}".suppliers(id) ON DELETE SET NULL,`;
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".${t} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          note_number VARCHAR(40) UNIQUE NOT NULL,
          year INT NOT NULL,
          ${partyCol}
          subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
          tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
          total_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
          discount NUMERIC(14,2) NOT NULL DEFAULT 0,
          total NUMERIC(14,2) NOT NULL DEFAULT 0,
          currency VARCHAR(3) DEFAULT 'INR',
          reason TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'issued',
          items JSONB NOT NULL DEFAULT '[]',
          removed BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    }

    // Cash & Bank accounts (money accounts) + link payments to an account.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".bank_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'bank',
        account_number VARCHAR(60),
        bank_name VARCHAR(150),
        opening_balance NUMERIC(16,2) NOT NULL DEFAULT 0,
        current_balance NUMERIC(16,2) NOT NULL DEFAULT 0,
        is_default BOOLEAN NOT NULL DEFAULT false,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`ALTER TABLE "${schema}".payments ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES "${schema}".bank_accounts(id)`);

    // Payment-reminder tracking on invoices.
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ`);
    await qr.query(`
      INSERT INTO "${schema}".settings (key, value) VALUES
        ('erp_auto_reminders', 'false'),
        ('erp_reminder_days_overdue', '0')
      ON CONFLICT (key) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".invoices DROP COLUMN IF EXISTS last_reminder_at`);
    await qr.query(`ALTER TABLE "${schema}".payments DROP COLUMN IF EXISTS bank_account_id`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".bank_accounts CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".debit_notes CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".credit_notes CASCADE`);
  },
};

// ─── ERP Phase 10: batch/serial, recurring invoices, branch tagging ───────────
const migration054ErpAdvanced: TenantMigration = {
  name: '054_erp_advanced',
  async up(qr, schema) {
    // Batch / serial tracking for products. type='batch' (lot with mfg/expiry) or
    // 'serial' (one unit, unique serial). Optional warehouse for stock location.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".product_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        warehouse_id UUID REFERENCES "${schema}".erp_warehouses(id) ON DELETE SET NULL,
        type VARCHAR(10) NOT NULL DEFAULT 'batch',
        batch_number VARCHAR(80),
        serial_number VARCHAR(120),
        mfg_date DATE,
        expiry_date DATE,
        quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
        cost_price NUMERIC(14,2),
        notes TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_batches_product ON "${schema}".product_batches(product_id) WHERE removed = false`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_batches_expiry ON "${schema}".product_batches(expiry_date) WHERE removed = false AND expiry_date IS NOT NULL`);

    // Recurring invoice templates — a cron materialises real invoices from these.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".recurring_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(200),
        customer_id UUID,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(20),
        items JSONB NOT NULL DEFAULT '[]',
        tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
        discount NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'INR',
        frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
        next_run_date DATE NOT NULL,
        last_run_at TIMESTAMPTZ,
        generated_count INT NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT true,
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_recurring_due ON "${schema}".recurring_invoices(next_run_date) WHERE enabled = true AND removed = false`);

    // In-document branch tagging.
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS branch_id UUID`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_invoices_branch ON "${schema}".invoices(branch_id) WHERE branch_id IS NOT NULL`);
  },
  async down(qr, schema) {
    await qr.query(`DROP INDEX IF EXISTS "${schema}".idx_invoices_branch`);
    await qr.query(`ALTER TABLE "${schema}".invoices DROP COLUMN IF EXISTS branch_id`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".recurring_invoices CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".product_batches CASCADE`);
  },
};

// ─── ERP Phase 11: POS (barcode) + e-way bills ───────────────────────────────
const migration055ErpPosEway: TenantMigration = {
  name: '055_erp_pos_eway',
  async up(qr, schema) {
    // Barcode for POS scan-in lookups.
    await qr.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS barcode VARCHAR(64)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON "${schema}".products(barcode) WHERE barcode IS NOT NULL`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_products_sku ON "${schema}".products(sku) WHERE sku IS NOT NULL`);

    // E-way bills (goods transport document) linked to an invoice.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".eway_bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        eway_number VARCHAR(40) UNIQUE NOT NULL,
        invoice_id UUID REFERENCES "${schema}".invoices(id) ON DELETE SET NULL,
        invoice_number VARCHAR(40),
        transport_mode VARCHAR(20) DEFAULT 'road',
        vehicle_number VARCHAR(20),
        transporter VARCHAR(150),
        from_place VARCHAR(120),
        to_place VARCHAR(120),
        distance_km INT,
        value NUMERIC(14,2),
        valid_until TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        removed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_eway_invoice ON "${schema}".eway_bills(invoice_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".eway_bills CASCADE`);
    await qr.query(`ALTER TABLE "${schema}".products DROP COLUMN IF EXISTS barcode`);
  },
};

const migration056TaxRatePercent: TenantMigration = {
  name: '056_tax_rates_as_percent',
  async up(qr, schema) {
    // Tax rates are now entered/stored as a PERCENTAGE (18) instead of a fraction
    // (0.18) — consistent with product gst_rate. Convert any pre-existing fractional
    // rows (0 < rate < 1) to their percentage equivalent. `rate` is a reference value
    // (not used in any tax calculation), so this is a display-only, safe backfill.
    await qr.query(
      `UPDATE "${schema}".erp_tax_rates SET rate = rate * 100, updated_at = NOW() WHERE rate > 0 AND rate < 1`,
    );
  },
  async down() { /* irreversible: cannot reliably tell converted rows apart */ },
};

const migration057AdminNotifications: TenantMigration = {
  name: '057_admin_notifications',
  async up(qr, schema) {
    // In-app admin notification feed (portal bell): new orders, quotes, customers, etc.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".admin_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(40) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body TEXT,
        route VARCHAR(200),
        entity_id UUID,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_admin_notif_created ON "${schema}".admin_notifications (created_at DESC)`);
  },
  async down(qr, schema) { await qr.query(`DROP TABLE IF EXISTS "${schema}".admin_notifications`); },
};

const migration058QuoteItemDiscount: TenantMigration = {
  name: '058_quote_item_discount',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".quote_items ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".quote_items DROP COLUMN IF EXISTS discount`);
  },
};

/**
 * 059 — Offline-sync infrastructure (Phase 2, master-data slice).
 *
 * Installs, per tenant schema, the machinery the desktop app uses to sync a local
 * (embedded-Postgres) copy with the cloud:
 *   - sync columns on each syncable table: updated_at, sync_version, origin_node, deleted_at
 *   - a per-schema monotonic sequence `sync_seq` (all syncable tables share it, so
 *     sync_version is globally ordered within the schema — pull can page across tables)
 *   - `sync_stamp` BEFORE trigger: stamps updated_at + sync_version on writes. When a
 *     remote change is being applied (GUC sync.apply='on') it preserves the incoming
 *     updated_at/origin_node and only re-stamps sync_version in this node's local space.
 *   - `sync_enqueue` AFTER trigger: appends local (non-apply) mutations to `sync_outbox`
 *     so the push loop knows what changed here. Remote-applied rows are NOT enqueued
 *     (prevents echo/ping-pong).
 *   - `sync_outbox` (local change log, push cursor) + `sync_state` (cursors + node id).
 *
 * Idempotent. The syncable table list is mirrored in src/modules/sync/sync.constants.ts.
 */
const SYNC_TABLES_059 = [
  'customers',
  'categories',
  'brands',
  'products',
  'product_variants',
  'suppliers',
  'erp_tax_rates',
  'erp_warehouses',
];

const migration059SyncInfrastructure: TenantMigration = {
  name: '059_sync_infrastructure',
  async up(qr, schema) {
    // Shared monotonic version sequence for this schema.
    await qr.query(`CREATE SEQUENCE IF NOT EXISTS "${schema}".sync_seq`);

    // Local append-only change log (drives the push cursor).
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".sync_outbox (
        id BIGSERIAL PRIMARY KEY,
        table_name TEXT NOT NULL,
        row_id UUID NOT NULL,
        op CHAR(1) NOT NULL,
        sync_version BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Cursors + stable node identity for this database.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".sync_state (
        peer TEXT PRIMARY KEY,
        last_pull_version BIGINT NOT NULL DEFAULT 0,
        last_push_outbox_id BIGINT NOT NULL DEFAULT 0,
        node_id UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`
      INSERT INTO "${schema}".sync_state (peer, node_id)
      VALUES ('_self', gen_random_uuid())
      ON CONFLICT (peer) DO NOTHING
    `);

    // Trigger functions (schema-specific, so the schema is baked in).
    await qr.query(`
      CREATE OR REPLACE FUNCTION "${schema}".sync_stamp() RETURNS trigger AS $$
      BEGIN
        IF current_setting('sync.apply', true) = 'on' THEN
          NEW.sync_version := nextval('"${schema}".sync_seq');
        ELSE
          NEW.updated_at := NOW();
          NEW.sync_version := nextval('"${schema}".sync_seq');
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql
    `);
    await qr.query(`
      CREATE OR REPLACE FUNCTION "${schema}".sync_enqueue() RETURNS trigger AS $$
      BEGIN
        -- Skip echo of remote-applied changes.
        IF current_setting('sync.apply', true) = 'on' THEN RETURN NULL; END IF;
        -- Only local nodes accumulate an outbox to push; the cloud never does
        -- (it is set via ALTER DATABASE ... SET sync.role='node' on desktop installs).
        IF current_setting('sync.role', true) IS DISTINCT FROM 'node' THEN RETURN NULL; END IF;
        IF TG_OP = 'DELETE' THEN
          INSERT INTO "${schema}".sync_outbox(table_name, row_id, op, sync_version)
            VALUES (TG_TABLE_NAME, OLD.id, 'D', nextval('"${schema}".sync_seq'));
        ELSE
          INSERT INTO "${schema}".sync_outbox(table_name, row_id, op, sync_version)
            VALUES (TG_TABLE_NAME, NEW.id, CASE WHEN TG_OP='INSERT' THEN 'I' ELSE 'U' END, NEW.sync_version);
        END IF;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql
    `);

    for (const t of SYNC_TABLES_059) {
      const exists = await qr.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, t],
      );
      if (!exists.length) continue;

      await qr.query(`ALTER TABLE "${schema}".${t} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
      await qr.query(`ALTER TABLE "${schema}".${t} ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 0`);
      await qr.query(`ALTER TABLE "${schema}".${t} ADD COLUMN IF NOT EXISTS origin_node UUID`);
      await qr.query(`ALTER TABLE "${schema}".${t} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
      await qr.query(`CREATE INDEX IF NOT EXISTS idx_${t}_sync_version ON "${schema}".${t}(sync_version)`);

      await qr.query(`DROP TRIGGER IF EXISTS trg_${t}_sync_stamp ON "${schema}".${t}`);
      await qr.query(`CREATE TRIGGER trg_${t}_sync_stamp BEFORE INSERT OR UPDATE ON "${schema}".${t} FOR EACH ROW EXECUTE FUNCTION "${schema}".sync_stamp()`);
      await qr.query(`DROP TRIGGER IF EXISTS trg_${t}_sync_enqueue ON "${schema}".${t}`);
      await qr.query(`CREATE TRIGGER trg_${t}_sync_enqueue AFTER INSERT OR UPDATE OR DELETE ON "${schema}".${t} FOR EACH ROW EXECUTE FUNCTION "${schema}".sync_enqueue()`);
    }

    // Backfill existing rows with a distinct sync_version so they replicate on first
    // pull. apply-mode preserves real updated_at and keeps the outbox clean.
    await qr.query(`SET sync.apply = 'on'`);
    try {
      for (const t of SYNC_TABLES_059) {
        const exists = await qr.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schema, t],
        );
        if (!exists.length) continue;
        await qr.query(`UPDATE "${schema}".${t} SET updated_at = updated_at WHERE sync_version = 0`);
      }
    } finally {
      await qr.query(`RESET sync.apply`);
    }
  },
  async down(qr, schema) {
    for (const t of SYNC_TABLES_059) {
      await qr.query(`DROP TRIGGER IF EXISTS trg_${t}_sync_stamp ON "${schema}".${t}`);
      await qr.query(`DROP TRIGGER IF EXISTS trg_${t}_sync_enqueue ON "${schema}".${t}`);
    }
    await qr.query(`DROP FUNCTION IF EXISTS "${schema}".sync_stamp() CASCADE`);
    await qr.query(`DROP FUNCTION IF EXISTS "${schema}".sync_enqueue() CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".sync_outbox`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".sync_state`);
    await qr.query(`DROP SEQUENCE IF EXISTS "${schema}".sync_seq`);
  },
};

/**
 * 060 — Extend offline sync to transactional documents (Phase 2, slice 2).
 * Reuses the trigger functions + outbox/state created by 059; just wires sync columns
 * and triggers onto the transaction tables. Applied on schemas that already ran 059.
 */
const SYNC_TABLES_060 = [
  'orders',
  'order_items',
  'invoices',
  'quotes',
  'quote_items',
  'payments',
  'deliveries',
];

const migration060SyncTransactional: TenantMigration = {
  name: '060_sync_transactional',
  async up(qr, schema) {
    for (const t of SYNC_TABLES_060) {
      const exists = await qr.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, t],
      );
      if (!exists.length) continue;

      await qr.query(`ALTER TABLE "${schema}".${t} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
      await qr.query(`ALTER TABLE "${schema}".${t} ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 0`);
      await qr.query(`ALTER TABLE "${schema}".${t} ADD COLUMN IF NOT EXISTS origin_node UUID`);
      await qr.query(`ALTER TABLE "${schema}".${t} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
      await qr.query(`CREATE INDEX IF NOT EXISTS idx_${t}_sync_version ON "${schema}".${t}(sync_version)`);

      await qr.query(`DROP TRIGGER IF EXISTS trg_${t}_sync_stamp ON "${schema}".${t}`);
      await qr.query(`CREATE TRIGGER trg_${t}_sync_stamp BEFORE INSERT OR UPDATE ON "${schema}".${t} FOR EACH ROW EXECUTE FUNCTION "${schema}".sync_stamp()`);
      await qr.query(`DROP TRIGGER IF EXISTS trg_${t}_sync_enqueue ON "${schema}".${t}`);
      await qr.query(`CREATE TRIGGER trg_${t}_sync_enqueue AFTER INSERT OR UPDATE OR DELETE ON "${schema}".${t} FOR EACH ROW EXECUTE FUNCTION "${schema}".sync_enqueue()`);
    }

    await qr.query(`SET sync.apply = 'on'`);
    try {
      for (const t of SYNC_TABLES_060) {
        const exists = await qr.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schema, t],
        );
        if (!exists.length) continue;
        await qr.query(`UPDATE "${schema}".${t} SET updated_at = updated_at WHERE sync_version = 0`);
      }
    } finally {
      await qr.query(`RESET sync.apply`);
    }
  },
  async down(qr, schema) {
    for (const t of SYNC_TABLES_060) {
      await qr.query(`DROP TRIGGER IF EXISTS trg_${t}_sync_stamp ON "${schema}".${t}`);
      await qr.query(`DROP TRIGGER IF EXISTS trg_${t}_sync_enqueue ON "${schema}".${t}`);
    }
  },
};

/**
 * 061 — Double-entry accounting core (Phase 4).
 *
 * Tally-style ledger accounting: account groups (with a fundamental `nature`), ledger
 * accounts (chart of accounts), vouchers, and their debit/credit entries. Seeds the
 * standard primary groups + a handful of default ledgers so the books work out of the box.
 * Idempotent (IF NOT EXISTS + ON CONFLICT DO NOTHING).
 */
const ACCT_PRIMARY_GROUPS: Array<[string, string]> = [
  // [name, nature]
  ['Capital Account', 'liability'],
  ['Loans (Liability)', 'liability'],
  ['Current Liabilities', 'liability'],
  ['Duties & Taxes', 'liability'],
  ['Sundry Creditors', 'liability'],
  ['Fixed Assets', 'asset'],
  ['Investments', 'asset'],
  ['Current Assets', 'asset'],
  ['Sundry Debtors', 'asset'],
  ['Cash-in-hand', 'asset'],
  ['Bank Accounts', 'asset'],
  ['Sales Accounts', 'income'],
  ['Direct Incomes', 'income'],
  ['Indirect Incomes', 'income'],
  ['Purchase Accounts', 'expense'],
  ['Direct Expenses', 'expense'],
  ['Indirect Expenses', 'expense'],
];

const ACCT_DEFAULT_LEDGERS: Array<[string, string]> = [
  // [ledger name, group name]
  ['Cash', 'Cash-in-hand'],
  ['Bank', 'Bank Accounts'],
  ['Sales', 'Sales Accounts'],
  ['Purchase', 'Purchase Accounts'],
  ['CGST Payable', 'Duties & Taxes'],
  ['SGST Payable', 'Duties & Taxes'],
  ['IGST Payable', 'Duties & Taxes'],
  ['Output Tax', 'Duties & Taxes'],
  ['Round Off', 'Indirect Expenses'],
  ['Opening Balance', 'Capital Account'],
];

const migration061AccountingCore: TenantMigration = {
  name: '061_accounting_core',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".ledger_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL UNIQUE,
        parent_id UUID REFERENCES "${schema}".ledger_groups(id),
        nature VARCHAR(12) NOT NULL CHECK (nature IN ('asset','liability','income','expense')),
        is_primary BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".ledger_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(160) NOT NULL UNIQUE,
        group_id UUID NOT NULL REFERENCES "${schema}".ledger_groups(id),
        opening_balance NUMERIC(16,2) NOT NULL DEFAULT 0,
        opening_type CHAR(2) NOT NULL DEFAULT 'dr' CHECK (opening_type IN ('dr','cr')),
        gstin VARCHAR(20),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ledger_accounts_group ON "${schema}".ledger_accounts(group_id)`);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".vouchers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        voucher_type VARCHAR(20) NOT NULL,
        number VARCHAR(40) NOT NULL,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        narration TEXT,
        party_ledger_id UUID REFERENCES "${schema}".ledger_accounts(id),
        amount NUMERIC(16,2) NOT NULL DEFAULT 0,
        reference VARCHAR(80),
        status VARCHAR(12) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_vouchers_date ON "${schema}".vouchers(date)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_vouchers_type ON "${schema}".vouchers(voucher_type)`);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".voucher_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        voucher_id UUID NOT NULL REFERENCES "${schema}".vouchers(id) ON DELETE CASCADE,
        ledger_id UUID NOT NULL REFERENCES "${schema}".ledger_accounts(id),
        debit NUMERIC(16,2) NOT NULL DEFAULT 0,
        credit NUMERIC(16,2) NOT NULL DEFAULT 0,
        narration TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_voucher_entries_voucher ON "${schema}".voucher_entries(voucher_id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_voucher_entries_ledger ON "${schema}".voucher_entries(ledger_id)`);

    // Seed primary groups.
    for (const [name, nature] of ACCT_PRIMARY_GROUPS) {
      await qr.query(
        `INSERT INTO "${schema}".ledger_groups (name, nature, is_primary) VALUES ($1, $2, true) ON CONFLICT (name) DO NOTHING`,
        [name, nature],
      );
    }
    // Seed default ledgers under their groups.
    for (const [name, groupName] of ACCT_DEFAULT_LEDGERS) {
      await qr.query(
        `INSERT INTO "${schema}".ledger_accounts (name, group_id)
         SELECT $1, g.id FROM "${schema}".ledger_groups g WHERE g.name = $2
         ON CONFLICT (name) DO NOTHING`,
        [name, groupName],
      );
    }
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".voucher_entries CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".vouchers CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".ledger_accounts CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".ledger_groups CASCADE`);
  },
};

/**
 * 062 — Accounting auto-posting links (Phase 4). Adds source linkage so vouchers can be
 * traced back to (and de-duplicated against) the invoice/payment that created them, and
 * so ledgers can map 1:1 to a customer/supplier. Idempotent.
 */
const migration062AccountingLinks: TenantMigration = {
  name: '062_accounting_links',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".ledger_accounts ADD COLUMN IF NOT EXISTS source_type VARCHAR(20)`);
    await qr.query(`ALTER TABLE "${schema}".ledger_accounts ADD COLUMN IF NOT EXISTS source_id UUID`);
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_source ON "${schema}".ledger_accounts(source_type, source_id) WHERE source_id IS NOT NULL`,
    );
    await qr.query(`ALTER TABLE "${schema}".vouchers ADD COLUMN IF NOT EXISTS source_type VARCHAR(20)`);
    await qr.query(`ALTER TABLE "${schema}".vouchers ADD COLUMN IF NOT EXISTS source_id UUID`);
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_source ON "${schema}".vouchers(source_type, source_id) WHERE source_id IS NOT NULL`,
    );
  },
  async down(qr, schema) {
    await qr.query(`DROP INDEX IF EXISTS "${schema}".uq_voucher_source`);
    await qr.query(`DROP INDEX IF EXISTS "${schema}".uq_ledger_source`);
    await qr.query(`ALTER TABLE "${schema}".vouchers DROP COLUMN IF EXISTS source_type, DROP COLUMN IF EXISTS source_id`);
    await qr.query(`ALTER TABLE "${schema}".ledger_accounts DROP COLUMN IF EXISTS source_type, DROP COLUMN IF EXISTS source_id`);
  },
};

/**
 * 063 — E-invoice (IRN) fields on invoices (Phase 5). Stores the IRP response so an
 * invoice can carry its government IRN / acknowledgement / signed QR. Idempotent.
 */
const migration063EInvoiceFields: TenantMigration = {
  name: '063_einvoice_fields',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS irn VARCHAR(64)`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS ack_no VARCHAR(40)`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS ack_date TIMESTAMPTZ`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS einvoice_qr TEXT`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS einvoice_status VARCHAR(20) NOT NULL DEFAULT 'none'`);
  },
  async down(qr, schema) {
    await qr.query(
      `ALTER TABLE "${schema}".invoices
         DROP COLUMN IF EXISTS irn, DROP COLUMN IF EXISTS ack_no, DROP COLUMN IF EXISTS ack_date,
         DROP COLUMN IF EXISTS einvoice_qr, DROP COLUMN IF EXISTS einvoice_status`,
    );
  },
};

/**
 * 064 — GSTR-2B reconciliation store (Phase 5). Holds the inward-supply lines imported
 * from the GST portal's GSTR-2B JSON so they can be reconciled against the local purchase
 * register (supplier_orders). Adds an optional supplier_invoice_no to purchases for exact
 * matching. Idempotent.
 */
const migration064Gstr2b: TenantMigration = {
  name: '064_gstr2b',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".gstr2b_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period VARCHAR(6) NOT NULL,
        supplier_gstin VARCHAR(20),
        supplier_name VARCHAR(255),
        invoice_number VARCHAR(40),
        invoice_date DATE,
        taxable_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        igst NUMERIC(14,2) NOT NULL DEFAULT 0,
        cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
        sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
        invoice_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        raw JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gstr2b_period ON "${schema}".gstr2b_records(period)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gstr2b_gstin ON "${schema}".gstr2b_records(supplier_gstin)`);
    await qr.query(`ALTER TABLE "${schema}".supplier_orders ADD COLUMN IF NOT EXISTS supplier_invoice_no VARCHAR(40)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".gstr2b_records`);
    await qr.query(`ALTER TABLE "${schema}".supplier_orders DROP COLUMN IF EXISTS supplier_invoice_no`);
  },
};

/**
 * 065 — Purchase-side GST + accounting fields (Phase 7, purchase grid).
 * Tally's purchase voucher requires the supplier's bill no./date (also used for GSTR-2B
 * matching) and per-line GST with an interstate split; purchases post Dr Input Tax.
 * Idempotent.
 */
const migration065PurchaseGst: TenantMigration = {
  name: '065_purchase_gst_fields',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".supplier_orders ADD COLUMN IF NOT EXISTS supplier_invoice_date DATE`);
    await qr.query(`ALTER TABLE "${schema}".supplier_orders ADD COLUMN IF NOT EXISTS cgst NUMERIC(14,2) NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE "${schema}".supplier_orders ADD COLUMN IF NOT EXISTS sgst NUMERIC(14,2) NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE "${schema}".supplier_orders ADD COLUMN IF NOT EXISTS igst NUMERIC(14,2) NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE "${schema}".supplier_orders ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN NOT NULL DEFAULT false`);
    await qr.query(`ALTER TABLE "${schema}".supplier_order_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(6,2) NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE "${schema}".supplier_order_items ADD COLUMN IF NOT EXISTS hsn VARCHAR(15)`);
    // Input-side GST ledger (purchases debit this; Output Tax handles sales credit side).
    await qr.query(`
      INSERT INTO "${schema}".ledger_accounts (name, group_id)
      SELECT 'Input Tax', g.id FROM "${schema}".ledger_groups g WHERE g.name = 'Duties & Taxes'
      ON CONFLICT (name) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(
      `ALTER TABLE "${schema}".supplier_orders
         DROP COLUMN IF EXISTS supplier_invoice_date, DROP COLUMN IF EXISTS cgst,
         DROP COLUMN IF EXISTS sgst, DROP COLUMN IF EXISTS igst, DROP COLUMN IF EXISTS is_interstate`,
    );
    await qr.query(
      `ALTER TABLE "${schema}".supplier_order_items DROP COLUMN IF EXISTS gst_rate, DROP COLUMN IF EXISTS hsn`,
    );
  },
};

/**
 * 066 — Supplier payments + return-note ledgers (Phase 7).
 * Payables get the same bill-wise reconciliation as receivables: payments can attach to
 * a supplier order, which tracks amount_paid. Seeds the Sales/Purchase Returns ledgers
 * so credit/debit notes post into the books. Idempotent.
 */
const migration066SupplierPayments: TenantMigration = {
  name: '066_supplier_payments',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".supplier_orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE "${schema}".payments ADD COLUMN IF NOT EXISTS supplier_order_id UUID REFERENCES "${schema}".supplier_orders(id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_payments_supplier_order ON "${schema}".payments(supplier_order_id) WHERE supplier_order_id IS NOT NULL`);
    await qr.query(`
      INSERT INTO "${schema}".ledger_accounts (name, group_id)
      SELECT 'Sales Returns', g.id FROM "${schema}".ledger_groups g WHERE g.name = 'Sales Accounts'
      ON CONFLICT (name) DO NOTHING
    `);
    await qr.query(`
      INSERT INTO "${schema}".ledger_accounts (name, group_id)
      SELECT 'Purchase Returns', g.id FROM "${schema}".ledger_groups g WHERE g.name = 'Purchase Accounts'
      ON CONFLICT (name) DO NOTHING
    `);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".payments DROP COLUMN IF EXISTS supplier_order_id`);
    await qr.query(`ALTER TABLE "${schema}".supplier_orders DROP COLUMN IF EXISTS amount_paid`);
  },
};

/**
 * 067 — Price levels + credit limits (Phase 7 masters).
 * Tally "price levels" / Miracle "rate structures": named rate lists (Retail/Wholesale/…)
 * with per-product rates, assigned per customer. Credit control: per-customer credit
 * limit + credit days, used for billing-time warnings and overdue detection. Idempotent.
 */
const migration067PriceLevels: TenantMigration = {
  name: '067_price_levels_credit',
  async up(qr, schema) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".price_levels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(80) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".price_list_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        price_level_id UUID NOT NULL REFERENCES "${schema}".price_levels(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES "${schema}".products(id) ON DELETE CASCADE,
        rate NUMERIC(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_price_list UNIQUE (price_level_id, product_id)
      )
    `);
    await qr.query(`ALTER TABLE "${schema}".customers ADD COLUMN IF NOT EXISTS price_level_id UUID REFERENCES "${schema}".price_levels(id)`);
    await qr.query(`ALTER TABLE "${schema}".customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2)`);
    await qr.query(`ALTER TABLE "${schema}".customers ADD COLUMN IF NOT EXISTS credit_days INT`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".customers DROP COLUMN IF EXISTS price_level_id, DROP COLUMN IF EXISTS credit_limit, DROP COLUMN IF EXISTS credit_days`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".price_list_items`);
    await qr.query(`DROP TABLE IF EXISTS "${schema}".price_levels`);
  },
};

/**
 * 068 — Miracle trade-billing fields (Phase 7 field parity).
 * Cash memo (Dr Cash, auto-settled), Add/Less charges with their own GST, broker +
 * commission, transport details (name/LR/vehicle). Line-level Disc-1/Disc-2/free-qty
 * live inside the items JSONB; bill discount + round_off + due_date already exist.
 */
const migration068TradeFields: TenantMigration = {
  name: '068_trade_fields',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS is_cash BOOLEAN NOT NULL DEFAULT false`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS charges JSONB NOT NULL DEFAULT '[]'`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS broker VARCHAR(120)`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(6,2)`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS transport JSONB`);
  },
  async down(qr, schema) {
    await qr.query(
      `ALTER TABLE "${schema}".invoices
         DROP COLUMN IF EXISTS is_cash, DROP COLUMN IF EXISTS charges, DROP COLUMN IF EXISTS broker,
         DROP COLUMN IF EXISTS commission_pct, DROP COLUMN IF EXISTS transport`,
    );
  },
};

/**
 * 069 — Bill To / Ship To on invoices (GST dispatch details; feeds e-invoice ShipDtls
 * and place-of-supply). Each is {name, address, city, state, stateCode, pincode, gstin,
 * phone}. Idempotent.
 */
const migration069BillShipTo: TenantMigration = {
  name: '069_bill_ship_to',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS bill_to JSONB`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS ship_to JSONB`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".invoices DROP COLUMN IF EXISTS bill_to, DROP COLUMN IF EXISTS ship_to`);
  },
};

/**
 * 070 — Remaining Miracle tail: purchase-side Add/Less charges, dual units on the
 * product master (alt unit + conversion factor, e.g. 1 bag = 50 kg). Idempotent.
 */
const migration070PurchaseChargesUnits: TenantMigration = {
  name: '070_purchase_charges_units',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".supplier_orders ADD COLUMN IF NOT EXISTS charges JSONB NOT NULL DEFAULT '[]'`);
    await qr.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS alt_uom VARCHAR(20)`);
    await qr.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS uom_factor NUMERIC(12,4)`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".supplier_orders DROP COLUMN IF EXISTS charges`);
    await qr.query(`ALTER TABLE "${schema}".products DROP COLUMN IF EXISTS alt_uom, DROP COLUMN IF EXISTS uom_factor`);
  },
};

/**
 * 071 — Item-master rates (Miracle): dedicated purchase rate and MRP columns on the
 * product master, so the Add Item screen carries Purchase Rate / Sale Rate / MRP the
 * way Miracle's item master does. Idempotent.
 */
const migration071ItemMasterRates: TenantMigration = {
  name: '071_item_master_rates',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2)`);
    await qr.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS mrp NUMERIC(12,2)`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".products DROP COLUMN IF EXISTS purchase_price, DROP COLUMN IF EXISTS mrp`);
  },
};

/**
 * 072 — Miracle audit tail: TCS on the sales footer (206C-style, collected on the
 * invoice value) and opening rate on the item master (stock valuation). Idempotent.
 */
const migration072TcsOpeningRate: TenantMigration = {
  name: '072_tcs_opening_rate',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS tcs_pct NUMERIC(6,3)`);
    await qr.query(`ALTER TABLE "${schema}".invoices ADD COLUMN IF NOT EXISTS tcs_amount NUMERIC(12,2)`);
    await qr.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS opening_rate NUMERIC(12,2)`);
  },
  async down(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".invoices DROP COLUMN IF EXISTS tcs_pct, DROP COLUMN IF EXISTS tcs_amount`);
    await qr.query(`ALTER TABLE "${schema}".products DROP COLUMN IF EXISTS opening_rate`);
  },
};

/**
 * 073 — Party Master (PARTY_MASTER_README.md): the full GST party/ledger field set on
 * BOTH role tables. The spec's single-party model is realised as a unified layer —
 * account_group (Sundry Debtor → customers, Sundry Creditor → suppliers) decides where
 * the row lives, and the ledger layer is where the roles meet. Idempotent.
 */
const migration073PartyMaster: TenantMigration = {
  name: '073_party_master',
  async up(qr, schema) {
    const partyCols = `
      ADD COLUMN IF NOT EXISTS gst_registration_type VARCHAR(20) NOT NULL DEFAULT 'consumer',
      ADD COLUMN IF NOT EXISTS pan VARCHAR(10),
      ADD COLUMN IF NOT EXISTS state VARCHAR(50),
      ADD COLUMN IF NOT EXISTS state_code VARCHAR(2),
      ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50),
      ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS tds_applicable BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS tds_section VARCHAR(10),
      ADD COLUMN IF NOT EXISTS alias VARCHAR(80),
      ADD COLUMN IF NOT EXISTS party_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS contact_person VARCHAR(120),
      ADD COLUMN IF NOT EXISTS pincode VARCHAR(10),
      ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(15,2),
      ADD COLUMN IF NOT EXISTS opening_dr_cr CHAR(2),
      ADD COLUMN IF NOT EXISTS bill_by_bill BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS default_discount_pct NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS account_number VARCHAR(34),
      ADD COLUMN IF NOT EXISTS ifsc VARCHAR(11),
      ADD COLUMN IF NOT EXISTS upi_id VARCHAR(80),
      ADD COLUMN IF NOT EXISTS salesman VARCHAR(80),
      ADD COLUMN IF NOT EXISTS route VARCHAR(80),
      ADD COLUMN IF NOT EXISTS area VARCHAR(80),
      ADD COLUMN IF NOT EXISTS tags JSONB,
      ADD COLUMN IF NOT EXISTS user_defined_fields JSONB,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`;
    await qr.query(`ALTER TABLE "${schema}".customers ${partyCols}`);
    await qr.query(`ALTER TABLE "${schema}".suppliers ${partyCols},
      ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2),
      ADD COLUMN IF NOT EXISTS credit_days INT,
      ADD COLUMN IF NOT EXISTS email VARCHAR(120),
      ADD COLUMN IF NOT EXISTS billing_address TEXT,
      ADD COLUMN IF NOT EXISTS price_level_id UUID,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  },
  async down(qr, schema) {
    for (const t of ['customers', 'suppliers']) {
      await qr.query(`ALTER TABLE "${schema}".${t}
        DROP COLUMN IF EXISTS gst_registration_type, DROP COLUMN IF EXISTS pan, DROP COLUMN IF EXISTS state,
        DROP COLUMN IF EXISTS state_code, DROP COLUMN IF EXISTS place_of_supply, DROP COLUMN IF EXISTS reverse_charge,
        DROP COLUMN IF EXISTS tds_applicable, DROP COLUMN IF EXISTS tds_section, DROP COLUMN IF EXISTS alias,
        DROP COLUMN IF EXISTS party_code, DROP COLUMN IF EXISTS contact_person, DROP COLUMN IF EXISTS pincode,
        DROP COLUMN IF EXISTS opening_balance, DROP COLUMN IF EXISTS opening_dr_cr, DROP COLUMN IF EXISTS bill_by_bill,
        DROP COLUMN IF EXISTS default_discount_pct, DROP COLUMN IF EXISTS bank_name, DROP COLUMN IF EXISTS account_number,
        DROP COLUMN IF EXISTS ifsc, DROP COLUMN IF EXISTS upi_id, DROP COLUMN IF EXISTS salesman,
        DROP COLUMN IF EXISTS route, DROP COLUMN IF EXISTS area, DROP COLUMN IF EXISTS tags,
        DROP COLUMN IF EXISTS user_defined_fields, DROP COLUMN IF EXISTS is_active`);
    }
  },
};

/**
 * 074 — Item Master field parity (ITEM_MASTER_FIELDS_README.md, Vyapar × Miracle):
 * type/UQC/pricing tiers/tax flags/stock levels on products, plus the item_batches
 * registry powering MRP-wise batches (§3F.1 — one item, many batches, never a
 * duplicate item). Idempotent.
 */
const migration074ItemMasterParity: TenantMigration = {
  name: '074_item_master_parity',
  async up(qr, schema) {
    await qr.query(`ALTER TABLE "${schema}".products
      ADD COLUMN IF NOT EXISTS item_type VARCHAR(10) NOT NULL DEFAULT 'product',
      ADD COLUMN IF NOT EXISTS uqc VARCHAR(8),
      ADD COLUMN IF NOT EXISTS price_includes_tax BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS sale_discount_pct NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS wholesale_min_qty NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS min_sale_price NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_sale_price NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cess_pct NUMERIC(6,3),
      ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS opening_stock_date DATE,
      ADD COLUMN IF NOT EXISTS max_stock NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS rack_location VARCHAR(80),
      ADD COLUMN IF NOT EXISTS tracking_mode VARCHAR(10) NOT NULL DEFAULT 'none'`);

    await qr.query(`CREATE TABLE IF NOT EXISTS "${schema}".item_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES "${schema}".products(id) ON DELETE CASCADE,
      batch_no VARCHAR(60) NOT NULL,
      mfg_date DATE,
      expiry_date DATE,
      mrp NUMERIC(12,2),
      selling_price NUMERIC(12,2),
      purchase_cost NUMERIC(12,2),
      qty NUMERIC(14,3) NOT NULL DEFAULT 0,
      godown VARCHAR(80),
      model_no VARCHAR(60),
      size VARCHAR(40),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_item_batches_lot
      ON "${schema}".item_batches (product_id, batch_no, COALESCE(godown, ''))`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_item_batches_product ON "${schema}".item_batches (product_id)`);
  },
  async down(qr, schema) {
    await qr.query(`DROP TABLE IF EXISTS "${schema}".item_batches`);
    await qr.query(`ALTER TABLE "${schema}".products
      DROP COLUMN IF EXISTS item_type, DROP COLUMN IF EXISTS uqc, DROP COLUMN IF EXISTS price_includes_tax,
      DROP COLUMN IF EXISTS sale_discount_pct, DROP COLUMN IF EXISTS wholesale_price, DROP COLUMN IF EXISTS wholesale_min_qty,
      DROP COLUMN IF EXISTS min_sale_price, DROP COLUMN IF EXISTS max_sale_price, DROP COLUMN IF EXISTS cess_pct,
      DROP COLUMN IF EXISTS tax_exempt, DROP COLUMN IF EXISTS opening_stock_date, DROP COLUMN IF EXISTS max_stock,
      DROP COLUMN IF EXISTS rack_location, DROP COLUMN IF EXISTS tracking_mode`);
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
  migration044AudienceSegment,
  migration045CustomFields,
  migration046ErpSequences,
  migration047ErpInvoicingCore,
  migration048ErpCrm,
  migration049ErpProcurement,
  migration050ErpHr,
  migration051ErpEnterprise,
  migration052ErpEnterprise2,
  migration053ErpVyapar,
  migration054ErpAdvanced,
  migration055ErpPosEway,
  migration056TaxRatePercent,
  migration057AdminNotifications,
  migration058QuoteItemDiscount,
  migration059SyncInfrastructure,
  migration060SyncTransactional,
  migration061AccountingCore,
  migration062AccountingLinks,
  migration063EInvoiceFields,
  migration064Gstr2b,
  migration065PurchaseGst,
  migration066SupplierPayments,
  migration067PriceLevels,
  migration068TradeFields,
  migration069BillShipTo,
  migration070PurchaseChargesUnits,
  migration071ItemMasterRates,
  migration072TcsOpeningRate,
  migration073PartyMaster,
  migration074ItemMasterParity,
];
