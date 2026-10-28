import crypto from 'crypto';
import axios from 'axios';
import { config } from '../dist/config/index.js';

const BASE_URL = 'https://api.binance.com';
const apiKey = config.exchangeApi.binanceApiKey;
const apiSecret = config.exchangeApi.binanceApiSecret;

function sign(params) {
  return crypto.createHmac('sha256', apiSecret).update(params.toString()).digest('hex');
}

async function testWithdraw() {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({
      coin: 'USDT',
      network: 'BSC',
      address: '0xb5377f0b289b46c591e789ee8feb78aa87cc1e56',
      amount: '5.0',
      timestamp: timestamp.toString()
    });
    params.append('signature', sign(params));

    const res = await axios.post(`${BASE_URL}/sapi/v1/capital/withdraw/apply?${params.toString()}`, null, {
      headers: { 'X-MBX-APIKEY': apiKey }
    });
    console.log('Withdrawal successful:', res.data);
  } catch (err) {
    console.error('Withdraw Error:', err.response?.status, err.response?.data || err.message);
  }
}

testWithdraw();
