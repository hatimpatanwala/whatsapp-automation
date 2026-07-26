import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface CustomerHit { id: string; name: string; phone: string; gstin?: string; company?: string; totalOrders?: number; totalSpent?: number; }
export interface RateHistoryRow { at: string; doc: string; qty: number; price: number; discount?: number | null; }
export interface ProductHit {
  id: string; name: string; uom?: string; altUom?: string | null; uomFactor?: number | null;
  hsnCode?: string; gstRate?: number;
  salePrice?: number; basePrice?: number; purchasePrice?: number | null; mrp?: number | null;
  stock?: number;
}
export interface LastSale { price: number; at: string; qty?: number | null; d1?: number | null; d2?: number | null; discount?: number | null; }
export interface CategoryProduct {
  id: string; name: string; hsnCode?: string; uom?: string; gstRate?: number;
  salePrice?: number; basePrice?: number; purchasePrice?: number;
  priceIncludesTax?: boolean; saleDiscountPct?: number;
}
export interface CategoryGroup { id: string; name: string; products: CategoryProduct[]; }
export interface ItemContext extends ProductHit {
  lastToCustomer?: LastSale | null;
  lastOverall?: LastSale | null;
  /** Rate from the customer's assigned price level — wins as the billing default. */
  levelPrice?: { price: number; levelName: string } | null;
}
export interface CustomerContext {
  id: string; name: string; phone: string; email?: string; gstin?: string; company?: string;
  state?: string; stateCode?: string; placeOfSupply?: string; billingAddress?: string;
  pincode?: string; defaultDiscountPct?: number | null; gstRegistrationType?: string;
  totalOrders: number; totalSpent: number; lastOrderAt?: string;
  outstanding: number; openInvoices: number;
  /** Credit control (Tally credit limit/days). */
  priceLevelId?: string | null; priceLevelName?: string | null;
  creditLimit?: number | null; creditDays?: number | null; overdue?: number;
  recentInvoices: Array<{ invoiceNumber: string; total: number; balanceDue: number; paymentStatus: string; issuedAt: string }>;
  topItems: Array<{ productId: string; productName: string; lastPrice: number; lastDate: string; totalQty: number }>;
}

export interface InvoiceLine {
  productId?: string; description: string; quantity: number; unitPrice: number; gstRate?: number; hsn?: string;
}
export interface CreateInvoiceBody {
  customerId?: string; items: InvoiceLine[]; taxRate?: number; discount?: number;
  note?: string; isInterstate?: boolean; buyerGstin?: string; placeOfSupply?: string;
  /** Voucher date (Miracle-style back/forward dating). */
  issueDate?: string;
  /** Miracle trade fields. */
  isCash?: boolean;
  charges?: Array<{ label: string; amount: number; gstRate?: number }>;
  autoRound?: boolean;
  broker?: string;
  commissionPct?: number;
  transport?: { name?: string; lrNo?: string; vehicleNo?: string };
  dueDays?: number;
  /** GST billing/dispatch addresses; Ship To drives place-of-supply. */
  billTo?: InvoiceAddress;
  shipTo?: InvoiceAddress;
  /** Voucher series (Miracle multi-series numbering). */
  series?: string;
  /** Manual voucher number (Miracle manual series) — blank/undefined = automatic. */
  invoiceNumber?: string;
  /** TCS % collected on the invoice value (206C-style). */
  tcsPct?: number;
}

export interface InvoiceAddress {
  name?: string; address?: string; city?: string; state?: string;
  stateCode?: string; pincode?: string; gstin?: string; phone?: string;
}
export interface SavedAddress {
  id: string; label?: string; fullAddress: string; city?: string; state?: string;
  pincode?: string; isDefault?: boolean;
}

/**
 * Client for the keyboard-entry billing-intelligence API (Tally/Miracle-style):
 * typeahead + party/item context, and invoice save via the ERP invoicing endpoint.
 */
@Injectable({ providedIn: 'root' })
export class EntryService {
  private readonly api = inject(ApiService);

