import { IsString, IsOptional, IsObject, Matches, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  wabaId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;

  @IsOptional()
  @IsString()
  ownerPhone?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  ownerPassword?: string;

  // OAuth / social signup: the owner originates from a social provider and may
  // have no password. authProvider defaults to 'password'.
  @IsOptional()
  @IsString()
  authProvider?: 'password' | 'google' | 'meta';

  @IsOptional()
  @IsString()
  providerUserId?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  ownerEmailVerified?: boolean;
}
