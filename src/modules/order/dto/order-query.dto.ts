import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Orders list query: pagination + the order-specific filters. Declared here so
 * the global ValidationPipe (whitelist + forbidNonWhitelisted) accepts
 * ?status= and ?paymentStatus= instead of rejecting them.
 */
export class OrderQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;
}
