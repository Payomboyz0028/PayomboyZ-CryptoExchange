import crypto from 'crypto';
import axios from 'axios';
import { config } from '../dist/config/index.js';

const BASE_URL = 'https://api.binance.com';
const apiKey = config.exchangeApi.binanceApiKey;
const apiSecret = config.exchangeApi.binanceApiSecret;

function sign(params) {
  return crypto.createHmac('sha256', apiSecret).update(params.toString()).digest('hex');
}

async function checkHistory() {
  try {
    const params = new URLSearchParams({ timestamp: Date.now().toString() });
    params.append('signature', sign(params));
    const res = await axios.get(`${BASE_URL}/sapi/v1/capital/deposit/hisrec?${params.toString()}`, {
      headers: { 'X-MBX-APIKEY': apiKey }
    });
    console.log('Deposit History:', res.data);
  } catch (err) {
    console.error('Deposit History Error:', err.response?.data || err.message);
  }
}

checkHistory();
