import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsObject, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  // HSN/SAC code for GST invoices (optional).
  @IsOptional()
  @IsString()
  hsnCode?: string;

  // GST rate % applied on invoices (optional).
  @IsOptional()
  @IsNumber()
  @Min(0)
  gstRate?: number;

  // Accept either "basePrice" or "price" from the frontend
  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  uom?: string;

  // Dual units (Miracle): alternate unit + conversion factor (1 altUom = uomFactor × uom).
  @IsOptional()
  @IsString()
  altUom?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  uomFactor?: number;

  // Item-master rates (Miracle): purchase rate and MRP alongside the sale rate.
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mrp?: number;

  // Opening stock valuation rate (Miracle item master).
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingRate?: number;

  // ─── Item Master field parity (ITEM_MASTER_FIELDS_README.md) ───────────────
  @IsOptional() @IsString() itemType?: string; // 'product' | 'service'
  @IsOptional() @IsString() uqc?: string; // GST Unit Quantity Code
  @IsOptional() @IsBoolean() priceIncludesTax?: boolean;
  @IsOptional() @IsNumber() @Min(0) saleDiscountPct?: number;
  @IsOptional() @IsNumber() @Min(0) wholesalePrice?: number;
  @IsOptional() @IsNumber() @Min(0) wholesaleMinQty?: number;
  @IsOptional() @IsNumber() @Min(0) minSalePrice?: number;
  @IsOptional() @IsNumber() @Min(0) maxSalePrice?: number;
  @IsOptional() @IsNumber() @Min(0) cessPct?: number;
  @IsOptional() @IsBoolean() taxExempt?: boolean;
  @IsOptional() @IsString() openingStockDate?: string;
  @IsOptional() @IsNumber() @Min(0) maxStock?: number;
  @IsOptional() @IsString() rackLocation?: string;
  @IsOptional() @IsString() trackingMode?: string; // 'none' | 'batch' | 'serial'

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsArray()
  imageUrls?: string[];

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsBoolean()
  hasVariants?: boolean;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  @IsNumber()
  initialStock?: number;

  @IsOptional()
  @IsNumber()
  stockQuantity?: number;

  @IsOptional()
  @IsNumber()
  lowStockThreshold?: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsObject()
  translations?: Record<string, any>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;

  @IsOptional()
  @IsArray()
  variants?: any[];
}
