import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tracks coexistence onboarding sessions.
 * Coexistence = user keeps their WA Business App running alongside Cloud API.
 *
 * States:
 *   initiated → eligibility_check → eligible → user_consent →
 *   provisioning → active → migrating_full → full_migration_complete |
 *   ineligible | failed | expired
 */
export type CoexistenceState =
  | 'initiated'
  | 'eligibility_check'
  | 'eligible'
  | 'ineligible'
  | 'user_consent'
  | 'provisioning'
  | 'active'
  | 'migrating_full'
  | 'full_migration_complete'
  | 'failed'
  | 'expired';

@Entity({ name: 'coexistence_sessions', schema: 'public' })
@Index('idx_coexistence_tenant', ['tenantId'])
@Index('idx_coexistence_phone', ['phoneNumber'])
export class CoexistenceSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 30, default: 'initiated' })
  state: CoexistenceState;

  @Column({ name: 'previous_state', type: 'varchar', length: 30, nullable: true })
  previousState: CoexistenceState;

  // ─── Linked sessions ────────────────────────────────────────────────

  /** The embedded signup session that triggered this */
  @Column({ name: 'embedded_signup_session_id', type: 'uuid', nullable: true })
  embeddedSignupSessionId: string;

  /** The onboarding session (if exists) */
  @Column({ name: 'onboarding_session_id', type: 'uuid', nullable: true })
  onboardingSessionId: string;

  // ─── Eligibility ────────────────────────────────────────────────────

  /** Whether Meta confirmed coexistence eligibility */
  @Column({ name: 'meta_eligible', default: false })
  metaEligible: boolean;

  /** Detected existing app type: wa_business_app, wa_personal */
  @Column({ name: 'existing_app_type', length: 30, nullable: true })
  existingAppType: string;

  /** Reason if ineligible */
  @Column({ name: 'ineligibility_reason', type: 'text', nullable: true })
  ineligibilityReason: string;

  // ─── Coexistence config ─────────────────────────────────────────────

  /** Which message types Cloud API handles */
  @Column({ name: 'cloud_api_message_types', type: 'jsonb', default: '[]' })
  cloudApiMessageTypes: string[];

  /** Whether user consented to coexistence terms */
  @Column({ name: 'user_consented', default: false })
  userConsented: boolean;

  @Column({ name: 'consent_timestamp', type: 'timestamptz', nullable: true })
  consentTimestamp: Date;

  // ─── Meta IDs ───────────────────────────────────────────────────────

  @Column({ name: 'waba_id', length: 50, nullable: true })
  wabaId: string;

  @Column({ name: 'phone_number_id', length: 50, nullable: true })
  phoneNumberId: string;

  @Column({ name: 'waba_account_id', type: 'uuid', nullable: true })
  wabaAccountId: string;

  @Column({ name: 'phone_record_id', type: 'uuid', nullable: true })
  phoneRecordId: string;

  // ─── Tracking ───────────────────────────────────────────────────────

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'step_log', type: 'jsonb', default: '[]' })
  stepLog: Array<{ state: string; timestamp: string; detail?: string }>;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
