import crypto from 'crypto';
import axios from 'axios';
import { config } from '../dist/config/index.js';

const BASE_URL = 'https://api.binance.com';
const apiKey = config.exchangeApi.binanceApiKey;
const apiSecret = config.exchangeApi.binanceApiSecret;

function sign(params) {
  return crypto.createHmac('sha256', apiSecret).update(params.toString()).digest('hex');
}

async function checkWallets() {
  try {
    // Check funding wallet
    console.log('--- Checking Funding Wallet ---');
    const fParams = new URLSearchParams({ timestamp: Date.now().toString() });
    fParams.append('signature', sign(fParams));
    const fundingRes = await axios.post(`${BASE_URL}/sapi/v1/asset/get-funding-asset`, fParams.toString(), {
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    console.log('Funding Asset Balances:', fundingRes.data);

    // Check user asset
    console.log('\n--- Checking User Asset (All Wallets) ---');
    const uParams = new URLSearchParams({ timestamp: Date.now().toString() });
    uParams.append('signature', sign(uParams));
    const userRes = await axios.post(`${BASE_URL}/sapi/v3/asset/getUserAsset`, uParams.toString(), {
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    console.log('User Assets:', userRes.data);

  } catch (err) {
    if (err.response) {
      console.error('[Error]', err.response.status, err.response.data);
    } else {
      console.error('[Error]', err.message);
    }
  }
}

checkWallets();
