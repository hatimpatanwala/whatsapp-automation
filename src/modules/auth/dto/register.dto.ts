import { IsString, IsOptional, IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  phone: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  role?: string;
}
