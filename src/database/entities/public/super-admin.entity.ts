import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'super_admins', schema: 'public' })
export class SuperAdmin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ length: 255, nullable: true })
  name: string;

  @Column({ length: 50, default: 'admin' })
  role: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
