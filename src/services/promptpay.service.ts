import generatePayload from 'promptpay-qr';
import QRCode from 'qrcode';
import { config } from '../config/index.js';

export class PromptPayService {
  public static async generateQrBuffer(amountThb: number): Promise<Buffer> {
    const target = config.bank.promptpayNatId || config.bank.accountNumber;
    if (!target) {
      throw new Error('ไม่พบข้อมูลพร้อมเพย์หรือเลขที่บัญชีร้านใน .env');
    }

    const payload = generatePayload(target, { amount: amountThb });
    const buffer = await QRCode.toBuffer(payload, {
      type: 'png',
      width: 320,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    return buffer;
  }
}
