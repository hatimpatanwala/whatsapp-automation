import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockReservationService } from './stock-reservation.service';
import { ReservationCleanupProcessor } from './reservation-cleanup.processor';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, StockReservationService, ReservationCleanupProcessor],
  exports: [InventoryService, StockReservationService],
})
export class InventoryModule {}
