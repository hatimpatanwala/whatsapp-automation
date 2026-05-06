import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrCodeService {
  async generateUpiQr(upiId: string, amount: number, txnRef: string): Promise<string> {
    const upiUrl = `upi://pay?pa=${upiId}&pn=Store&am=${amount}&tr=${txnRef}&cu=INR`;
    const qrDataUrl = await QRCode.toDataURL(upiUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return qrDataUrl;
  }

  async generateQrBuffer(upiId: string, amount: number, txnRef: string): Promise<Buffer> {
    const upiUrl = `upi://pay?pa=${upiId}&pn=Store&am=${amount}&tr=${txnRef}&cu=INR`;
    return QRCode.toBuffer(upiUrl, { width: 300, margin: 2 });
  }
}
