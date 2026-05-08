import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateRegistry } from '../../../database/entities/public/template-registry.entity';
import { MetaToken } from '../../../database/entities/public/meta-token.entity';
import { AuditLog } from '../../../database/entities/public/audit-log.entity';
import { TemplateService } from './template.service';
import { TemplateController } from './template.controller';
import { MetaCloudApiClient } from '../meta-cloud-api.client';
import { MetaTokenService } from '../meta-token.service';
import { AuditLogService } from '../audit-log.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TemplateRegistry, MetaToken, AuditLog]),
  ],
  controllers: [TemplateController],
  providers: [TemplateService, MetaCloudApiClient, MetaTokenService, AuditLogService],
  exports: [TemplateService],
})
export class TemplateModule {}
