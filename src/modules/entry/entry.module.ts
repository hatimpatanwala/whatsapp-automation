import { Module } from '@nestjs/common';
import { EntryContextController } from './entry-context.controller';
import { EntryContextService } from './entry-context.service';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PartyController } from './party.controller';
import { PartyService } from './party.service';

/**
 * Keyboard-first entry screens' backend (Tally/Miracle-style billing intelligence):
 * party/item typeahead + live context (stock, outstanding, party-wise last rate),
 * the pricing masters (price levels, per-party credit control), and the unified
 * Party Master (GST ledger-party — PARTY_MASTER_README.md).
 */
@Module({
  controllers: [EntryContextController, PricingController, PartyController],
  providers: [EntryContextService, PricingService, PartyService],
  exports: [EntryContextService, PricingService, PartyService],
})
export class EntryModule {}
