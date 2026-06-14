import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { CategoryService } from './category.service';
import * as ExcelJS from 'exceljs';

export interface BulkUploadStatus {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors: { row: number; name: string; error: string }[];
  startedAt?: Date;
  completedAt?: Date;
}

@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);
  private readonly uploadStatus = new Map<string, BulkUploadStatus>();

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly categoryService: CategoryService,
  ) {}

  getStatus(schema: string): BulkUploadStatus {
    return this.uploadStatus.get(schema) || {
      status: 'idle',
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };
  }

  async generateTemplate(schema: string): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WhatsApp Commerce';

    // Main products sheet
    const sheet = workbook.addWorksheet('Products');

    sheet.columns = [
      { header: 'Name *', key: 'name', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Price *', key: 'price', width: 12 },
      { header: 'Sale Price', key: 'salePrice', width: 12 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Barcode', key: 'barcode', width: 15 },
      { header: 'Stock Quantity', key: 'stockQuantity', width: 15 },
      { header: 'Low Stock Threshold', key: 'lowStockThreshold', width: 18 },
      { header: 'Weight (g)', key: 'weight', width: 12 },
      { header: 'Image URL 1', key: 'image1', width: 40 },
      { header: 'Image URL 2', key: 'image2', width: 40 },
      { header: 'Image URL 3', key: 'image3', width: 40 },
      { header: 'Tags (comma separated)', key: 'tags', width: 25 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4CAF50' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF388E3C' } },
      };
    });
    headerRow.height = 28;

    // Add status dropdown validation
    const statusCol = 15; // Column O
    for (let i = 2; i <= 1000; i++) {
      sheet.getCell(i, statusCol).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"active,draft"'],
        showErrorMessage: true,
        errorTitle: 'Invalid Status',
        error: 'Status must be either "active" or "draft"',
      };
    }

    // Load categories and add them to a reference sheet
    try {
      const categories = await this.categoryService.findAll(schema);
      if (categories.length > 0) {
        const catSheet = workbook.addWorksheet('Categories (Reference)');
        catSheet.columns = [
          { header: 'Category Name', key: 'name', width: 30 },
          { header: 'Category ID', key: 'id', width: 40 },
        ];

        const catHeaderRow = catSheet.getRow(1);
        catHeaderRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2196F3' },
          };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        });

        categories.forEach((c: any) => catSheet.addRow({ name: c.name, id: c.id }));

        // Add category name validation on main sheet
        const catNames = categories.map((c: any) => c.name).join(',');
        if (catNames.length < 255) {
          for (let i = 2; i <= 1000; i++) {
            sheet.getCell(i, 3).dataValidation = {
              type: 'list',
              allowBlank: true,
              formulae: [`"${catNames}"`],
              showErrorMessage: true,
              errorTitle: 'Invalid Category',
              error: 'Please select a category from the list',
            };
          }
        }
      }
    } catch {
      // Categories reference is optional
    }

    // Add a sample row
    sheet.addRow({
      name: 'Sample Product (delete this row)',
      description: 'A sample product description',
      category: '',
      price: 299,
      salePrice: '',
      sku: 'SAMPLE-001',
      barcode: '',
      stockQuantity: 100,
      lowStockThreshold: 5,
      weight: '',
      image1: 'https://example.com/image.jpg',
      image2: '',
      image3: '',
      tags: 'sample, demo',
      status: 'active',
    });

    // Style sample row as italic/gray
    const sampleRow = sheet.getRow(2);
    sampleRow.eachCell((cell) => {
      cell.font = { italic: true, color: { argb: 'FF999999' } };
    });

    // Instructions sheet
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.columns = [{ header: '', key: 'text', width: 80 }];
    const instructions = [
      'BULK PRODUCT UPLOAD INSTRUCTIONS',
      '',
      '1. Fill in the "Products" sheet with your product data',
      '2. Fields marked with * are required (Name, Price)',
      '3. Category must match an existing category name (see "Categories" sheet)',
      '4. Price and Sale Price should be numeric values',
      '5. Stock Quantity defaults to 0 if left empty',
      '6. Low Stock Threshold defaults to 5 if left empty',
      '7. Image URLs should be valid, publicly accessible URLs',
      '8. Tags should be comma-separated (e.g., "electronics, sale, featured")',
      '9. Status can be "active" or "draft" (defaults to "active")',
      '10. Delete the sample row before uploading',
      '',
      'TIPS:',
      '- You can add up to 3 image URLs per product',
      '- Use the Categories reference sheet to find valid category names',
      '- Duplicate SKUs will be skipped',
      '- Maximum 500 products per upload',
    ];
    instructions.forEach((text) => instrSheet.addRow({ text }));
    const instrTitle = instrSheet.getRow(1);
    instrTitle.getCell(1).font = { bold: true, size: 14 };

    return workbook.xlsx.writeBuffer();
  }

  async processUpload(schema: string, buffer: Buffer): Promise<void> {
    const current = this.getStatus(schema);
    if (current.status === 'processing') {
      throw new Error('An upload is already in progress');
    }

    this.uploadStatus.set(schema, {
      status: 'processing',
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      startedAt: new Date(),
    });

    // Run in background - don't await
    this.processInBackground(schema, buffer).catch((err) => {
      this.logger.error(`Bulk upload failed for ${schema}: ${err.message}`);
      const status = this.uploadStatus.get(schema)!;
      status.status = 'failed';
      status.completedAt = new Date();
      status.errors.push({ row: 0, name: '', error: `Upload failed: ${err.message}` });
    });
  }

  private async processInBackground(schema: string, buffer: Buffer): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet('Products') || workbook.getWorksheet(1);
    if (!sheet) {
      throw new Error('No "Products" sheet found in the uploaded file');
    }

    // Build category name->id map
    let categories: any[] = [];
    try {
      categories = await this.categoryService.findAll(schema);
    } catch {
      // Continue without categories
    }
    const categoryMap = new Map<string, string>();
    categories.forEach((c: any) => categoryMap.set(c.name.toLowerCase(), c.id));

    // Parse rows (skip header)
    const rows: any[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const name = row.getCell(1).value?.toString()?.trim();
      if (!name || name === 'Sample Product (delete this row)') return;

      rows.push({
        rowNumber,
        name,
        description: row.getCell(2).value?.toString()?.trim() || '',
        category: row.getCell(3).value?.toString()?.trim() || '',
        price: this.parseNumber(row.getCell(4).value),
        salePrice: this.parseNumber(row.getCell(5).value),
        sku: row.getCell(6).value?.toString()?.trim() || '',
        barcode: row.getCell(7).value?.toString()?.trim() || '',
        stockQuantity: this.parseNumber(row.getCell(8).value) ?? 0,
        lowStockThreshold: this.parseNumber(row.getCell(9).value) ?? 5,
        weight: this.parseNumber(row.getCell(10).value),
        images: [
          row.getCell(11).value?.toString()?.trim(),
          row.getCell(12).value?.toString()?.trim(),
          row.getCell(13).value?.toString()?.trim(),
        ].filter(Boolean) as string[],
        tags: row.getCell(14).value?.toString()?.trim() || '',
        status: row.getCell(15).value?.toString()?.trim()?.toLowerCase() || 'active',
      });
    });

    if (rows.length === 0) {
      throw new Error('No product data found in the uploaded file');
    }

    if (rows.length > 500) {
      throw new Error('Maximum 500 products per upload. Please split into multiple files.');
    }

    const status = this.uploadStatus.get(schema)!;
    status.total = rows.length;

    // Process each product
    for (const row of rows) {
      try {
        // Validate required fields
        if (!row.name) {
          throw new Error('Product name is required');
        }
        if (row.price === null || row.price === undefined || isNaN(row.price)) {
          throw new Error('Valid price is required');
        }

        // Resolve category
        let categoryId: string | undefined;
        if (row.category) {
          categoryId = categoryMap.get(row.category.toLowerCase());
          if (!categoryId) {
            throw new Error(`Category "${row.category}" not found`);
          }
        }

        const slug = row.sku || row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const isActive = row.status !== 'draft';
        const tags = row.tags ? row.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const metadata = JSON.stringify({
          sku: row.sku,
          barcode: row.barcode,
          weight: row.weight,
          tags,
        });

        await this.connectionManager.executeInTransaction(schema, async (qr) => {
          // Check for duplicate SKU
          if (row.sku) {
            const existing = await qr.query(
              `SELECT id FROM products WHERE metadata->>'sku' = $1 AND is_active = true LIMIT 1`,
              [row.sku],
            );
            if (existing.length > 0) {
              throw new Error(`Duplicate SKU "${row.sku}" — product already exists`);
            }
          }

          const product = await qr.query(
            `INSERT INTO products (name, slug, description, category_id, base_price, sale_price, currency, images, has_variants, is_active, translations, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, 'INR', $7, false, $8, '{}', $9)
             RETURNING id`,
            [
              row.name, slug, row.description, categoryId || null,
              row.price, row.salePrice || null,
              row.images.length > 0 ? row.images : [],
              isActive, metadata,
            ],
          );

          // Create inventory record
          await qr.query(
            `INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold)
             VALUES ($1, $2, $3)`,
            [product[0].id, row.stockQuantity, row.lowStockThreshold],
          );
        });

        status.succeeded++;
      } catch (err: any) {
        status.failed++;
        status.errors.push({
          row: row.rowNumber,
          name: row.name || `Row ${row.rowNumber}`,
          error: err.message || 'Unknown error',
        });
      }

      status.processed++;
    }

    status.status = status.failed === status.total ? 'failed' : 'completed';
    status.completedAt = new Date();

    this.logger.log(
      `Bulk upload for ${schema}: ${status.succeeded}/${status.total} succeeded, ${status.failed} failed`,
    );
  }

  clearStatus(schema: string): void {
    this.uploadStatus.delete(schema);
  }

  private parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(num) ? null : num;
  }
}
