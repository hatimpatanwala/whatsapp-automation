import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ErpDocumentService } from './erp-document.service';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

/** Streams a template-driven Quotation PDF (mirrors the invoice/offer/PO/receipt routes). */
@Controller('erp/quotes')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ErpQuotePdfController {
  constructor(private readonly documents: ErpDocumentService) {}

  @Get(':id/pdf')
  @Roles('owner', 'seller')
  async pdf(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.documents.getQuotePdf(req.tenantContext.schemaName, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
