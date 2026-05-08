import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PhoneNumber } from './phone-number.entity';

@Entity({ name: 'quality_scores', schema: 'public' })
export class QualityScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'phone_number_id' })
  phoneNumberId: string;

  @ManyToOne(() => PhoneNumber)
  @JoinColumn({ name: 'phone_number_id' })
  phoneNumber: PhoneNumber;

  @Column({ name: 'quality_rating', length: 20 })
  qualityRating: string;

  @Column({ name: 'previous_rating', length: 20, nullable: true })
  previousRating: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'NOW()' })
  recordedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
