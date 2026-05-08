import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Shared WABA Architecture
 *
 * Extends the platform with centralized WhatsApp Business Account management,
 * conversation metering, cost tracking, and quota enforcement.
 *
 * This migration adds tables for:
 * - waba_accounts: Centralized WABA ownership
 * - phone_numbers: Multi-tenant phone number registry
 * - meta_tokens: Encrypted token storage with rotation
 * - conversation_sessions: WhatsApp 24h conversation window tracking
 * - conversation_costs: Per-conversation Meta pricing
 * - quota_events: Usage tracking events
 * - billing_events: Cost reconciliation
 * - template_registry: Centralized template management
 * - quality_scores: Phone number quality monitoring
 * - audit_logs: Security audit trail
 * - rate_limits: Per-tenant throttling config
 */
export class SharedWabaSchema1700000000002 implements MigrationInterface {
  name = 'SharedWabaSchema1700000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. WABA ACCOUNTS — Platform-owned WhatsApp Business Accounts
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.waba_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        waba_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        business_id VARCHAR(50) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
        status VARCHAR(20) DEFAULT 'active',
        meta_business_verification VARCHAR(20) DEFAULT 'pending',
        payment_method_attached BOOLEAN DEFAULT false,
        messaging_limit_tier VARCHAR(20) DEFAULT 'TIER_1K',
        account_review_status VARCHAR(20) DEFAULT 'approved',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. PHONE NUMBERS — Registered under centralized WABAs
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.phone_numbers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        waba_account_id UUID NOT NULL REFERENCES public.waba_accounts(id) ON DELETE CASCADE,
        tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
        phone_number VARCHAR(20) NOT NULL,
        phone_number_id VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(255),
        verified_name VARCHAR(255),
        quality_rating VARCHAR(20) DEFAULT 'GREEN',
        messaging_limit VARCHAR(20) DEFAULT 'TIER_1K',
        status VARCHAR(20) DEFAULT 'pending_registration',
        registration_status VARCHAR(30) DEFAULT 'not_started',
        code_verification_status VARCHAR(20) DEFAULT 'not_verified',
        platform_type VARCHAR(20) DEFAULT 'CLOUD_API',
        certificate TEXT,
        name_status VARCHAR(20) DEFAULT 'NONE',
        is_official_business_account BOOLEAN DEFAULT false,
        is_pin_enabled BOOLEAN DEFAULT false,
        last_onboarded_at TIMESTAMPTZ,
        webhook_subscribed BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. META TOKENS — Encrypted token storage with rotation tracking
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.meta_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        waba_account_id UUID NOT NULL REFERENCES public.waba_accounts(id) ON DELETE CASCADE,
        token_type VARCHAR(30) NOT NULL DEFAULT 'system_user',
        encrypted_token TEXT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        scopes TEXT[] DEFAULT '{}',
        expires_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        last_rotated_at TIMESTAMPTZ DEFAULT NOW(),
        rotation_count INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(waba_account_id, token_type)
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. CONVERSATION SESSIONS — Track WhatsApp 24h conversation windows
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TYPE conversation_category AS ENUM (
        'marketing', 'utility', 'authentication', 'service'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE conversation_origin AS ENUM (
        'business_initiated', 'user_initiated'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.conversation_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        phone_number_id UUID NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
        customer_phone VARCHAR(20) NOT NULL,
        wa_conversation_id VARCHAR(100),
        category conversation_category NOT NULL DEFAULT 'service',
        origin conversation_origin NOT NULL DEFAULT 'user_initiated',
        billable BOOLEAN DEFAULT true,
        pricing_model VARCHAR(20) DEFAULT 'CBP',
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        closed_at TIMESTAMPTZ,
        message_count INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'open',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. CONVERSATION COSTS — Meta pricing per conversation
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.conversation_costs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_session_id UUID NOT NULL REFERENCES public.conversation_sessions(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        category conversation_category NOT NULL,
        origin conversation_origin NOT NULL,
        country_code VARCHAR(5) NOT NULL DEFAULT 'IN',
        meta_cost_usd DECIMAL(10, 6) DEFAULT 0,
        meta_cost_inr DECIMAL(10, 4) DEFAULT 0,
        platform_markup_inr DECIMAL(10, 4) DEFAULT 0,
        total_cost_inr DECIMAL(10, 4) DEFAULT 0,
        billing_period_start TIMESTAMPTZ NOT NULL,
        billing_period_end TIMESTAMPTZ NOT NULL,
        reconciled BOOLEAN DEFAULT false,
        reconciled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. QUOTA EVENTS — Usage tracking (increment/decrement/reset)
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.quota_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES public.subscriptions(id),
        event_type VARCHAR(30) NOT NULL,
        category conversation_category,
        delta INT NOT NULL DEFAULT 1,
        balance_before INT NOT NULL DEFAULT 0,
        balance_after INT NOT NULL DEFAULT 0,
        reason VARCHAR(255),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. BILLING EVENTS — Internal billing reconciliation
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.billing_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES public.subscriptions(id),
        event_type VARCHAR(30) NOT NULL,
        amount_inr DECIMAL(12, 4) NOT NULL DEFAULT 0,
        conversations_count INT DEFAULT 0,
        category_breakdown JSONB DEFAULT '{}',
        period_start TIMESTAMPTZ,
        period_end TIMESTAMPTZ,
        invoice_id VARCHAR(100),
        notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. TEMPLATE REGISTRY — Centralized template management under shared WABA
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.template_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        waba_account_id UUID NOT NULL REFERENCES public.waba_accounts(id) ON DELETE CASCADE,
        tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
        template_name VARCHAR(255) NOT NULL,
        template_id VARCHAR(100),
        language VARCHAR(10) NOT NULL DEFAULT 'en',
        category VARCHAR(30) NOT NULL DEFAULT 'UTILITY',
        status VARCHAR(30) DEFAULT 'PENDING',
        rejection_reason TEXT,
        components JSONB DEFAULT '[]',
        header_type VARCHAR(20),
        body_text TEXT,
        footer_text VARCHAR(60),
        buttons JSONB DEFAULT '[]',
        quality_score VARCHAR(20),
        last_synced_at TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ,
        approved_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(waba_account_id, template_name, language)
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. QUALITY SCORES — Phone number quality monitoring
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.quality_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_number_id UUID NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
        tenant_id UUID REFERENCES public.tenants(id),
        quality_rating VARCHAR(20) NOT NULL,
        previous_rating VARCHAR(20),
        messaging_limit VARCHAR(20),
        previous_limit VARCHAR(20),
        event_type VARCHAR(50) NOT NULL,
        reason TEXT,
        recorded_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. AUDIT LOGS — Security and compliance audit trail
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES public.tenants(id),
        actor_id UUID,
        actor_type VARCHAR(20) NOT NULL DEFAULT 'system',
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id VARCHAR(100),
        details JSONB DEFAULT '{}',
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 11. RATE LIMITS — Per-tenant throttling configuration
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.rate_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID UNIQUE NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        messages_per_second INT DEFAULT 80,
        messages_per_minute INT DEFAULT 1000,
        messages_per_hour INT DEFAULT 10000,
        templates_per_day INT DEFAULT 100,
        media_per_hour INT DEFAULT 500,
        is_throttled BOOLEAN DEFAULT false,
        throttled_until TIMESTAMPTZ,
        throttle_reason VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 12. SUBSCRIPTION EXTENSIONS — Add conversation category tracking
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      ALTER TABLE public.subscriptions
        ADD COLUMN IF NOT EXISTS marketing_conversations_used INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS utility_conversations_used INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS authentication_conversations_used INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS service_conversations_used INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS max_marketing_conversations INT,
        ADD COLUMN IF NOT EXISTS max_utility_conversations INT,
        ADD COLUMN IF NOT EXISTS max_authentication_conversations INT,
        ADD COLUMN IF NOT EXISTS overage_enabled BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS overage_rate_inr DECIMAL(10, 4) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS soft_limit_pct INT DEFAULT 80,
        ADD COLUMN IF NOT EXISTS hard_limit_pct INT DEFAULT 100,
        ADD COLUMN IF NOT EXISTS topup_conversations INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS next_reset_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS allow_exceed BOOLEAN DEFAULT false
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // 13. TENANT EXTENSIONS — Link to centralized infrastructure
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`
      ALTER TABLE public.tenants
        ADD COLUMN IF NOT EXISTS waba_account_id UUID REFERENCES public.waba_accounts(id),
        ADD COLUMN IF NOT EXISTS assigned_phone_number_id UUID REFERENCES public.phone_numbers(id),
        ADD COLUMN IF NOT EXISTS messaging_tier VARCHAR(20) DEFAULT 'TIER_1K',
        ADD COLUMN IF NOT EXISTS is_messaging_paused BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS pause_reason VARCHAR(255),
        ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    // INDEXES — Performance optimization
    // ═══════════════════════════════════════════════════════════════════════════
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_phone_numbers_tenant ON public.phone_numbers(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_phone_numbers_waba ON public.phone_numbers(waba_account_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone_id ON public.phone_numbers(phone_number_id)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_sessions_tenant ON public.conversation_sessions(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_sessions_phone ON public.conversation_sessions(phone_number_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_sessions_customer ON public.conversation_sessions(customer_phone)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_sessions_status ON public.conversation_sessions(status) WHERE status = 'open'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_sessions_expires ON public.conversation_sessions(expires_at) WHERE status = 'open'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_sessions_tenant_period ON public.conversation_sessions(tenant_id, opened_at)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_costs_tenant ON public.conversation_costs(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_costs_period ON public.conversation_costs(billing_period_start, billing_period_end)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conv_costs_reconciled ON public.conversation_costs(reconciled) WHERE reconciled = false`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_quota_events_tenant ON public.quota_events(tenant_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_billing_events_tenant ON public.billing_events(tenant_id, created_at DESC)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_template_registry_waba ON public.template_registry(waba_account_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_template_registry_tenant ON public.template_registry(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_template_registry_status ON public.template_registry(status)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_quality_scores_phone ON public.quality_scores(phone_number_id, recorded_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action, created_at DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Remove tenant extensions
    await queryRunner.query(`
      ALTER TABLE public.tenants
        DROP COLUMN IF EXISTS waba_account_id,
        DROP COLUMN IF EXISTS assigned_phone_number_id,
        DROP COLUMN IF EXISTS messaging_tier,
        DROP COLUMN IF EXISTS is_messaging_paused,
        DROP COLUMN IF EXISTS pause_reason,
        DROP COLUMN IF EXISTS paused_at
    `);

    // Remove subscription extensions
    await queryRunner.query(`
      ALTER TABLE public.subscriptions
        DROP COLUMN IF EXISTS marketing_conversations_used,
        DROP COLUMN IF EXISTS utility_conversations_used,
        DROP COLUMN IF EXISTS authentication_conversations_used,
        DROP COLUMN IF EXISTS service_conversations_used,
        DROP COLUMN IF EXISTS max_marketing_conversations,
        DROP COLUMN IF EXISTS max_utility_conversations,
        DROP COLUMN IF EXISTS max_authentication_conversations,
        DROP COLUMN IF EXISTS overage_enabled,
        DROP COLUMN IF EXISTS overage_rate_inr,
        DROP COLUMN IF EXISTS soft_limit_pct,
        DROP COLUMN IF EXISTS hard_limit_pct,
        DROP COLUMN IF EXISTS topup_conversations,
        DROP COLUMN IF EXISTS last_reset_at,
        DROP COLUMN IF EXISTS next_reset_at
    `);

    // Drop tables in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS public.rate_limits CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.audit_logs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.quality_scores CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.template_registry CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.billing_events CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.quota_events CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.conversation_costs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.conversation_sessions CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.meta_tokens CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.phone_numbers CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.waba_accounts CASCADE`);

    // Drop custom types
    await queryRunner.query(`DROP TYPE IF EXISTS conversation_origin`);
    await queryRunner.query(`DROP TYPE IF EXISTS conversation_category`);
  }
}
