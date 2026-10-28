import { TronWeb } from 'tronweb';
import { config } from '../../config/index.js';

export class TronHotWallet {
  private static readonly USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  private static readonly EXPLORER = 'https://tronscan.org/#/transaction/';

  public static async transferTrc20(
    recipientAddress: string,
    amountDecimal: number
  ): Promise<{ txHash: string; explorerUrl: string; from: string }> {
    const privateKey = config.wallets.tronPrivateKey;

    if (!privateKey) {
      console.warn('[TRON Hot Wallet] Private key not set in .env. Generating simulated TxHash.');
      const mockHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      return {
        txHash: mockHash,
        explorerUrl: `${this.EXPLORER}${mockHash}`,
        from: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
      };
    }

    const tronWeb = new TronWeb({
      fullHost: config.rpcs.tronFullHost,
      headers: config.rpcs.tronGridApiKey ? { 'TRON-PRO-API-KEY': config.rpcs.tronGridApiKey } : {},
      privateKey
    });

    const senderAddress = String(tronWeb.defaultAddress.base58 || '');
    if (!senderAddress) {
      throw new Error('ไม่สามารถดึงที่อยู่กระเป๋า TRON จาก Private Key ได้');
    }
    const amountSun = Math.floor(amountDecimal * 1e6); // 6 decimals

    // ตรวจสอบยอด TRX ในกระเป๋าสำหรับค่า Gas (ต้องมีมากกว่า 14 TRX)
    const trxBalSun = await tronWeb.trx.getBalance(senderAddress);
    if (trxBalSun < 14 * 1e6) {
      throw new Error(`ยอดเหรียญ TRX สำหรับค่าธรรมเนียมในกระเป๋า ${senderAddress} เหลือน้อยกว่า 14 TRX`);
    }

    const contract = await tronWeb.contract().at(this.USDT_CONTRACT);
    const txId = await (contract as any).methods.transfer(recipientAddress, amountSun).send({
      feeLimit: 50_000_000 // สูงสุด 50 TRX
    });

    return {
      txHash: txId,
      explorerUrl: `${this.EXPLORER}${txId}`,
      from: senderAddress
    };
  }
}
