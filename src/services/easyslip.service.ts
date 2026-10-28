import axios from 'axios';
import { config } from '../config/index.js';
import { prisma } from './db.service.js';

export interface SlipVerificationResult {
  success: boolean;
  transRef?: string;
  amount?: number;
  senderName?: string;
  senderBank?: string;
  slipDate?: Date;
  rawPayload?: any;
  error?: string;
}

export class EasySlipService {
  public static async verifySlipImage(
    imageBuffer: Buffer,
    expectedAmountThb: number,
    discordUserId: string
  ): Promise<SlipVerificationResult> {
    const apiKey = config.easyslip.apiKey;
    if (!apiKey) {
      return { success: false, error: 'ระบบไม่ได้ตั้งค่า EASYSLIP_API_KEY ใน .env' };
    }

    try {
      const base64Data = imageBuffer.toString('base64');
      const response = await axios.post(
        config.easyslip.verifyUrl,
        { image: base64Data },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const resData = response.data;
      if (resData.status !== 200 || !resData.data) {
        return {
          success: false,
          error: resData.message || 'ไม่สามารถตรวจสอบสลิปได้ (รูปภาพอาจไม่ชัดหรือไม่พบ QR Code)'
        };
      }

      const slip = resData.data;
      const transRef = String(slip.transRef || slip.payload || '').trim();

      if (!transRef) {
        return { success: false, error: 'ไม่พบรหัสอ้างอิงธุรกรรม (transRef) ในสลิป' };
      }

      // ── กฎเหล็กข้อที่ 1: ตรวจสอบ transRef ซ้ำในฐานข้อมูล ────────────────────
      const existingSlip = await prisma.verifiedSlip.findUnique({
        where: { transRef }
      });
      if (existingSlip) {
        return {
          success: false,
          error: `⚠️ สลิปนี้ถูกใช้งานไปแล้วในระบบ (transRef: ${transRef}) ไม่สามารถใช้ซ้ำได้`
        };
      }

      // ── กฎเหล็กข้อที่ 2: ตรวจสอบเลขบัญชีผู้รับ ────────────────────────────
      const receiverAcc = String(slip.receiver?.account?.bank?.account || slip.receiver?.proxy?.value || '').replace(/\D/g, '');
      const configuredAcc = config.bank.accountNumber.replace(/\D/g, '');
      const configuredNatId = config.bank.promptpayNatId.replace(/\D/g, '');

      const isReceiverMatched =
        (configuredAcc && receiverAcc.includes(configuredAcc)) ||
        (configuredNatId && receiverAcc.includes(configuredNatId)) ||
        (slip.receiver?.account?.name?.th && slip.receiver.account.name.th.includes(config.bank.accountName.split(' ')[0]));

      if (!isReceiverMatched) {
        return {
          success: false,
          error: `⚠️ บัญชีผู้รับเงินในสลิปไม่ตรงกับบัญชีของร้าน (${config.bank.accountName})`
        };
      }

      // ── กฎเหล็กข้อที่ 3: ตรวจสอบยอดเงิน (ถ้ามีการระบุ expectedAmountThb > 0) ─────────────────────────────
      const slipAmount = parseFloat(slip.amount?.amount || '0');
      if (slipAmount <= 0) {
        return {
          success: false,
          error: '⚠️ ยอดเงินในสลิปไม่ถูกต้อง หรือมีค่าน้อยกว่าหรือเท่ากับ 0 บาท'
        };
      }
      if (expectedAmountThb > 0 && Math.abs(slipAmount - expectedAmountThb) > 0.01) {
        return {
          success: false,
          error: `⚠️ ยอดเงินในสลิป (${slipAmount.toFixed(2)} บาท) ไม่ตรงกับยอดที่ต้องชำระ (${expectedAmountThb.toFixed(2)} บาท)`
        };
      }

      // ── กฎเหล็กข้อที่ 4: ตรวจสอบวันที่ในสลิป ─────────────────────────────
      const slipDate = new Date(slip.date);
      const now = new Date();
      const diffHours = (now.getTime() - slipDate.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        return {
          success: false,
          error: '⚠️ สลิปนี้มีอายุเกิน 24 ชั่วโมงแล้ว ไม่สามารถใช้ทำรายการได้'
        };
      }

      return {
        success: true,
        transRef,
        amount: slipAmount,
        senderName: slip.sender?.account?.name?.th || slip.sender?.account?.name?.en || 'ลูกค้า',
        senderBank: slip.sender?.bank?.name || 'ธนาคาร',
        slipDate,
        rawPayload: slip
      };
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'EasySlip Connection Error';
      return { success: false, error: `เกิดข้อผิดพลาดในการตรวจสอบสลิป: ${errMsg}` };
    }
  }
}
