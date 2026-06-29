import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../../database/database.module';
import { WabaModule } from '../waba/waba.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AbandonedCartService } from './abandoned-cart.service';
import { TenantCatalog } from '../../database/entities/public/tenant-catalog.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { EventsModule } from '../events/events.module';
import { BuilderModule } from '../builder/builder.module';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { CatalogSyncService } from './catalog-sync.service';
import { CatalogSyncProcessor } from './catalog-sync.processor';
import { CollectionService } from './collection.service';
import { ProductMessageService } from './product-message.service';
import { CatalogSyncCron } from './catalog-sync.cron';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([TenantCatalog, Tenant, WabaAccount, PhoneNumber]),
    EventsModule,
    BuilderModule,
    forwardRef(() => WabaModule),
    forwardRef(() => WhatsAppModule),
  ],
  controllers: [CommerceController],
  providers: [
    CommerceService,
    CatalogSyncService,
    CatalogSyncProcessor,
    CollectionService,
    ProductMessageService,
    CatalogSyncCron,
    AbandonedCartService,
  ],
  exports: [CommerceService, CatalogSyncService, ProductMessageService, CollectionService],
})
export class CommerceModule {}
