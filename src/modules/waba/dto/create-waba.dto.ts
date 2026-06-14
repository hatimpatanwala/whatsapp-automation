import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateWabaDto {
  @IsString()
  wabaId: string;

  @IsString()
  name: string;

  @IsString()
  businessId: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  // When provided, the account is created and immediately synced from Meta
  // (token stored + phone numbers pulled).
  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class AssignPhoneDto {
  @IsString()
  phoneId: string;

  @IsString()
  tenantId: string;
}

export class RegisterPhoneDto {
  @IsString()
  pin: string;
}

export class RequestCodeDto {
  @IsString()
  codeMethod: 'SMS' | 'VOICE';
}

export class VerifyCodeDto {
  @IsString()
  code: string;
}

export class StoreTokenDto {
  @IsString()
  wabaAccountId: string;

  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  tokenType?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class SyncWabaDto {
  @IsString()
  wabaId: string;

  @IsString()
  accessToken: string;
}
