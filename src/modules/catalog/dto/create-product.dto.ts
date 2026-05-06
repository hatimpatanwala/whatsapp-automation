import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsObject, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsBoolean()
  hasVariants?: boolean;

  @IsOptional()
  @IsNumber()
  initialStock?: number;

  @IsOptional()
  @IsNumber()
  lowStockThreshold?: number;

  @IsOptional()
  @IsObject()
  translations?: Record<string, any>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
