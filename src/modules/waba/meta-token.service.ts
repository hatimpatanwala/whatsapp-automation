import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { MetaToken } from '../../database/entities/public/meta-token.entity';

@Injectable()
export class MetaTokenService {
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(
    @InjectRepository(MetaToken)
    private readonly tokenRepo: Repository<MetaToken>,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key || key.length < 32 || key.includes('default')) {
      throw new Error(
        'FATAL: TOKEN_ENCRYPTION_KEY must be set to a secure 32+ character random string. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    this.encryptionKey = createHash('sha256').update(key).digest();
  }

  async getActiveToken(wabaAccountId: string, tokenType = 'system_user'): Promise<string> {
    const token = await this.tokenRepo.findOne({
      where: { wabaAccountId, tokenType, isActive: true },
      order: { createdAt: 'DESC' },
    });
    if (!token) throw new NotFoundException('No active token found for this WABA account');
    return this.decrypt(token.encryptedToken);
  }

  async storeToken(wabaAccountId: string, plainToken: string, tokenType = 'system_user', expiresAt?: Date): Promise<MetaToken> {
    // Deactivate previous tokens of same type
    await this.tokenRepo.update(
      { wabaAccountId, tokenType, isActive: true },
      { isActive: false },
    );

    const encrypted = this.encrypt(plainToken);
    const tokenHash = createHash('sha256').update(plainToken).digest('hex').substring(0, 64);

    const token = this.tokenRepo.create({
      wabaAccountId,
      tokenType,
      encryptedToken: encrypted,
      tokenHash,
      expiresAt,
      isActive: true,
      lastRotatedAt: new Date(),
    });
    return this.tokenRepo.save(token);
  }

  async rotateToken(wabaAccountId: string, newPlainToken: string, tokenType = 'system_user'): Promise<MetaToken> {
    return this.storeToken(wabaAccountId, newPlainToken, tokenType);
  }

  async revokeAllTokens(wabaAccountId: string): Promise<number> {
    const result = await this.tokenRepo.update(
      { wabaAccountId, isActive: true },
      { isActive: false },
    );
    return result.affected || 0;
  }

  async isTokenExpired(wabaAccountId: string, tokenType = 'system_user'): Promise<boolean> {
    const token = await this.tokenRepo.findOne({
      where: { wabaAccountId, tokenType, isActive: true },
    });
    if (!token) return true;
    if (!token.expiresAt) return false;
    return new Date() > token.expiresAt;
  }

  private encrypt(plainText: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
