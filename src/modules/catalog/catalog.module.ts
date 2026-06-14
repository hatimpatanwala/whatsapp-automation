import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { CategoryController } from './category.controller';
import { ProductService } from './product.service';
import { CategoryService } from './category.service';
import { MetaCatalogSyncService } from './meta-catalog-sync.service';
import { BulkUploadService } from './bulk-upload.service';
import { SeedProductsController } from './seed-products.controller';
import { DatabaseModule } from '../../database/database.module';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { CommerceSettingsHelper } from '../whatsapp/helpers/commerce-settings.helper';
import { WabaModule } from '../waba/waba.module';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([WabaAccount, PhoneNumber, Tenant]),
    forwardRef(() => WabaModule),
  ],
  controllers: [ProductController, CategoryController, SeedProductsController],
  providers: [ProductService, CategoryService, MetaCatalogSyncService, BulkUploadService, CommerceSettingsHelper],
  exports: [ProductService, CategoryService, MetaCatalogSyncService, BulkUploadService],
})
export class CatalogModule {}
