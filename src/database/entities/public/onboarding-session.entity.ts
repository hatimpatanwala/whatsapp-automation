import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

/**
 * Onboarding state machine session.
 * Tracks the full lifecycle of a phone number being onboarded onto the platform.
 *
 * States:
 *   initiated → detecting → fresh_number → otp_sent → otp_verified → registering →
 *   active | needs_wa_removal | needs_bsp_migration | needs_business_removal |
 *   waiting_user_action → retry_detecting → ... → active | failed | expired
 */
export type OnboardingState =
  | 'initiated'
  | 'detecting'
  | 'fresh_number'
  | 'regular_wa_detected'
  | 'business_wa_detected'
  | 'other_bsp_detected'
  | 'needs_wa_removal'
  | 'needs_business_removal'
  | 'needs_bsp_migration'
  | 'waiting_user_action'
  | 'retry_detecting'
  | 'otp_sent'
  | 'otp_verified'
  | 'registering'
  | 'active'
  | 'failed'
  | 'expired';

@Entity({ name: 'onboarding_sessions', schema: 'public' })
@Index('idx_onboarding_tenant_status', ['tenantId', 'state'])
@Index('idx_onboarding_phone', ['phoneNumber'])
export class OnboardingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Column({ name: 'country_code', length: 5, nullable: true })
  countryCode: string;

  @Column({ type: 'varchar', length: 30, default: 'initiated' })
  state: OnboardingState;

  @Column({ name: 'previous_state', type: 'varchar', length: 30, nullable: true })
  previousState: OnboardingState;

  /** What we detected about this number */
  @Column({ name: 'detection_result', type: 'jsonb', default: '{}' })
  detectionResult: Record<string, any>;

  /** Provider name if detected on another BSP (e.g., 'wati', 'gupshup', 'interakt') */
  @Column({ name: 'detected_provider', length: 50, nullable: true })
  detectedProvider: string;

  /** Meta phone_number_id once registered */
  @Column({ name: 'phone_number_id_meta', length: 50, nullable: true })
  phoneNumberIdMeta: string;

  /** Phone record ID in our phone_numbers table */
  @Column({ name: 'phone_record_id', type: 'uuid', nullable: true })
  phoneRecordId: string;

  /** WABA account assigned to this number */
  @Column({ name: 'waba_account_id', type: 'uuid', nullable: true })
  wabaAccountId: string;

  /** OTP tracking */
  @Column({ name: 'otp_method', length: 10, nullable: true })
  otpMethod: string;

  @Column({ name: 'otp_sent_at', type: 'timestamptz', nullable: true })
  otpSentAt: Date;

  @Column({ name: 'otp_attempts', default: 0 })
  otpAttempts: number;

  @Column({ name: 'max_otp_attempts', default: 5 })
  maxOtpAttempts: number;

  /** Retry tracking for user-action states */
  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 10 })
  maxRetries: number;

  @Column({ name: 'last_retry_at', type: 'timestamptz', nullable: true })
  lastRetryAt: Date;

  /** Error info for failed state */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'error_code', length: 50, nullable: true })
  errorCode: string;

  /** Step log — chronological record of state transitions */
  @Column({ name: 'step_log', type: 'jsonb', default: '[]' })
  stepLog: Array<{ state: string; timestamp: string; detail?: string }>;

  /** Migration-specific: instructions shown to user */
  @Column({ name: 'migration_instructions', type: 'jsonb', nullable: true })
  migrationInstructions: string[];

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
