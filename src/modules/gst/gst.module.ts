import { Module } from '@nestjs/common';
import { GstController } from './gst.controller';
import { GstReturnsService } from './gst-returns.service';
import { EInvoiceService } from './einvoice.service';
import { Gstr2bService } from './gstr2b.service';
import { SellerProfileService } from './seller-profile.service';

/**
 * GST compliance (Phase 5): GSTR-1 / GSTR-3B / HSN summary / portal JSON, GSTR-2B
 * reconciliation, and e-invoice IRN — plus the seller master read from tenant settings.
 * TenantConnectionManager comes from the global DatabaseModule.
 */
@Module({
  controllers: [GstController],
  providers: [GstReturnsService, EInvoiceService, Gstr2bService, SellerProfileService],
  exports: [GstReturnsService, EInvoiceService, Gstr2bService, SellerProfileService],
})
export class GstModule {}