  customers(q: string): Observable<CustomerHit[]> { return this.api.get<CustomerHit[]>('/entry/customers', { q }); }
  products(q: string): Observable<ProductHit[]> { return this.api.get<ProductHit[]>('/entry/products', { q }); }
  categoryProducts(): Observable<CategoryGroup[]> { return this.api.get<CategoryGroup[]>('/entry/category-products'); }
  /** PERMANENT: write the category discount to the item master (sale = purchase − d%). */
  applyCategoryDiscount(productIds: string[], discountPct: number): Observable<CategoryProduct[]> {
    return this.api.post<CategoryProduct[]>('/entry/category-discount', { productIds, discountPct });
  }
  customerContext(id: string): Observable<CustomerContext> { return this.api.get<CustomerContext>(`/entry/customer/${id}/context`); }
  itemContext(productId: string, customerId?: string): Observable<ItemContext> {
    return this.api.get<ItemContext>(`/entry/product/${productId}/context`, customerId ? { customerId } : undefined);
  }
  /** Party-specific rate history (Miracle "last rates to this party"). */
  rateHistory(productId: string, opts: { customerId?: string; supplierId?: string }): Observable<RateHistoryRow[]> {
    return this.api.get<RateHistoryRow[]>(`/entry/product/${productId}/rate-history`, opts);
  }

  createInvoice(body: CreateInvoiceBody): Observable<any> { return this.api.post<any>('/erp/invoices', body); }
  quoteById(id: string): Observable<any> { return this.api.get<any>(`/quotes/${id}`); }
  generateIrn(invoiceId: string): Observable<any> { return this.api.post<any>(`/gst/einvoice/${invoiceId}`, {}); }
  downloadEinvoicePayload(invoiceId: string, invoiceNo: string): void {
    this.api.downloadFile(`/gst/einvoice/${invoiceId}/payload`, `einvoice-${invoiceNo.replace(/[^\w-]/g, '_')}.json`);
  }
  supplierOrderById(id: string): Observable<any> { return this.api.get<any>(`/erp/supplier-orders/${id}`); }
  orderById(id: string): Observable<any> { return this.api.get<any>(`/orders/${id}`); }
  /** Convert an order into a document (tax_invoice | bill_of_supply | delivery_challan). */
  convertOrderToDoc(orderId: string, docType: 'tax_invoice' | 'bill_of_supply' | 'delivery_challan'): Observable<any> {
    return this.api.post<any>(`/orders/${orderId}/invoice`, { docType });
  }
  createEway(body: {
    invoiceId: string; transportMode?: string; vehicleNumber?: string; transporter?: string;
    fromPlace?: string; toPlace?: string; distanceKm?: number;
  }): Observable<any> {
    return this.api.post<any>('/erp/eway-bills', body);
  }
  downloadEwayPdf(id: string, ewayNumber: string): void {
    this.api.downloadFile(`/erp/eway-bills/${id}/pdf`, `eway-${ewayNumber}.pdf`);
  }
  invoice(id: string): Observable<any> { return this.api.get<any>(`/erp/invoices/${id}`); }
  invoices(limit = 50): Observable<any> { return this.api.get<any>('/erp/invoices', { limit: String(limit) }); }
  sellerProfile(): Observable<any> { return this.api.get<any>('/gst/seller-profile'); }

  // ─── Purchase side ─────────────────────────────────────────────────────────
  suppliers(q: string): Observable<SupplierHit[]> { return this.api.get<SupplierHit[]>('/entry/suppliers', { q }); }
  supplierContext(id: string): Observable<SupplierContext> { return this.api.get<SupplierContext>(`/entry/supplier/${id}/context`); }
  itemPurchaseContext(productId: string, supplierId?: string): Observable<PurchaseItemContext> {
    return this.api.get<PurchaseItemContext>(`/entry/product/${productId}/purchase-context`, supplierId ? { supplierId } : undefined);
  }
  createPurchase(body: CreatePurchaseBody): Observable<any> { return this.api.post<any>('/erp/supplier-orders', body); }

  customerAddresses(customerId: string): Observable<SavedAddress[]> {
    return this.api.get<SavedAddress[]>(`/entry/customer/${customerId}/addresses`);
  }

  // ─── Receipts (bill-wise allocation) ───────────────────────────────────────
  openBills(customerId: string): Observable<OpenBill[]> { return this.api.get<OpenBill[]>(`/entry/customer/${customerId}/open-bills`); }
  recordPayment(invoiceId: string, amount: number, description?: string): Observable<any> {
    return this.api.post<any>(`/erp/invoices/${invoiceId}/payments`, { amount, description });
  }

  // ─── Supplier payments (bill-wise allocation) ──────────────────────────────
  openPurchaseBills(supplierId: string): Observable<OpenPurchaseBill[]> {
    return this.api.get<OpenPurchaseBill[]>(`/entry/supplier/${supplierId}/open-bills`);
  }
  paySupplierOrder(orderId: string, amount: number, method: string, description?: string): Observable<any> {
    return this.api.post<any>(`/erp/supplier-orders/${orderId}/payments`, { amount, method, description });
  }

