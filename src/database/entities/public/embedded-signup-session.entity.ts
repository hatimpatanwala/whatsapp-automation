import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tracks Meta Embedded Signup sessions.
 * Each session represents one Facebook Login popup flow for a tenant.
 *
 * States:
 *   initiated → fb_login_started → code_received → token_exchanged →
 *   waba_synced → phone_synced → system_token_generated → webhook_subscribed →
 *   completed | failed | expired
 */
export type EmbeddedSignupState =
  | 'initiated'
  | 'fb_login_started'
  | 'code_received'
  | 'token_exchanged'
  | 'waba_synced'
  | 'phone_synced'
  | 'system_token_generated'
  | 'webhook_subscribed'
  | 'completed'
  | 'failed'
  | 'expired';

@Entity({ name: 'embedded_signup_sessions', schema: 'public' })
@Index('idx_embedded_signup_tenant', ['tenantId'])
@Index('idx_embedded_signup_state', ['state'])
export class EmbeddedSignupSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 30, default: 'initiated' })
  state: EmbeddedSignupState;

  @Column({ name: 'previous_state', type: 'varchar', length: 30, nullable: true })
  previousState: EmbeddedSignupState;

  // ─── Facebook Login data ────────────────────────────────────────────

  /** The auth code from Facebook Login */
  @Column({ name: 'auth_code_hash', length: 64, nullable: true })
  authCodeHash: string;

  /** User access token (encrypted, short-lived) */
  @Column({ name: 'user_token_encrypted', type: 'text', nullable: true })
  userTokenEncrypted: string;

  /** System user token (encrypted, long-lived) — the token we actually use */
  @Column({ name: 'system_token_encrypted', type: 'text', nullable: true })
  systemTokenEncrypted: string;

  // ─── sessionInfoVersion:2 data from FB callback ─────────────────────

  /** WABA ID from session_info_nonce or direct callback */
  @Column({ name: 'waba_id', length: 50, nullable: true })
  wabaId: string;

  /** Phone number ID from session_info_nonce */
  @Column({ name: 'phone_number_id', length: 50, nullable: true })
  phoneNumberId: string;

  /** Business ID from the signup */
  @Column({ name: 'business_id', length: 50, nullable: true })
  businessId: string;

  /** The WABA account record ID in our DB */
  @Column({ name: 'waba_account_id', type: 'uuid', nullable: true })
  wabaAccountId: string;

  /** The phone record ID in our DB */
  @Column({ name: 'phone_record_id', type: 'uuid', nullable: true })
  phoneRecordId: string;

  // ─── Coexistence detection ──────────────────────────────────────────

  /** Whether this signup involved a number with existing WA Business App */
  @Column({ name: 'is_coexistence', default: false })
  isCoexistence: boolean;

  /** Whether coexistence was offered and accepted */
  @Column({ name: 'coexistence_accepted', default: false })
  coexistenceAccepted: boolean;

  /** Detected existing platform (wa_business_app, other_bsp, cloud_api, none) */
  @Column({ name: 'detected_platform', length: 30, nullable: true })
  detectedPlatform: string;

  // ─── Tracking ───────────────────────────────────────────────────────

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'error_code', length: 50, nullable: true })
  errorCode: string;

  @Column({ name: 'step_log', type: 'jsonb', default: '[]' })
  stepLog: Array<{ state: string; timestamp: string; detail?: string }>;

  /** Raw session info from Facebook callback */
  @Column({ name: 'raw_session_info', type: 'jsonb', default: '{}' })
  rawSessionInfo: Record<string, any>;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
