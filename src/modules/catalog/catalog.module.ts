import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { CategoryController } from './category.controller';
import { BulkWebviewController } from './bulk-webview.controller';
import { BuilderModule } from '../builder/builder.module';
import { ProductService } from './product.service';
import { CategoryService } from './category.service';
import { BrandService } from './brand.service';
import { BrandController } from './brand.controller';
import { MetaCatalogSyncService } from './meta-catalog-sync.service';
import { BulkUploadService } from './bulk-upload.service';
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
    BuilderModule,
  ],
  controllers: [ProductController, CategoryController, BrandController, BulkWebviewController],
  providers: [ProductService, CategoryService, BrandService, MetaCatalogSyncService, BulkUploadService, CommerceSettingsHelper],
  exports: [ProductService, CategoryService, BrandService, MetaCatalogSyncService, BulkUploadService],
})
export class CatalogModule {}
