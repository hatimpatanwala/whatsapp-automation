import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { SellerProfile, SellerProfileService } from './seller-profile.service';

function num(v: unknown): number {
  return Number(v) || 0;
}
function ddmmyyyy(d: unknown): string {
  const dt = d ? new Date(d as string) : new Date();
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}
function stateCode(gstin?: string, pos?: string): string {
  if (pos && /^\d{2}/.test(pos)) return pos.slice(0, 2);
  if (gstin && gstin.length >= 2) return gstin.slice(0, 2);
  return '';
}

/**
 * E-invoicing (IRN) per NIC/IRP schema v1.1 (Phase 5). `buildPayload` produces the
 * e-invoice JSON from an invoice; `generateIrn` submits it to the configured IRP
 * (GSP) and stores the returned IRN / Ack / signed QR on the invoice. Without IRP
 * credentials it returns the payload for manual upload and marks the invoice 'pending'.
 */
@Injectable()
export class EInvoiceService {
  private readonly logger = new Logger(EInvoiceService.name);

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly config: ConfigService,
    private readonly seller: SellerProfileService,
  ) {}

  /** Build the IRP payload, pulling the seller master from tenant settings. */
  async buildPayloadForInvoice(schema: string, inv: any): Promise<any> {
    return this.buildPayload(inv, await this.seller.get(schema));
  }

  async getInvoice(schema: string, id: string): Promise<any> {
    const inv = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT * FROM "${schema}".invoices WHERE id = $1`, [id]),
    );
    if (!inv[0]) throw new NotFoundException(`Invoice ${id} not found`);
    return inv[0];
  }

  buildPayload(inv: any, seller: SellerProfile): any {
    const sellerGstin = seller.gstin || inv.seller_gstin || '';
    const buyerGstin = inv.buyer_gstin || 'URP';
    const items: any[] = Array.isArray(inv.items) ? inv.items : [];
    const interstate = !!inv.is_interstate;

    return {
      Version: '1.1',
      TranDtls: { TaxSch: 'GST', SupTyp: inv.buyer_gstin ? 'B2B' : 'B2C', RegRev: 'N', IgstOnIntra: 'N' },
      DocDtls: { Typ: 'INV', No: inv.invoice_number, Dt: ddmmyyyy(inv.issued_at) },
      SellerDtls: {
        Gstin: sellerGstin,
        LglNm: seller.legalName,
        Addr1: seller.address,
        Loc: seller.city,
        Pin: seller.pin,
        Stcd: seller.stateCode || stateCode(sellerGstin),
      },
      BuyerDtls: {
        Gstin: inv.bill_to?.gstin || buyerGstin,
        LglNm: inv.bill_to?.name || inv.customer_name || 'Recipient',
        Pos: stateCode(buyerGstin, inv.place_of_supply) || stateCode(sellerGstin),
        Addr1: inv.bill_to?.address || 'NA',
        Loc: inv.bill_to?.city || 'NA',
        Pin: num(inv.bill_to?.pincode) || 999999,
        Stcd: inv.bill_to?.stateCode || stateCode(buyerGstin, inv.place_of_supply) || stateCode(sellerGstin),
      },
      // Dispatch destination (only when it differs from the billing address).
      ...(inv.ship_to && JSON.stringify(inv.ship_to) !== JSON.stringify(inv.bill_to)
        ? {
            ShipDtls: {
              Gstin: inv.ship_to.gstin || buyerGstin,
              LglNm: inv.ship_to.name || inv.bill_to?.name || inv.customer_name || 'Consignee',
              Addr1: inv.ship_to.address || 'NA',
              Loc: inv.ship_to.city || 'NA',
              Pin: num(inv.ship_to.pincode) || 999999,
              Stcd: inv.ship_to.stateCode || stateCode(buyerGstin, inv.place_of_supply),
            },
          }
        : {}),
      ItemList: items.map((line, i) => {
        const value = num(line.line_total ?? line.lineTotal);
        const rate = num(line.gst_rate ?? line.gstRate);
        const tax = (value * rate) / 100;
        return {
          SlNo: String(i + 1),
          PrdDesc: line.name || line.description || `Item ${i + 1}`,
          IsServc: 'N',
          HsnCd: String(line.hsn || line.hsn_code || ''),
          Qty: num(line.qty ?? line.quantity),
          Unit: 'NOS',
          UnitPrice: num(line.rate ?? line.unitPrice),
          TotAmt: value,
          AssAmt: value,
          GstRt: rate,
          IgstAmt: interstate ? Math.round(tax * 100) / 100 : 0,
          CgstAmt: interstate ? 0 : Math.round((tax / 2) * 100) / 100,
          SgstAmt: interstate ? 0 : Math.round((tax / 2) * 100) / 100,
          TotItemVal: Math.round((value + tax) * 100) / 100,
        };
      }),
      ValDtls: {
        AssVal: num(inv.taxable_value),
        CgstVal: num(inv.cgst),
        SgstVal: num(inv.sgst),
        IgstVal: num(inv.igst),
        RndOffAmt: num(inv.round_off),
        TotInvVal: num(inv.total),
      },
    };
  }

  /**
   * Generate an IRN for an invoice. If EINVOICE_API_URL + EINVOICE_AUTH_TOKEN are set,
   * submits to the IRP and stores the response; otherwise returns the payload so it can
   * be uploaded manually.
   */
  async generateIrn(schema: string, invoiceId: string): Promise<any> {
    const inv = await this.getInvoice(schema, invoiceId);
    if (inv.irn) return { status: 'exists', irn: inv.irn, ackNo: inv.ack_no, qr: inv.einvoice_qr };

    const payload = await this.buildPayloadForInvoice(schema, inv);
    const apiUrl = this.config.get<string>('EINVOICE_API_URL');
    const token = this.config.get<string>('EINVOICE_AUTH_TOKEN');

    if (!apiUrl || !token) {
      await this.setStatus(schema, invoiceId, 'pending');
      return { status: 'unconfigured', message: 'IRP credentials not set — payload ready for manual upload', payload };
    }

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body: any = await res.json();
      if (!res.ok) throw new Error(body?.message || `IRP responded ${res.status}`);

      const irn = body.Irn || body.irn;
      const ackNo = body.AckNo || body.ackNo;
      const ackDt = body.AckDt || body.ackDt;
      const qr = body.SignedQRCode || body.qrCode || null;
      await this.cm.executeInTenantContext(schema, (qr2) =>
        qr2.query(
          `UPDATE "${schema}".invoices
           SET irn = $1, ack_no = $2, ack_date = $3, einvoice_qr = $4, einvoice_status = 'generated'
           WHERE id = $5`,
          [irn, ackNo, ackDt ? new Date(ackDt) : new Date(), qr, invoiceId],
        ),
      );
      return { status: 'generated', irn, ackNo, ackDt, qr };
    } catch (err) {
      this.logger.error(`IRN generation failed for ${invoiceId}: ${(err as Error).message}`);
      await this.setStatus(schema, invoiceId, 'failed');
      return { status: 'failed', message: (err as Error).message, payload };
    }
  }

  private setStatus(schema: string, invoiceId: string, status: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`UPDATE "${schema}".invoices SET einvoice_status = $1 WHERE id = $2`, [status, invoiceId]),
    );
  }
}
