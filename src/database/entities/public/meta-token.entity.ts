import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { WabaAccount } from './waba-account.entity';

@Entity({ name: 'meta_tokens', schema: 'public' })
export class MetaToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'waba_account_id' })
  wabaAccountId: string;

  @ManyToOne(() => WabaAccount)
  @JoinColumn({ name: 'waba_account_id' })
  wabaAccount: WabaAccount;

  @Column({ name: 'token_type', length: 30 })
  tokenType: string;

  @Column({ name: 'encrypted_token', type: 'text' })
  encryptedToken: string;

  @Column({ name: 'token_hash', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @Column({ name: 'last_rotated_at', type: 'timestamptz', nullable: true })
  lastRotatedAt: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  scopes: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
