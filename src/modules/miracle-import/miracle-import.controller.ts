import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { MiracleImportService } from './miracle-import.service';

/**
 * Super-admin Miracle data-migration tool.
 *
 * Upload a Miracle CMP export (.zip) with a target email + password:
 *   - no user with that email  → a fresh tenant + owner user is provisioned
 *   - user already exists       → their tenant is targeted
 * then the whole company (parties, products, ledgers, and 8 years of invoices,
 * purchases, receipts & payments) is migrated. Re-running the same export
 * updates instead of duplicating (keyed by Miracle record codes).
 */
@Controller('admin/miracle-import')
@UseGuards(SuperAdminGuard)
export class MiracleImportController {
  constructor(private readonly service: MiracleImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 256 * 1024 * 1024 } }))
  async start(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() body: { email?: string; password?: string; businessName?: string; importInvoices?: string; postAccounting?: string; sellerGstin?: string; sellerAddress?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!/\.zip$/i.test(file.originalname || '')) throw new BadRequestException('Upload the Miracle company .zip export');
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('A valid email is required');
    if (password.length < 6) throw new BadRequestException('Password must be at least 6 characters (used only if the user must be created)');

    const runId = this.service.start(file.buffer, file.originalname, {
      email,
      password,
      businessName: body.businessName,
      importInvoices: body.importInvoices !== 'false',
      postAccounting: body.postAccounting !== 'false',
      sellerGstin: body.sellerGstin?.trim(),
      sellerAddress: body.sellerAddress?.trim(),
    });
    return { runId, status: 'started' };
  }

  /** Upload a physical stock-take (xlsx/csv: item name + closing quantity) to set on-hand levels. */
  @Post('stock-take')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 32 * 1024 * 1024 } }))
  async stockTake(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() body: { email?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!/\.(xlsx|csv)$/i.test(file.originalname || '')) throw new BadRequestException('Upload an .xlsx or .csv stock sheet');
    const email = (body.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('The target tenant email is required');
    return this.service.stockTake(file.buffer, file.originalname, email);
  }

  @Get('runs/:id')
  status(@Param('id') id: string) {
    const run = this.service.getRun(id);
    if (!run) throw new BadRequestException('Unknown import run');
    return run;
  }
}
