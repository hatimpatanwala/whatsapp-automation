import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { CategoryService } from './category.service';
import { BrandService } from './brand.service';
import * as ExcelJS from 'exceljs';

export interface BulkUploadStatus {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  succeeded: number;
  created: number;
  updated: number;
  failed: number;
  errors: { row: number; name: string; error: string }[];
  startedAt?: Date;
  completedAt?: Date;
}

/** Ordered columns shared by the template, the export, and the parser. */
const COLUMNS: { header: string; key: string; width: number }[] = [
  { header: 'ID (do not edit)', key: 'id', width: 38 },
  { header: 'Name *', key: 'name', width: 30 },
  { header: 'Description', key: 'description', width: 40 },
  { header: 'Category', key: 'category', width: 20 },
  { header: 'Brand', key: 'brand', width: 20 },
  { header: 'Price *', key: 'price', width: 12 },
  { header: 'Sale Price', key: 'salePrice', width: 12 },
  { header: 'SKU', key: 'sku', width: 15 },
  { header: 'Barcode', key: 'barcode', width: 15 },
  { header: 'HSN Code', key: 'hsn', width: 14 },
  { header: 'GST %', key: 'gst', width: 10 },
  { header: 'Stock Quantity', key: 'stockQuantity', width: 15 },
  { header: 'Low Stock Threshold', key: 'lowStockThreshold', width: 18 },
  { header: 'Weight (g)', key: 'weight', width: 12 },
  { header: 'Image URL 1', key: 'image1', width: 40 },
  { header: 'Image URL 2', key: 'image2', width: 40 },
  { header: 'Image URL 3', key: 'image3', width: 40 },
  { header: 'Tags (comma separated)', key: 'tags', width: 25 },
  { header: 'Status', key: 'status', width: 12 },
];
const CATEGORY_COL = COLUMNS.findIndex((c) => c.key === 'category') + 1;
const BRAND_COL = COLUMNS.findIndex((c) => c.key === 'brand') + 1;
const STATUS_COL = COLUMNS.findIndex((c) => c.key === 'status') + 1;

