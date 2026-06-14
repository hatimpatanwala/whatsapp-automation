import { Controller, Post, Body, HttpCode, HttpStatus, ForbiddenException, Logger } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { CategoryService } from './category.service';

const SEED_SECRET = process.env.SEED_SECRET || 'wa-seed-2026-patanwala';

const CATEGORIES = [
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Clothing & Fashion', slug: 'clothing-fashion' },
  { name: 'Home & Kitchen', slug: 'home-kitchen' },
  { name: 'Beauty & Personal Care', slug: 'beauty-personal-care' },
  { name: 'Sports & Fitness', slug: 'sports-fitness' },
  { name: 'Books & Stationery', slug: 'books-stationery' },
  { name: 'Grocery & Gourmet', slug: 'grocery-gourmet' },
  { name: 'Toys & Games', slug: 'toys-games' },
];

const PRODUCTS = [
  {
    name: 'Wireless Bluetooth Earbuds', description: 'Premium wireless earbuds with active noise cancellation, 30-hour battery life, and IPX5 water resistance.',
    category: 'Electronics', price: 2499, salePrice: 1999, sku: 'ELEC-BT-001', stock: 150,
    images: ['https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=800&q=80','https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=800&q=80'],
    tags: ['earbuds','bluetooth','wireless','audio'], weight: 45,
  },
  {
    name: 'Smart Watch Pro', description: 'Feature-packed smartwatch with heart rate monitor, SpO2 sensor, GPS tracking, and 14-day battery life.',
    category: 'Electronics', price: 4999, salePrice: 3999, sku: 'ELEC-SW-002', stock: 80,
    images: ['https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=800&q=80','https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&q=80'],
    tags: ['smartwatch','fitness','wearable'], weight: 52,
  },
  {
    name: 'Portable Bluetooth Speaker', description: '20W portable Bluetooth speaker with deep bass, 360-degree surround sound, and 12-hour playtime. Waterproof IPX7.',
    category: 'Electronics', price: 3499, salePrice: 2799, sku: 'ELEC-SP-003', stock: 120,
    images: ['https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80','https://images.unsplash.com/photo-1589003077984-894e133dabab?w=800&q=80'],
    tags: ['speaker','bluetooth','portable','waterproof'], weight: 540,
  },
  {
    name: 'USB-C Fast Charging Cable (3-Pack)', description: 'Durable braided USB-C cables with 65W fast charging support. 1m, 1.5m, and 2m lengths included.',
    category: 'Electronics', price: 699, sku: 'ELEC-CB-004', stock: 500,
    images: ['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&q=80'],
    tags: ['cable','usb-c','charging','accessories'], weight: 85,
  },
  {
    name: 'Wireless Charging Pad', description: '15W Qi wireless charging pad with LED indicator and anti-slip surface. Compatible with all Qi-enabled devices.',
    category: 'Electronics', price: 1299, salePrice: 999, sku: 'ELEC-WC-005', stock: 200,
    images: ['https://images.unsplash.com/photo-1591290619070-e6f71cbdbccb?w=800&q=80'],
    tags: ['wireless','charger','qi','accessories'], weight: 120,
  },
  {
    name: 'Classic Cotton Polo T-Shirt', description: 'Premium 100% combed cotton polo t-shirt with ribbed collar and cuffs. Pre-shrunk fabric for lasting fit.',
    category: 'Clothing & Fashion', price: 899, salePrice: 699, sku: 'CLO-PL-001', stock: 300,
    images: ['https://images.unsplash.com/photo-1625910513413-5fc7e347245e?w=800&q=80','https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=800&q=80'],
    tags: ['polo','cotton','casual','men'], weight: 220,
  },
  {
    name: 'Slim Fit Denim Jeans', description: 'Comfortable stretch denim jeans with slim fit design. Mid-rise waist with 5-pocket styling.',
    category: 'Clothing & Fashion', price: 1999, salePrice: 1499, sku: 'CLO-JN-002', stock: 180,
    images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80','https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&q=80'],
    tags: ['jeans','denim','slim-fit','men'], weight: 650,
  },
  {
    name: 'Leather Crossbody Bag', description: 'Genuine leather crossbody bag with adjustable strap, multiple compartments, and RFID blocking pocket.',
    category: 'Clothing & Fashion', price: 2999, salePrice: 2499, sku: 'CLO-BG-003', stock: 90,
    images: ['https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80','https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800&q=80'],
    tags: ['bag','leather','crossbody','women'], weight: 380,
  },
  {
    name: 'Aviator Sunglasses UV400', description: 'Classic aviator sunglasses with UV400 protection, polarized lenses, and lightweight metal frame.',
    category: 'Clothing & Fashion', price: 1499, salePrice: 1199, sku: 'CLO-SG-004', stock: 250,
    images: ['https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&q=80','https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&q=80'],
    tags: ['sunglasses','aviator','uv-protection','unisex'], weight: 35,
  },
  {
    name: 'Running Sneakers', description: 'Lightweight mesh running sneakers with cushioned EVA sole, breathable upper, and reflective accents.',
    category: 'Clothing & Fashion', price: 3499, salePrice: 2799, sku: 'CLO-SH-005', stock: 160,
    images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80','https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=800&q=80'],
    tags: ['shoes','running','sneakers','sports'], weight: 310,
  },
  {
    name: 'Stainless Steel Water Bottle (1L)', description: 'Double-wall vacuum insulated stainless steel water bottle. Keeps drinks cold 24h or hot 12h. BPA-free.',
    category: 'Home & Kitchen', price: 799, salePrice: 599, sku: 'HOM-WB-001', stock: 400,
    images: ['https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80'],
    tags: ['bottle','stainless-steel','insulated','eco-friendly'], weight: 350,
  },
  {
    name: 'Non-Stick Cookware Set (5-Piece)', description: 'Premium non-stick cookware set including frying pan, saucepan, kadhai, tawa, and milk pot. PFOA-free.',
    category: 'Home & Kitchen', price: 3999, salePrice: 2999, sku: 'HOM-CK-002', stock: 60,
    images: ['https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80','https://images.unsplash.com/photo-1584990347449-a8dfe4be338e?w=800&q=80'],
    tags: ['cookware','non-stick','kitchen','cooking'], weight: 3200,
  },
  {
    name: 'Bamboo Cutting Board Set', description: 'Set of 3 organic bamboo cutting boards in different sizes. Knife-friendly, antimicrobial surface.',
    category: 'Home & Kitchen', price: 1299, salePrice: 999, sku: 'HOM-CB-003', stock: 180,
    images: ['https://images.unsplash.com/photo-1605522561233-768ad7a8fabf?w=800&q=80'],
    tags: ['cutting-board','bamboo','kitchen','eco-friendly'], weight: 1100,
  },
  {
    name: 'Aromatic Scented Candle Set', description: 'Set of 4 premium soy wax scented candles in lavender, vanilla, cinnamon, and jasmine. 40h burn time each.',
    category: 'Home & Kitchen', price: 1499, salePrice: 1199, sku: 'HOM-SC-004', stock: 220,
    images: ['https://images.unsplash.com/photo-1602607574652-0e9e3e7e2b8e?w=800&q=80','https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800&q=80'],
    tags: ['candles','scented','home-decor','gift'], weight: 800,
  },
  {
    name: 'Cotton Bedsheet Set (King Size)', description: '300 thread count 100% cotton bedsheet set with 2 pillow covers. Breathable, soft, and wrinkle-resistant.',
    category: 'Home & Kitchen', price: 2499, salePrice: 1899, sku: 'HOM-BS-005', stock: 100,
    images: ['https://images.unsplash.com/photo-1631049035182-249067d7618e?w=800&q=80'],
    tags: ['bedsheet','cotton','king-size','bedroom'], weight: 1500,
  },
  {
    name: 'Vitamin C Face Serum (30ml)', description: '20% Vitamin C serum with hyaluronic acid and vitamin E. Brightens skin, reduces dark spots.',
    category: 'Beauty & Personal Care', price: 799, salePrice: 599, sku: 'BPC-FS-001', stock: 350,
    images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&q=80','https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=800&q=80'],
    tags: ['serum','vitamin-c','skincare','face'], weight: 60,
  },
  {
    name: 'Natural Hair Oil (200ml)', description: 'Cold-pressed blend of coconut, almond, and argan oils infused with hibiscus and amla.',
    category: 'Beauty & Personal Care', price: 499, salePrice: 399, sku: 'BPC-HO-002', stock: 280,
    images: ['https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=800&q=80'],
    tags: ['hair-oil','natural','organic','haircare'], weight: 230,
  },
  {
    name: 'Bamboo Charcoal Face Wash (150ml)', description: 'Deep cleansing face wash with activated bamboo charcoal and tea tree oil. Paraben-free.',
    category: 'Beauty & Personal Care', price: 349, salePrice: 299, sku: 'BPC-FW-003', stock: 420,
    images: ['https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=800&q=80'],
    tags: ['face-wash','charcoal','skincare','men'], weight: 175,
  },
  {
    name: 'Luxury Perfume Gift Set', description: 'Premium perfume gift set with 4 x 20ml fragrances: floral, woody, citrus, and musk. 8+ hours lasting.',
    category: 'Beauty & Personal Care', price: 1999, salePrice: 1599, sku: 'BPC-PF-004', stock: 130,
    images: ['https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80','https://images.unsplash.com/photo-1594035900144-17fc23d4af1d?w=800&q=80'],
    tags: ['perfume','gift-set','fragrance','luxury'], weight: 280,
  },
  {
    name: 'Yoga Mat (6mm, Anti-Slip)', description: 'Premium TPE yoga mat with dual-layer anti-slip texture. 6mm thickness. Includes carry strap. Eco-friendly.',
    category: 'Sports & Fitness', price: 1299, salePrice: 999, sku: 'SPT-YM-001', stock: 200,
    images: ['https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800&q=80','https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80'],
    tags: ['yoga','mat','fitness','exercise'], weight: 950,
  },
  {
    name: 'Resistance Bands Set (5-Pack)', description: 'Set of 5 resistance bands with different tension levels. Includes door anchor, handles, and ankle straps.',
    category: 'Sports & Fitness', price: 899, salePrice: 699, sku: 'SPT-RB-002', stock: 280,
    images: ['https://images.unsplash.com/photo-1598289431512-b97b0917affc?w=800&q=80'],
    tags: ['resistance-bands','workout','home-gym','fitness'], weight: 450,
  },
  {
    name: 'Stainless Steel Protein Shaker (700ml)', description: 'BPA-free stainless steel protein shaker with blending ball. Leak-proof lid. Dishwasher safe.',
    category: 'Sports & Fitness', price: 599, salePrice: 449, sku: 'SPT-PS-003', stock: 350,
    images: ['https://images.unsplash.com/photo-1594498653385-d5533f2c67e8?w=800&q=80'],
    tags: ['shaker','protein','gym','fitness'], weight: 280,
  },
  {
    name: 'Premium Leather Journal (A5)', description: 'Handcrafted genuine leather journal with 200 pages of acid-free, dotted paper. Ribbon bookmark.',
    category: 'Books & Stationery', price: 999, salePrice: 799, sku: 'BOK-LJ-001', stock: 180,
    images: ['https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80','https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800&q=80'],
    tags: ['journal','leather','notebook','stationery'], weight: 320,
  },
  {
    name: 'Fineliner Pen Set (24 Colors)', description: 'Set of 24 fine point pens with 0.4mm tips. Water-based ink, acid-free. Ideal for drawing and journaling.',
    category: 'Books & Stationery', price: 599, salePrice: 449, sku: 'BOK-FP-002', stock: 250,
    images: ['https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=800&q=80'],
    tags: ['pens','fineliner','art','stationery'], weight: 180,
  },
  {
    name: 'Organic Honey (500g)', description: 'Pure, raw, unprocessed organic honey sourced from wildflower farms. Rich in antioxidants. No added sugar.',
    category: 'Grocery & Gourmet', price: 599, salePrice: 499, sku: 'GRC-HN-001', stock: 300,
    images: ['https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&q=80'],
    tags: ['honey','organic','natural','food'], weight: 550,
  },
  {
    name: 'Premium Green Tea (100 bags)', description: 'Handpicked Darjeeling green tea in pyramid tea bags. Rich in catechins. Light, refreshing flavor.',
    category: 'Grocery & Gourmet', price: 499, salePrice: 399, sku: 'GRC-GT-002', stock: 400,
    images: ['https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=80'],
    tags: ['tea','green-tea','organic','beverage'], weight: 250,
  },
  {
    name: 'Mixed Dry Fruits Gift Box (500g)', description: 'Premium assortment of almonds, cashews, pistachios, walnuts, and raisins in reusable wooden gift box.',
    category: 'Grocery & Gourmet', price: 1299, salePrice: 999, sku: 'GRC-DF-003', stock: 150,
    images: ['https://images.unsplash.com/photo-1604112055290-dca41608b5fa?w=800&q=80'],
    tags: ['dry-fruits','gift','nuts','premium'], weight: 560,
  },
  {
    name: 'Wooden Building Blocks (100 Pieces)', description: 'Colorful wooden building blocks for kids aged 3+. Natural beechwood with non-toxic paint.',
    category: 'Toys & Games', price: 1499, salePrice: 1199, sku: 'TOY-BB-001', stock: 120,
    images: ['https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=800&q=80'],
    tags: ['blocks','wooden','kids','educational'], weight: 1800,
  },
  {
    name: 'Strategy Board Game Collection', description: 'Classic collection of 5 strategy board games: chess, checkers, ludo, snakes & ladders, and backgammon.',
    category: 'Toys & Games', price: 1999, salePrice: 1599, sku: 'TOY-BG-002', stock: 90,
    images: ['https://images.unsplash.com/photo-1632501641765-e568d28b0015?w=800&q=80','https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=800&q=80'],
    tags: ['board-game','chess','family','strategy'], weight: 1200,
  },
  {
    name: 'Remote Control Racing Car', description: 'High-speed RC racing car with 2.4GHz remote, rechargeable battery. Top speed 20 km/h. Ages 6+.',
    category: 'Toys & Games', price: 2499, salePrice: 1999, sku: 'TOY-RC-003', stock: 75,
    images: ['https://images.unsplash.com/photo-1581235707960-23b7e8839619?w=800&q=80'],
    tags: ['rc-car','racing','remote-control','kids'], weight: 650,
  },
];

