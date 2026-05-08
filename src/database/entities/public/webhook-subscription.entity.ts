import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tracks webhook subscriptions per WABA.
 * Ensures we can verify, renew, and audit webhook state.
 */
@Entity({ name: 'webhook_subscriptions', schema: 'public' })
@Index('idx_webhook_waba_id', ['wabaId'])
@Index('idx_webhook_status', ['status'])
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'waba_account_id', type: 'uuid' })
  wabaAccountId: string;

  @Column({ name: 'waba_id', length: 50 })
  wabaId: string;

  /** Subscribed fields: messages, message_template_status_update, etc. */
  @Column({ name: 'subscribed_fields', type: 'jsonb', default: '[]' })
  subscribedFields: string[];

  @Column({ length: 20, default: 'active' })
  status: 'active' | 'inactive' | 'failed' | 'pending';

  @Column({ name: 'last_verified_at', type: 'timestamptz', nullable: true })
  lastVerifiedAt: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  /** The app that is subscribed (our platform app ID) */
  @Column({ name: 'app_id', length: 50, nullable: true })
  appId: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
