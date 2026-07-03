import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountingPostingService } from './accounting-posting.service';
import { ErpSequenceService } from '../erp/common/erp-sequence.service';

/**
 * Double-entry accounting (Phase 4). TenantConnectionManager comes from the global
 * DatabaseModule; ErpSequenceService is re-provided here for voucher numbering.
 * AccountingPostingService auto-posts vouchers from commerce events.
 */
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, AccountingPostingService, ErpSequenceService],
  exports: [AccountingService],
})
export class AccountingModule {}