@Controller('seed')
export class SeedProductsController {
  private readonly logger = new Logger(SeedProductsController.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly categoryService: CategoryService,
  ) {}

  @Post('products')
  @Public()
  @HttpCode(HttpStatus.OK)
  async seedProducts(@Body() body: { secret: string; email: string }) {
    if (body.secret !== SEED_SECRET) {
      throw new ForbiddenException('Invalid seed secret');
    }

    const email = body.email || 'patanwala.hatim2@gmail.com';

    // Find tenant by email across all schemas
    const tenants = await this.tenantRepository.find({ where: { status: 'active' } });
    let tenantSchema: string | null = null;
    let tenantId: string | null = null;

    for (const tenant of tenants) {
      try {
        const users = await this.connectionManager.executeInTenantContext(tenant.schemaName, async (qr) => {
          return qr.query(`SELECT id FROM users WHERE email = $1`, [email]);
        });
        if (users.length > 0) {
          tenantSchema = tenant.schemaName;
          tenantId = tenant.id;
          this.logger.log(`Found user ${email} in tenant ${tenant.name} (${tenantSchema})`);
          break;
        }
      } catch {
        // Schema might not exist
      }
    }

    if (!tenantSchema) {
      return { success: false, message: `User ${email} not found in any tenant` };
    }

    // Create categories
    const categoryIds = new Map<string, string>();
    for (const cat of CATEGORIES) {
      try {
        const existing = await this.connectionManager.executeInTenantContext(tenantSchema, async (qr) => {
          return qr.query(`SELECT id FROM categories WHERE slug = $1`, [cat.slug]);
        });

        if (existing.length > 0) {
          categoryIds.set(cat.name, existing[0].id);
        } else {
          const result = await this.connectionManager.executeInTenantContext(tenantSchema, async (qr) => {
            return qr.query(
              `INSERT INTO categories (name, slug, sort_order, is_active, translations) VALUES ($1, $2, $3, true, '{}') RETURNING id`,
              [cat.name, cat.slug, CATEGORIES.indexOf(cat)]
            );
          });
          categoryIds.set(cat.name, result[0].id);
        }
      } catch (err: any) {
        this.logger.warn(`Category ${cat.name}: ${err.message}`);
      }
    }

    // Create products
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const product of PRODUCTS) {
      try {
        const existing = await this.connectionManager.executeInTenantContext(tenantSchema, async (qr) => {
          return qr.query(`SELECT id FROM products WHERE metadata->>'sku' = $1 AND is_active = true`, [product.sku]);
        });

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        const categoryId = categoryIds.get(product.category) || null;
        const slug = product.sku.toLowerCase();
        const metadata = JSON.stringify({
          sku: product.sku,
          barcode: '',
          weight: product.weight,
          tags: product.tags,
          shortDescription: product.description.substring(0, 100),
        });

        await this.connectionManager.executeInTransaction(tenantSchema, async (qr) => {
          const result = await qr.query(
            `INSERT INTO products (name, slug, description, category_id, base_price, sale_price, currency, images, thumbnail, has_variants, is_active, translations, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, 'INR', $7, $8, false, true, '{}', $9) RETURNING id`,
            [product.name, slug, product.description, categoryId, product.price, (product as any).salePrice || null, product.images, product.images[0] || null, metadata]
          );

          await qr.query(
            `INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold) VALUES ($1, $2, 5)`,
            [result[0].id, product.stock]
          );
        });

        created++;
      } catch (err: any) {
        errors.push(`${product.name}: ${err.message}`);
      }
    }

    return {
      success: true,
      tenantSchema,
      categories: categoryIds.size,
      created,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      total: PRODUCTS.length,
    };
  }
}
