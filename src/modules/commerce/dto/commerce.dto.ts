import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, Min, Max, IsUUID } from 'class-validator';

export class ProvisionCatalogDto {
  @IsOptional()
  @IsString()
  catalogName?: string;
}

export class UpdateCatalogVisibilityDto {
  @IsBoolean()
  isCatalogVisible: boolean;

  @IsBoolean()
  isCartEnabled: boolean;
}

export class TriggerSyncDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsBoolean()
  forceFullSync?: boolean;
}

export class CreateCollectionDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}

export class UpdateCollectionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SendProductMessageDto {
  @IsString()
  to: string;

  @IsString()
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsString()
  footerText?: string;
}

export class SendMultiProductMessageDto {
  @IsString()
  to: string;

  @IsArray()
  @IsString({ each: true })
  productIds: string[];

  @IsOptional()
  @IsString()
  headerText?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsString()
  footerText?: string;
}

export class CollectionProductsDto {
  @IsArray()
  @IsString({ each: true })
  productIds: string[];
}
