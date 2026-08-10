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
  // 'contra' was merged into 'journal' — a Contra is just a Journal restricted to
  // cash/bank ledgers, and both were handled identically. Journal is the more-used,
  // standard term (kept as the single manual double-entry voucher). Incoming 'contra'
  // is still accepted and normalised to 'journal' in AccountingService.insertVoucher.
  'journal',
  'debit_note',
  'credit_note',
] as const;

/** Legacy voucher types accepted on input but folded into a canonical type. */
export const VOUCHER_TYPE_ALIASES: Record<string, string> = { contra: 'journal' };

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
  // Accept legacy aliases (e.g. 'contra') so an older offline client still validates;
  // the service folds them to the canonical type.
  @IsIn([...(VOUCHER_TYPES as unknown as string[]), ...Object.keys(VOUCHER_TYPE_ALIASES)])
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
