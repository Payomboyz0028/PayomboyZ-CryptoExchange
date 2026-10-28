import crypto from 'crypto';
import axios from 'axios';
import { config } from '../../config/index.js';

export interface BinanceWithdrawResult {
  withdrawId: string;
  coin: string;
  network: string;
  address: string;
  amount: number;
}

export class BinanceWithdrawAdapter {
  private static readonly BASE_URL = 'https://api.binance.com';

  private static sign(params: URLSearchParams, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(params.toString())
      .digest('hex');
  }

  public static async withdraw(
    coin: string,
    network: string,
    address: string,
    amount: number
  ): Promise<BinanceWithdrawResult> {
    const apiKey = config.exchangeApi.binanceApiKey;
    const apiSecret = config.exchangeApi.binanceApiSecret;

    if (!apiKey || !apiSecret) {
      console.warn('[Binance SAPI] API key or secret not set. Simulating Binance withdrawal.');
      return {
        withdrawId: 'SIMULATED-BINANCE-' + Date.now(),
        coin,
        network,
        address,
        amount
      };
    }

    // Pre-flight Check: Verify coin balance & attempt auto-swap if needed
    if (coin !== 'USDT') {
      const balances = await this.getAccountBalances();
      const currentCoinBalance = balances[coin] || 0;
      const currentUsdtBalance = balances['USDT'] || 0;

      if (currentCoinBalance < amount) {
        console.log(`[Binance SAPI] Insufficient ${coin} balance (has ${currentCoinBalance}, needs ${amount}). Attempting auto-swap from USDT...`);
        const swapped = await this.tryAutoSwap(coin, amount - currentCoinBalance);
        if (!swapped) {
          throw new Error(
            `ยอดเหรียญ ${coin} ในกระเป๋า Binance ไม่เพียงพอ (มี ${currentCoinBalance} ${coin}, ต้องการ ${amount} ${coin}) ` +
            `กรุณาเข้าไปที่ Binance แล้วแปลง USDT เป็น ${coin} สำรองไว้ หรือเปิดสิทธิ์ "Enable Spot & Margin Trading" บน API Key เพื่อให้บอทแลกเหรียญอัตโนมัติ`
          );
        }
        // Small pause for spot settlement
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const timestamp = Date.now();
    const params = new URLSearchParams({
      coin,
      network,
      address,
      amount: amount.toString(),
      timestamp: timestamp.toString()
    });

    const signature = this.sign(params, apiSecret);
    params.append('signature', signature);

    try {
      const res = await axios.post(`${this.BASE_URL}/sapi/v1/capital/withdraw/apply?${params.toString()}`, null, {
        headers: { 'X-MBX-APIKEY': apiKey },
        timeout: 20000
      });

      return {
        withdrawId: res.data.id,
        coin,
        network,
        address,
        amount
      };
    } catch (err: any) {
      const binanceMsg = err.response?.data?.msg || err.message;
      const binanceCode = err.response?.data?.code || '';
      console.error(`[Binance SAPI Withdraw Error] Code: ${binanceCode}, Msg: ${binanceMsg}`);
      throw new Error(`Binance API Error (${binanceCode}): ${binanceMsg}`);
    }
  }

  public static async getWithdrawHistory(coin?: string, id?: string): Promise<any[]> {
    const apiKey = config.exchangeApi.binanceApiKey;
    const apiSecret = config.exchangeApi.binanceApiSecret;
    if (!apiKey || !apiSecret) return [];

    const params = new URLSearchParams({
      timestamp: Date.now().toString()
    });
    if (coin) params.append('coin', coin);
    if (id) params.append('withdrawOrderId', id);

    const signature = this.sign(params, apiSecret);
    params.append('signature', signature);

    const res = await axios.get(`${this.BASE_URL}/sapi/v1/capital/withdraw/history?${params.toString()}`, {
      headers: { 'X-MBX-APIKEY': apiKey }
    });

    return res.data;
  }

  public static async getAccountBalances(): Promise<Record<string, number>> {
    const apiKey = config.exchangeApi.binanceApiKey;
    const apiSecret = config.exchangeApi.binanceApiSecret;
    if (!apiKey || !apiSecret) return {};

    const params = new URLSearchParams({ timestamp: Date.now().toString() });
    const signature = this.sign(params, apiSecret);
    params.append('signature', signature);

    try {
      const res = await axios.get(`${this.BASE_URL}/api/v3/account?${params.toString()}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
        timeout: 10000
      });
      const balances: Record<string, number> = {};
      for (const b of res.data.balances || []) {
        const free = parseFloat(b.free);
        if (free > 0) balances[b.asset] = free;
      }
      return balances;
    } catch (err: any) {
      console.warn('[Binance SAPI] Could not fetch account balances:', err.message);
      return {};
    }
  }

  public static async tryAutoSwap(coin: string, neededAmount: number): Promise<boolean> {
    const apiKey = config.exchangeApi.binanceApiKey;
    const apiSecret = config.exchangeApi.binanceApiSecret;
    if (!apiKey || !apiSecret) return false;

    const symbol = `${coin}USDT`;
    try {
      // Get current market price of symbol
      const tickerRes = await axios.get(`${this.BASE_URL}/api/v3/ticker/price?symbol=${symbol}`);
      const price = parseFloat(tickerRes.data.price);
      if (!price || price <= 0) return false;

      // Calculate USDT required (+2% buffer for slippage and trading fees)
      const usdtNeeded = Math.max(5.5, Math.ceil(neededAmount * price * 1.02 * 100) / 100);

      const params = new URLSearchParams({
        symbol,
        side: 'BUY',
        type: 'MARKET',
        quoteOrderQty: usdtNeeded.toString(),
        timestamp: Date.now().toString()
      });
      const signature = this.sign(params, apiSecret);
      params.append('signature', signature);

      console.log(`[Binance Auto-Swap] Executing Market BUY ${symbol} with ${usdtNeeded} USDT...`);
      const tradeRes = await axios.post(`${this.BASE_URL}/api/v3/order?${params.toString()}`, null, {
        headers: { 'X-MBX-APIKEY': apiKey },
        timeout: 15000
      });

      console.log(`[Binance Auto-Swap] Swap successful! Order ID: ${tradeRes.data.orderId}, executedQty: ${tradeRes.data.executedQty}`);
      return true;
    } catch (err: any) {
      console.warn(`[Binance Auto-Swap] Could not auto-swap ${symbol}:`, err.response?.data?.msg || err.message);
      return false;
    }
  }
}

