import { Module } from '@nestjs/common';
import { EntryContextController } from './entry-context.controller';
import { EntryContextService } from './entry-context.service';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

/**
 * Keyboard-first entry screens' backend (Tally/Miracle-style billing intelligence):
 * party/item typeahead + live context (stock, outstanding, party-wise last rate),
 * plus the pricing masters (price levels, per-party credit control).
 */
@Module({
  controllers: [EntryContextController, PricingController],
  providers: [EntryContextService, PricingService],
  exports: [EntryContextService, PricingService],
})
export class EntryModule {}