  // ─── Quotations ────────────────────────────────────────────────────────────
  createQuote(body: {
    customerId?: string; title?: string; notes?: string; validUntil?: string; taxRate?: number;
    items: Array<{ productId?: string; description: string; quantity: number; unitPrice: number; discount?: number }>;
  }): Observable<any> { return this.api.post<any>('/quotes', body); }

  /** Mark a saved quote as sent — same action as the portal's "Send to customer",
   *  which fires the tenant's quote workflow (WhatsApp delivery to the party). */
  markQuoteSent(id: string): Observable<any> {
    return this.api.patch<any>(`/quotes/${id}/status`, { status: 'sent' });
  }

  // ─── Returns ───────────────────────────────────────────────────────────────
  createCreditNote(body: {
    customerId?: string; customerName?: string; items: Array<{ description: string; quantity: number; unitPrice: number }>;
    taxRate?: number; reason?: string;
  }): Observable<any> { return this.api.post<any>('/erp/credit-notes', body); }
  createDebitNote(body: {
    supplierId?: string; items: Array<{ description: string; quantity: number; unitPrice: number }>;
    taxRate?: number; reason?: string;
  }): Observable<any> { return this.api.post<any>('/erp/debit-notes', body); }

  // ─── Stock journal / transfer ──────────────────────────────────────────────
  warehouses(): Observable<any> { return this.api.get<any>('/erp/warehouses', { limit: '100' }); }
  stockAdjust(body: { warehouseId: string; productId: string; quantity: number; mode: 'set' | 'delta'; note?: string }): Observable<any> {
    return this.api.post<any>('/erp/stock/adjust', body);
  }
  stockTransfer(body: { fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: number; note?: string }): Observable<any> {
    return this.api.post<any>('/erp/stock/transfer', body);
  }
  stockSummary(): Observable<any[]> { return this.api.get<any[]>('/entry/stock-summary'); }

  // ─── Sales orders ──────────────────────────────────────────────────────────
  createOrder(body: {
    customerId: string;
    items: Array<{ productId?: string; productName?: string; quantity: number; unitPrice: number }>;
    notes?: string; discount?: number; deliveryFee?: number; taxAmount?: number;
  }): Observable<any> { return this.api.post<any>('/orders', body); }

  // ─── Party Master (unified GST ledger-party — PARTY_MASTER_README.md) ───────
  parties(q = '', group?: 'debtor' | 'creditor'): Observable<any[]> {
    return this.api.get<any[]>('/entry/party', { q, ...(group ? { group } : {}) });
  }
  party(group: string, id: string): Observable<any> { return this.api.get<any>(`/entry/party/${group}/${id}`); }
  createParty(body: any): Observable<any> { return this.api.post<any>('/entry/party', body); }
  updateParty(group: string, id: string, body: any): Observable<any> { return this.api.patch<any>(`/entry/party/${group}/${id}`, body); }
  deleteParty(group: string, id: string): Observable<any> { return this.api.delete<any>(`/entry/party/${group}/${id}`); }
  checkGstin(gstin: string, exclude?: string): Observable<{ exists: boolean; parties?: string[] }> {
    return this.api.get<{ exists: boolean; parties?: string[] }>('/entry/party/check-gstin', { gstin, ...(exclude ? { exclude } : {}) });
  }
  gstinLookup(gstin: string): Observable<any> { return this.api.get<any>('/entry/party/gstin-lookup', { gstin }); }
  addPartyAddress(customerId: string, body: { label?: string; fullAddress: string; city?: string; state?: string; pincode?: string; isDefault?: boolean }): Observable<any> {
    return this.api.post<any>(`/entry/party/debtor/${customerId}/addresses`, body);
  }
  removePartyAddress(customerId: string, addressId: string): Observable<any> {
    return this.api.delete<any>(`/entry/party/debtor/${customerId}/addresses/${addressId}`);
  }

