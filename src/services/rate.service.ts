import axios from 'axios';
import { config } from '../config/index.js';

export interface RateQuote {
  asset: string;
  marketPriceThb: number;
  marginThb: number;
  spreadPct: number;
  effectiveRate: number;
  networkFeeThb: number;
  timestamp: number;
}

export class RateService {
  private static cache: Map<string, { quote: RateQuote; expiresAt: number }> = new Map();
  private static readonly CACHE_TTL_MS = 10000; // 10s default cache for UI

  public static async getQuote(asset: string, forceLive: boolean = false): Promise<RateQuote> {
    if (!forceLive) {
      const cached = this.cache.get(asset);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.quote;
      }
    }

    let marketPrice = 33.80; // Baseline fallback
    let networkFeeThb = config.business.networkFeeBsc;
    let marginThb = config.business.marginThbUsdt; // Default 1.20 THB/USDT

    if (asset.startsWith('USDT')) {
      marginThb = config.business.marginThbUsdt;
      try {
        // Bitkub global ticker
        const res = await axios.get('https://api.bitkub.com/api/market/ticker', { timeout: 3500 });
        if (res.data?.THB_USDT?.last) {
          marketPrice = parseFloat(res.data.THB_USDT.last);
        }
      } catch {
        try {
          const bRes = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=USDTTHB', { timeout: 3000 });
          if (bRes.data?.price) {
            marketPrice = parseFloat(bRes.data.price);
          }
        } catch {}
      }

      if (asset === 'USDT_TRC20') networkFeeThb = config.business.networkFeeTron;
      else if (asset === 'USDT_POLYGON') networkFeeThb = config.business.networkFeePolygon;
      else if (asset === 'USDT_ARBITRUM') networkFeeThb = config.business.networkFeePolygon;
    } else if (asset === 'LTC') {
      marginThb = config.business.marginThbLtc;
      try {
        const [ltcRes, bitkubRes] = await Promise.all([
          axios.get('https://api.binance.com/api/v3/ticker/price?symbol=LTCUSDT', { timeout: 3500 }),
          axios.get('https://api.bitkub.com/api/market/ticker', { timeout: 3500 })
        ]);
        const ltcUsd = parseFloat(ltcRes.data?.price || '0');
        const usdtThb = parseFloat(bitkubRes.data?.THB_USDT?.last || '33.80');
        if (ltcUsd > 0 && usdtThb > 0) {
          marketPrice = Number((ltcUsd * usdtThb).toFixed(2));
        } else {
          marketPrice = 1900.00;
        }
      } catch {
        marketPrice = 1900.00;
      }
      networkFeeThb = config.business.networkFeeLtc;
    }

    const spreadPct = config.business.spreadPercentage;
    // Formula: effectiveRate = Live Market Price + Fixed Margin (+ Optional Spread)
    const effectiveRate = Number((marketPrice + marginThb + (marketPrice * (spreadPct / 100))).toFixed(2));

    const quote: RateQuote = {
      asset,
      marketPriceThb: marketPrice,
      marginThb,
      spreadPct,
      effectiveRate,
      networkFeeThb,
      timestamp: Date.now()
    };

    this.cache.set(asset, { quote, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return quote;
  }

  public static calculatePayout(thbAmount: number, quote: RateQuote) {
    if (thbAmount <= quote.networkFeeThb) {
      throw new Error(`ยอดเงินต้องมากกว่าค่าธรรมเนียมเน็ตเวิร์ก (${quote.networkFeeThb} บาท)`);
    }

    const netThb = thbAmount - quote.networkFeeThb;
    const decimals = quote.asset === 'LTC' ? 6 : 2;
    const cryptoAmount = Number((netThb / quote.effectiveRate).toFixed(decimals));

    return {
      thbAmount,
      networkFeeThb: quote.networkFeeThb,
      netThb,
      marketRate: quote.marketPriceThb,
      marginThb: quote.marginThb,
      effectiveRate: quote.effectiveRate,
      cryptoAmount
    };
  }

  /**
   * คำนวณยอดเงินบาทที่ต้องหักจากกระเป๋า เมื่อลูกค้าระบุยอดเหรียญคริปโตที่ต้องการรับตรงๆ
   */
  public static calculateDebitFromCrypto(cryptoAmount: number, quote: RateQuote) {
    if (cryptoAmount <= 0) {
      throw new Error('จำนวนเหรียญคริปโตต้องมากกว่า 0');
    }

    const netThb = Number((cryptoAmount * quote.effectiveRate).toFixed(2));
    const totalThbDebit = Number((netThb + quote.networkFeeThb).toFixed(2));
    const decimals = quote.asset === 'LTC' ? 6 : 2;
    const roundedCrypto = Number(cryptoAmount.toFixed(decimals));

    return {
      thbAmount: totalThbDebit,
      networkFeeThb: quote.networkFeeThb,
      netThb,
      marketRate: quote.marketPriceThb,
      marginThb: quote.marginThb,
      effectiveRate: quote.effectiveRate,
      cryptoAmount: roundedCrypto
    };
  }
}
