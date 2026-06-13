import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  businessName?: string;
}

export class SendEmailOtpDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  businessName?: string;
}

export class VerifyEmailOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  code: string;
}