  // ─── SFA: salesmen + promise-to-pay follow-ups ──────────────────────────────
  sfaSalesmen(): Observable<any[]> { return this.api.get<any[]>('/sfa/salesmen'); }
  sfaAddSalesman(body: { name: string; phone: string; route?: string; area?: string }): Observable<any> {
    return this.api.post<any>('/sfa/salesmen', body);
  }
  sfaUpdateSalesman(id: string, body: { isActive?: boolean; rotateToken?: boolean }): Observable<any> {
    return this.api.patch<any>(`/sfa/salesmen/${id}`, body);
  }
  sfaPromises(scope: 'due' | 'open' | 'all' = 'all'): Observable<any[]> {
    return this.api.get<any[]>('/sfa/promises', { scope });
  }

  // ─── Payments & Collections (PAYMENTS_MODULE_README) ────────────────────────
  payConfig(): Observable<any> { return this.api.get<any>('/pay/config'); }
  paySetConfig(body: any): Observable<any> { return this.api.post<any>('/pay/config', body); }
  payMethods(): Observable<any[]> { return this.api.get<any[]>('/pay/methods'); }
  payAddMethod(body: any): Observable<any> { return this.api.post<any>('/pay/methods', body); }
  payUpdateMethod(id: string, body: any): Observable<any> { return this.api.patch<any>(`/pay/methods/${id}`, body); }
  payCollections(status?: string): Observable<any[]> { return this.api.get<any[]>('/pay/collections', status ? { status } : undefined); }
  payUnmatched(): Observable<any[]> { return this.api.get<any[]>('/pay/unmatched'); }
  payForInvoice(invoiceId: string): Observable<any> { return this.api.post<any>(`/pay/invoice/${invoiceId}`, {}); }
  payClaim(id: string, note?: string): Observable<any> { return this.api.post<any>(`/pay/collections/${id}/claim`, { note }); }
  payConfirm(id: string): Observable<any> { return this.api.post<any>(`/pay/collections/${id}/confirm`, {}); }
  payRefund(id: string, amount: number, reason?: string): Observable<any> { return this.api.post<any>(`/pay/collections/${id}/refund`, { amount, reason }); }

  // ─── Item master (Miracle Add Item / Add Stock) ─────────────────────────────
  items(q = ''): Observable<ItemMasterRow[]> { return this.api.get<ItemMasterRow[]>('/entry/items', q ? { q } : undefined); }
  itemBatches(productId: string, live = false): Observable<any[]> {
    return this.api.get<any[]>(`/entry/items/${productId}/batches`, live ? { live: '1' } : undefined);
  }
  itemLocations(productId: string): Observable<Array<{ location: string; quantity: number }>> {
    return this.api.get<Array<{ location: string; quantity: number }>>(`/entry/items/${productId}/locations`);
  }
  categories(): Observable<any[]> { return this.api.get<any[]>('/products/categories'); }
  /** Brand master — the same list the portal's Categories & Brands page manages. */
  brands(): Observable<any[]> { return this.api.get<any[]>('/brands'); }
  createBrand(name: string): Observable<any> { return this.api.post<any>('/brands', { name }); }
  /** Reusable tax rates (shared with the ERP tax-rate master). */
  taxRates(): Observable<Array<{ id: string; name: string; rate: number }>> {
    return this.api.get<Array<{ id: string; name: string; rate: number }>>('/erp/tax-rates');
  }
  createTaxRate(body: { name: string; rate: number }): Observable<{ id: string; name: string; rate: number }> {
    return this.api.post<{ id: string; name: string; rate: number }>('/erp/tax-rates', body);
  }
  addStock(productId: string, qty: number): Observable<{ ok: boolean; stock?: number }> {
    return this.api.post<{ ok: boolean; stock?: number }>(`/entry/items/${productId}/add-stock`, { qty });
  }
  updateProduct(id: string, body: ProductMasterBody): Observable<any> { return this.api.patch<any>(`/products/${id}`, body); }

  // ─── Registers (document reports) ───────────────────────────────────────────
  supplierOrders(limit = 200): Observable<any> { return this.api.get<any>('/erp/supplier-orders', { limit: String(limit) }); }
  quotes(limit = 100): Observable<any> { return this.api.get<any>('/quotes', { limit: String(limit) }); }
  orders(limit = 100): Observable<any> { return this.api.get<any>('/orders', { limit: String(limit) }); }

  // ─── On-the-fly master creation (Miracle behaviour) ─────────────────────────
  createCustomer(name: string, phone: string): Observable<CustomerHit> {
    return this.api.post<CustomerHit>('/customers', { name, phone });
  }
  createProduct(body: ProductMasterBody & { name: string }): Observable<any> {
    return this.api.post<any>('/products', body);
  }
  createSupplier(body: { company: string; phone?: string; gstin?: string }): Observable<any> {
    return this.api.post<any>('/erp/suppliers', body);
  }