@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);
  private readonly uploadStatus = new Map<string, BulkUploadStatus>();

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly categoryService: CategoryService,
    private readonly brandService: BrandService,
  ) {}

  private emptyStatus(): BulkUploadStatus {
    return { status: 'idle', total: 0, processed: 0, succeeded: 0, created: 0, updated: 0, failed: 0, errors: [] };
  }

  getStatus(schema: string): BulkUploadStatus {
    return this.uploadStatus.get(schema) || this.emptyStatus();
  }

  /** Build the styled Products sheet (+ category/status dropdowns, references, instructions). */
  private async buildWorkbook(schema: string, products?: any[]): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WhatsApp Commerce';
    const sheet = workbook.addWorksheet('Products');
    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF388E3C' } } };
    });
    headerRow.height = 28;
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Status dropdown
    for (let i = 2; i <= 2000; i++) {
      sheet.getCell(i, STATUS_COL).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"active,draft"'],
        showErrorMessage: true, errorTitle: 'Invalid Status', error: 'Status must be "active" or "draft"',
      };
    }

    // Categories reference + dropdown
    try {
      const categories = await this.categoryService.findAll(schema);
      if (categories.length > 0) {
        const catSheet = workbook.addWorksheet('Categories (Reference)');
        catSheet.columns = [
          { header: 'Category Name', key: 'name', width: 30 },
          { header: 'Category ID', key: 'id', width: 40 },
        ];
        catSheet.getRow(1).eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2196F3' } };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        });
        categories.forEach((c: any) => catSheet.addRow({ name: c.name, id: c.id }));
        const catNames = categories.map((c: any) => c.name).join(',');
        if (catNames.length < 255) {
          for (let i = 2; i <= 2000; i++) {
            sheet.getCell(i, CATEGORY_COL).dataValidation = {
              type: 'list', allowBlank: true, formulae: [`"${catNames}"`],
              showErrorMessage: true, errorTitle: 'Invalid Category', error: 'Pick a category from the list',
            };
          }
        }
      }
    } catch {
      /* categories optional */
    }

    // Brands reference + dropdown
    try {
      const brands = await this.brandService.findAll(schema);
      if (brands.length > 0) {
        const brSheet = workbook.addWorksheet('Brands (Reference)');
        brSheet.columns = [
          { header: 'Brand Name', key: 'name', width: 30 },
          { header: 'Brand ID', key: 'id', width: 40 },
        ];
        brSheet.getRow(1).eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF673AB7' } };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        });
        brands.forEach((b: any) => brSheet.addRow({ name: b.name, id: b.id }));
        const brNames = brands.map((b: any) => b.name).join(',');
        if (brNames.length < 255) {
          for (let i = 2; i <= 2000; i++) {
            sheet.getCell(i, BRAND_COL).dataValidation = {
              type: 'list', allowBlank: true, formulae: [`"${brNames}"`],
              showErrorMessage: true, errorTitle: 'Invalid Brand', error: 'Pick a brand from the list',
            };
          }
        }
      }
    } catch {
      /* brands optional */
    }

    if (products && products.length) {
      // Export mode: fill existing products (ID column locks them to updates).
      products.forEach((p) => sheet.addRow(p));
      // Grey the read-only ID column.
      for (let i = 2; i <= products.length + 1; i++) {
        sheet.getCell(i, 1).font = { color: { argb: 'FF999999' } };
      }
    } else {
      // Template mode: one greyed sample row.
      sheet.addRow({
        id: '', name: 'Sample Product (delete this row)', description: 'A sample product', category: '', brand: '',
        price: 299, salePrice: '', sku: 'SAMPLE-001', barcode: '', stockQuantity: 100, lowStockThreshold: 5,
        weight: '', image1: 'https://example.com/image.jpg', image2: '', image3: '', tags: 'sample, demo', status: 'active',
      });
      sheet.getRow(2).eachCell((cell) => (cell.font = { italic: true, color: { argb: 'FF999999' } }));
    }

    const instr = workbook.addWorksheet('Instructions');
    instr.columns = [{ header: '', key: 'text', width: 90 }];
    [
      'BULK PRODUCT UPLOAD & UPDATE',
      '',
      'DOWNLOAD: "Export Products" gives you this sheet with ALL your products filled in.',
      '',
      'TO UPDATE a product: keep its ID (column A) and change any other field, then re-upload.',
      'TO ADD a new product: add a row and LEAVE the ID column EMPTY (Name & Price required).',
      'TO match without an ID: a row with a SKU that already exists will UPDATE that product.',
      '',
      'TIPS:',
      '- Use the filter arrows on the header row to search/sort products.',
      '- Category must match a name from the "Categories (Reference)" sheet.',
      '- Status is "active" or "draft" (dropdown).',
      '- Up to 3 image URLs; tags are comma-separated.',
      '- Up to 1000 rows per upload.',
    ].forEach((text) => instr.addRow({ text }));
    instr.getRow(1).getCell(1).font = { bold: true, size: 14 };

    return workbook;
  }

  /** Empty template (with the sample row + dropdown filters). */
  async generateTemplate(schema: string): Promise<ExcelJS.Buffer> {
    const wb = await this.buildWorkbook(schema);
    return wb.xlsx.writeBuffer();
  }

  /** Export ALL products into the same sheet, ready to edit and re-upload. */
  async exportProducts(schema: string): Promise<ExcelJS.Buffer> {
    const products = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT p.id, p.name, p.description, c.name AS category_name, b.name AS brand_name,
                p.base_price, p.sale_price, p.metadata, p.images, p.is_active, p.hsn_code, p.gst_rate,
                COALESCE(inv.stock_quantity, 0) AS stock_quantity,
                COALESCE(inv.low_stock_threshold, 5) AS low_stock_threshold
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.variant_id IS NULL
          ORDER BY p.name ASC`,
      );
    });

    const rows = products.map((p: any) => {
      const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata || '{}') : p.metadata || {};
      const images: string[] = Array.isArray(p.images) ? p.images : [];
      const tags = Array.isArray(meta.tags) ? meta.tags.join(', ') : meta.tags || '';
      return {
        id: p.id,
        name: p.name,
        description: p.description || '',
        category: p.category_name || '',
        brand: p.brand_name || '',
        price: Number(p.base_price ?? 0),
        salePrice: p.sale_price != null ? Number(p.sale_price) : '',
        sku: meta.sku || '',
        barcode: meta.barcode || '',
        hsn: p.hsn_code || '',
        gst: p.gst_rate != null ? Number(p.gst_rate) : '',
        stockQuantity: Number(p.stock_quantity ?? 0),
        lowStockThreshold: Number(p.low_stock_threshold ?? 5),
        weight: meta.weight ?? '',
        image1: images[0] || '',
        image2: images[1] || '',
        image3: images[2] || '',
        tags,
        status: p.is_active ? 'active' : 'draft',
      };
    });

    const wb = await this.buildWorkbook(schema, rows);
    return wb.xlsx.writeBuffer();
  }

  async processUpload(schema: string, buffer: Buffer): Promise<void> {
    if (this.getStatus(schema).status === 'processing') {
      throw new Error('An upload is already in progress');
    }
    this.uploadStatus.set(schema, { ...this.emptyStatus(), status: 'processing', startedAt: new Date() });
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
    if (!sheet) throw new Error('No "Products" sheet found in the uploaded file');

    // Map headers → column index (tolerant of files with/without the ID column).
    const colOf = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, col) => {
      const h = (cell.value?.toString() || '').trim().toLowerCase();
      if (h.startsWith('id')) colOf.set('id', col);
      else if (h.startsWith('name')) colOf.set('name', col);
      else if (h.startsWith('description')) colOf.set('description', col);
      else if (h.startsWith('category')) colOf.set('category', col);
      else if (h.startsWith('brand')) colOf.set('brand', col);
      else if (h.startsWith('price')) colOf.set('price', col);
      else if (h.startsWith('sale')) colOf.set('salePrice', col);
      else if (h.startsWith('sku')) colOf.set('sku', col);
      else if (h.startsWith('barcode')) colOf.set('barcode', col);
      else if (h.startsWith('hsn')) colOf.set('hsn', col);
      else if (h.startsWith('gst')) colOf.set('gst', col);
      else if (h.startsWith('stock')) colOf.set('stockQuantity', col);
      else if (h.startsWith('low')) colOf.set('lowStockThreshold', col);
      else if (h.startsWith('weight')) colOf.set('weight', col);
      else if (h.startsWith('image url 1')) colOf.set('image1', col);
      else if (h.startsWith('image url 2')) colOf.set('image2', col);
      else if (h.startsWith('image url 3')) colOf.set('image3', col);
      else if (h.startsWith('tags')) colOf.set('tags', col);
      else if (h.startsWith('status')) colOf.set('status', col);
    });
    const get = (row: ExcelJS.Row, key: string) => (colOf.has(key) ? row.getCell(colOf.get(key)!).value : undefined);

    const categories = await this.categoryService.findAll(schema).catch(() => [] as any[]);
    const categoryMap = new Map<string, string>();
    categories.forEach((c: any) => categoryMap.set(c.name.toLowerCase(), c.id));

    const brands = await this.brandService.findAll(schema).catch(() => [] as any[]);
    const brandMap = new Map<string, string>();
    brands.forEach((b: any) => brandMap.set(b.name.toLowerCase(), b.id));

    const rows: any[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const name = get(row, 'name')?.toString()?.trim();
      if (!name || name === 'Sample Product (delete this row)') return;
      rows.push({
        rowNumber,
        id: get(row, 'id')?.toString()?.trim() || '',
        name,
        description: get(row, 'description')?.toString()?.trim() || '',
        category: get(row, 'category')?.toString()?.trim() || '',
        brand: get(row, 'brand')?.toString()?.trim() || '',
        price: this.parseNumber(get(row, 'price')),
        salePrice: this.parseNumber(get(row, 'salePrice')),
        sku: get(row, 'sku')?.toString()?.trim() || '',
        barcode: get(row, 'barcode')?.toString()?.trim() || '',
        hsn: get(row, 'hsn')?.toString()?.trim() || '',
        gst: this.parseNumber(get(row, 'gst')),
        stockQuantity: this.parseNumber(get(row, 'stockQuantity')) ?? 0,
        lowStockThreshold: this.parseNumber(get(row, 'lowStockThreshold')) ?? 5,
        weight: this.parseNumber(get(row, 'weight')),
        images: [get(row, 'image1'), get(row, 'image2'), get(row, 'image3')]
          .map((v) => v?.toString()?.trim())
          .filter(Boolean) as string[],
        tags: get(row, 'tags')?.toString()?.trim() || '',
        status: get(row, 'status')?.toString()?.trim()?.toLowerCase() || 'active',
      });
    });

    if (rows.length === 0) throw new Error('No product data found in the uploaded file');
    if (rows.length > 1000) throw new Error('Maximum 1000 products per upload. Please split into multiple files.');

    const status = this.uploadStatus.get(schema)!;
    status.total = rows.length;

    for (const row of rows) {
      try {
        if (!row.name) throw new Error('Product name is required');
        if (row.price === null || row.price === undefined || isNaN(row.price)) throw new Error('Valid price is required');

        let categoryId: string | null = null;
        if (row.category) {
          categoryId = categoryMap.get(row.category.toLowerCase()) || null;
          if (!categoryId) throw new Error(`Category "${row.category}" not found`);
        }

        let brandId: string | null = null;
        if (row.brand) {
          brandId = brandMap.get(row.brand.toLowerCase()) || null;
          if (!brandId) throw new Error(`Brand "${row.brand}" not found`);
        }

        const isActive = row.status !== 'draft';
        const tags = row.tags ? row.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const metadata = JSON.stringify({ sku: row.sku, barcode: row.barcode, weight: row.weight, tags });

        const action = await this.connectionManager.executeInTransaction(schema, async (qr) => {
          // Resolve an existing product: by ID, else by SKU.
          let existingId: string | null = null;
          if (row.id) {
            const r = await qr.query(`SELECT id FROM products WHERE id = $1 LIMIT 1`, [row.id]);
            if (!r.length) throw new Error(`Product ID "${row.id}" not found`);
            existingId = r[0].id;
          } else if (row.sku) {
            const r = await qr.query(`SELECT id FROM products WHERE metadata->>'sku' = $1 LIMIT 1`, [row.sku]);
            existingId = r[0]?.id || null;
          }

          if (existingId) {
            await qr.query(
              `UPDATE products SET name = $1, description = $2, category_id = $3, base_price = $4,
                      sale_price = $5, images = $6, is_active = $7, metadata = $8, brand_id = $9,
                      hsn_code = $10, gst_rate = $11, updated_at = NOW()
                WHERE id = $12`,
              [row.name, row.description, categoryId, row.price, row.salePrice || null,
               row.images.length ? row.images : [], isActive, metadata, brandId,
               row.hsn || null, row.gst ?? null, existingId],
            );
            const inv = await qr.query(`SELECT id FROM inventory WHERE product_id = $1 AND variant_id IS NULL LIMIT 1`, [existingId]);
            if (inv.length) {
              await qr.query(`UPDATE inventory SET stock_quantity = $1, low_stock_threshold = $2 WHERE id = $3`,
                [row.stockQuantity, row.lowStockThreshold, inv[0].id]);
            } else {
              await qr.query(`INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold) VALUES ($1, $2, $3)`,
                [existingId, row.stockQuantity, row.lowStockThreshold]);
            }
            return 'updated';
          }

          const slug = row.sku || row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const product = await qr.query(
            `INSERT INTO products (name, slug, description, category_id, base_price, sale_price, currency, images, has_variants, is_active, translations, metadata, brand_id, hsn_code, gst_rate)
             VALUES ($1, $2, $3, $4, $5, $6, 'INR', $7, false, $8, '{}', $9, $10, $11, $12) RETURNING id`,
            [row.name, slug, row.description, categoryId, row.price, row.salePrice || null,
             row.images.length ? row.images : [], isActive, metadata, brandId, row.hsn || null, row.gst ?? null],
          );
          await qr.query(`INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold) VALUES ($1, $2, $3)`,
            [product[0].id, row.stockQuantity, row.lowStockThreshold]);
          return 'created';
        });

        status.succeeded++;
        if (action === 'updated') status.updated++;
        else status.created++;
      } catch (err: any) {
        status.failed++;
        status.errors.push({ row: row.rowNumber, name: row.name || `Row ${row.rowNumber}`, error: err.message || 'Unknown error' });
      }
      status.processed++;
    }

    status.status = status.failed === status.total ? 'failed' : 'completed';
    status.completedAt = new Date();
    this.logger.log(
      `Bulk upload for ${schema}: ${status.created} created, ${status.updated} updated, ${status.failed} failed (of ${status.total})`,
    );
  }

  clearStatus(schema: string): void {
    this.uploadStatus.delete(schema);
  }

  private parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    // ExcelJS cells can be objects (formula/result) — coerce.
    const raw = typeof value === 'object' && value !== null && 'result' in value ? (value as any).result : value;
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return isNaN(num) ? null : num;
  }
}
