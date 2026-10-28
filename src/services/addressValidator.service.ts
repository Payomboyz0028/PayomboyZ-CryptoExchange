import { ethers } from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';

export const LITECOIN_NETWORK: bitcoin.Network = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30, // 'L'
  scriptHash: 0x32,  // 'M'
  wif: 0xb0
};

export class AddressValidator {
  public static validate(asset: string, address: string): { isValid: boolean; error?: string } {
    const cleanAddr = (address || '').trim();

    if (!cleanAddr) {
      return { isValid: false, error: 'กรุณากรอกที่อยู่กระเป๋าเงิน' };
    }

    if (
      asset.startsWith('USDT_BEP20') ||
      asset.startsWith('USDT_POLYGON') ||
      asset.startsWith('USDT_ARBITRUM') ||
      asset.startsWith('USDT_ERC20')
    ) {
      if (!ethers.isAddress(cleanAddr)) {
        return { isValid: false, error: 'รูปแบบกระเป๋า EVM ไม่ถูกต้อง (ต้องขึ้นต้นด้วย 0x และมีความยาว 42 ตัวอักษร)' };
      }
      return { isValid: true };
    }

    if (asset === 'USDT_TRC20') {
      const tronRegex = /^T[a-km-zA-HJ-NP-Z1-9]{33}$/;
      if (!tronRegex.test(cleanAddr)) {
        return { isValid: false, error: 'รูปแบบกระเป๋า TRON ไม่ถูกต้อง (ต้องขึ้นต้นด้วยอักษร T ความยาว 34 ตัวอักษร)' };
      }
      return { isValid: true };
    }

    if (asset === 'LTC') {
      try {
        bitcoin.address.toOutputScript(cleanAddr, LITECOIN_NETWORK);
        return { isValid: true };
      } catch {
        return { isValid: false, error: 'รูปแบบกระเป๋า Litecoin ไม่ถูกต้อง (ต้องขึ้นต้นด้วย ltc1, L หรือ M)' };
      }
    }

    return { isValid: false, error: 'ไม่พบประเภทเหรียญหรือเชนที่เลือก' };
  }
}