  // ─── Price levels + credit control (masters) ───────────────────────────────
  priceLevels(): Observable<PriceLevel[]> { return this.api.get<PriceLevel[]>('/entry/pricing/levels'); }
  createPriceLevel(name: string): Observable<PriceLevel> { return this.api.post<PriceLevel>('/entry/pricing/levels', { name }); }
  levelRates(levelId: string): Observable<LevelRate[]> { return this.api.get<LevelRate[]>(`/entry/pricing/levels/${levelId}/rates`); }
  saveLevelRates(levelId: string, items: Array<{ productId: string; rate: number }>): Observable<any> {
    return this.api.post<any>(`/entry/pricing/levels/${levelId}/rates`, { items });
  }
  updateCustomerSettings(customerId: string, body: { priceLevelId?: string | null; creditLimit?: number | null; creditDays?: number | null }): Observable<any> {
    return this.api.patch<any>(`/entry/pricing/customer/${customerId}/settings`, body);
  }
}

export interface ItemMasterRow {
  id: string; name: string; uom?: string; altUom?: string | null; uomFactor?: number | null;
  hsnCode?: string; gstRate?: number; basePrice?: number; salePrice?: number;
  purchasePrice?: number | null; mrp?: number | null; minStock?: number; stock?: number;
  barcode?: string | null; openingRate?: number | null;
  itemType?: string; uqc?: string | null; priceIncludesTax?: boolean;
  saleDiscountPct?: number | null; wholesalePrice?: number | null; wholesaleMinQty?: number | null;
  minSalePrice?: number | null; maxSalePrice?: number | null; cessPct?: number | null;
  taxExempt?: boolean; openingStockDate?: string | null; maxStock?: number | null;
  rackLocation?: string | null; trackingMode?: string; categoryId?: string | null; brandId?: string | null;
  description?: string | null; thumbnail?: string | null; customFields?: Record<string, any> | null;
}
export interface ProductMasterBody {
  name?: string; basePrice?: number; salePrice?: number; gstRate?: number; hsnCode?: string;
  uom?: string; altUom?: string; uomFactor?: number; purchasePrice?: number; mrp?: number;
  lowStockThreshold?: number; initialStock?: number; sku?: string; barcode?: string;
  openingRate?: number;
  itemType?: string; uqc?: string; priceIncludesTax?: boolean; saleDiscountPct?: number;
  wholesalePrice?: number; wholesaleMinQty?: number; minSalePrice?: number; maxSalePrice?: number;
  cessPct?: number; taxExempt?: boolean; openingStockDate?: string; maxStock?: number;
  rackLocation?: string; trackingMode?: string; categoryId?: string; brandId?: string | null;
  description?: string; thumbnail?: string; customFields?: Record<string, any>;
}

export interface PriceLevel { id: string; name: string; rateCount?: number; }
export interface LevelRate { productId: string; productName: string; salePrice?: number; basePrice?: number; rate: number; }

export interface OpenPurchaseBill {
  id: string; orderNumber: string; supplierInvoiceNo?: string; issuedAt: string;
  total: number; balanceDue: number; ageDays: number;
}

export interface SupplierHit { id: string; name: string; contactName?: string; phone?: string; gstin?: string; }
export interface SupplierContext extends SupplierHit {
  outstanding: number; openOrders: number;
  recentOrders: Array<{ orderNumber: string; supplierInvoiceNo?: string; total: number; status: string; paymentStatus: string; createdAt: string }>;
  topItems: Array<{ productId: string; productName: string; lastPrice: number; lastDate: string; totalQty: number }>;
}
export interface PurchaseItemContext extends ProductHit {
  lastFromSupplier?: LastSale | null; lastOverall?: LastSale | null;
}
export interface OpenBill {
  id: string; invoiceNumber: string; issuedAt: string; total: number; balanceDue: number; ageDays: number;
}
export interface CreatePurchaseBody {
  supplierId?: string;
  items: Array<{ productId?: string; description: string; quantity: number; unitPrice: number; gstRate?: number; hsn?: string; freeQty?: number; d1?: number; d2?: number; mrpRate?: number }>;
  taxRate?: number; discount?: number; note?: string;
  supplierInvoiceNo?: string; supplierInvoiceDate?: string; isInterstate?: boolean;
  charges?: Array<{ label: string; amount: number; gstRate?: number }>;
}
