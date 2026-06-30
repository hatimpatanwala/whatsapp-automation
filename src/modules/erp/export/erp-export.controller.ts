import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { ErpExportService } from './erp-export.service';

/**
 * Full ERP data export. All endpoints are GETs, so ErpFeatureGuard permits them
 * for downgraded-but-provisioned tenants too — that is the whole point: a tenant
 * who dropped the ERP plan can still pull every record out (company, customers,
 * sales, purchases, inventory) as Excel or CSV.
 */
@Controller('erp/export')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ErpExportController {
  constructor(private readonly service: ErpExportService) {}

  /** Grouped dataset list with record counts — drives the export page. */
  @Get('datasets')
  @Roles('owner', 'seller')
  async datasets(@Req() req: Request) {
    return this.service.datasetSummary(req.tenantContext.schemaName);
  }

  /** Everything in one workbook (a sheet per dataset). @Res() bypasses the envelope. */
  @Get('all.xlsx')
  @Roles('owner', 'seller')
  async all(@Req() req: Request, @Res() res: Response) {
    const buffer = await this.service.buildWorkbook(req.tenantContext.schemaName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="erp-data-export.xlsx"');
    res.send(buffer);
  }

  /** A single dataset as CSV. */
  @Get('csv/:key')
  @Roles('owner', 'seller')
  async csv(@Req() req: Request, @Param('key') key: string, @Res() res: Response) {
    const { filename, csv } = await this.service.buildCsv(req.tenantContext.schemaName, key);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
