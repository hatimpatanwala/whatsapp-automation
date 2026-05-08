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
import { PhoneNumber } from './phone-number.entity';

/**
 * Per-phone-number health metrics.
 * Tracks quality rating history, delivery metrics, abuse signals, and throttle state.
 * Updated by webhook events and periodic health checks.
 */
@Entity({ name: 'number_health', schema: 'public' })
@Index('idx_health_phone', ['phoneNumberId'], { unique: true })
export class NumberHealth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'phone_number_id' })
  phoneNumberId: string;

  @ManyToOne(() => PhoneNumber)
  @JoinColumn({ name: 'phone_number_id' })
  phoneNumber: PhoneNumber;

  /** Current Meta quality rating: GREEN, YELLOW, RED */
  @Column({ name: 'quality_rating', length: 10, default: 'GREEN' })
  qualityRating: string;

  /** Previous quality rating (for tracking transitions) */
  @Column({ name: 'previous_quality_rating', length: 10, nullable: true })
  previousQualityRating: string;

  @Column({ name: 'quality_changed_at', type: 'timestamptz', nullable: true })
  qualityChangedAt: Date;

  /** Current Meta messaging limit tier */
  @Column({ name: 'messaging_limit_tier', length: 20, default: 'TIER_1K' })
  messagingLimitTier: string;

  /** Delivery metrics (rolling 24h) */
  @Column({ name: 'messages_sent_24h', default: 0 })
  messagesSent24h: number;

  @Column({ name: 'messages_delivered_24h', default: 0 })
  messagesDelivered24h: number;

  @Column({ name: 'messages_read_24h', default: 0 })
  messagesRead24h: number;

  @Column({ name: 'messages_failed_24h', default: 0 })
  messagesFailed24h: number;

  /** Delivery rate (0-100) */
  @Column({ name: 'delivery_rate', type: 'decimal', precision: 5, scale: 2, default: 100 })
  deliveryRate: number;

  /** Read rate (0-100) */
  @Column({ name: 'read_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  readRate: number;

  /** Abuse signals */
  @Column({ name: 'spam_reports_24h', default: 0 })
  spamReports24h: number;

  @Column({ name: 'blocks_24h', default: 0 })
  blocks24h: number;

  @Column({ name: 'template_rejections_30d', default: 0 })
  templateRejections30d: number;

  /** Throttle state */
  @Column({ name: 'is_throttled', default: false })
  isThrottled: boolean;

  @Column({ name: 'throttle_until', type: 'timestamptz', nullable: true })
  throttleUntil: Date;

  @Column({ name: 'throttle_reason', type: 'text', nullable: true })
  throttleReason: string;

  /** Quality history — last 30 transitions */
  @Column({ name: 'quality_history', type: 'jsonb', default: '[]' })
  qualityHistory: Array<{ rating: string; timestamp: string; event?: string }>;

  /** Composite health score (0-100, higher = healthier) */
  @Column({ name: 'health_score', default: 100 })
  healthScore: number;

  @Column({ name: 'last_health_check', type: 'timestamptz', nullable: true })
  lastHealthCheck: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
