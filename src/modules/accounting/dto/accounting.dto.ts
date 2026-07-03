import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export const VOUCHER_TYPES = [
  'sales',
  'purchase',
  'payment',
  'receipt',
  'contra',
  'journal',
  'debit_note',
  'credit_note',
] as const;

export class CreateLedgerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUUID()
  groupId!: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsOptional()
  @IsIn(['dr', 'cr'])
  openingType?: 'dr' | 'cr';

  @IsOptional()
  @IsString()
  gstin?: string;
}

export class VoucherEntryDto {
  @IsUUID()
  ledgerId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  narration?: string;
}

export class CreateVoucherDto {
  @IsIn(VOUCHER_TYPES as unknown as string[])
  type!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  narration?: string;

  @IsOptional()
  @IsUUID()
  partyLedgerId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoucherEntryDto)
  entries!: VoucherEntryDto[];
}
