import crypto from 'crypto';
import axios from 'axios';
import { config } from '../dist/config/index.js';

const BASE_URL = 'https://api.binance.com';
const apiKey = config.exchangeApi.binanceApiKey;
const apiSecret = config.exchangeApi.binanceApiSecret;

console.log('[Binance Diagnostic] API Key configured:', apiKey ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}` : 'NONE');
console.log('[Binance Diagnostic] Secret configured:', apiSecret ? `${apiSecret.substring(0, 4)}...` : 'NONE');

function sign(params) {
  return crypto.createHmac('sha256', apiSecret).update(params.toString()).digest('hex');
}

async function run() {
  try {
    // 1. Check Account status
    console.log('\n--- 1. Querying /api/v3/account ---');
    const timestamp = Date.now();
    const acctParams = new URLSearchParams({ timestamp: timestamp.toString() });
    acctParams.append('signature', sign(acctParams));

    const acctRes = await axios.get(`${BASE_URL}/api/v3/account?${acctParams.toString()}`, {
      headers: { 'X-MBX-APIKEY': apiKey }
    });

    console.log('Account Status:');
    console.log('  canTrade:', acctRes.data.canTrade);
    console.log('  canWithdraw:', acctRes.data.canWithdraw);
    console.log('  canDeposit:', acctRes.data.canDeposit);
    console.log('  accountType:', acctRes.data.accountType);
    console.log('  permissions:', acctRes.data.permissions);

    const nonZeroBalances = acctRes.data.balances.filter(
      (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );
    console.log('Non-zero balances:', nonZeroBalances);

    // 2. Query Coin Capital Config to get network details for USDT
    console.log('\n--- 2. Querying /sapi/v1/capital/config/getall for USDT ---');
    const capitalParams = new URLSearchParams({ timestamp: Date.now().toString() });
    capitalParams.append('signature', sign(capitalParams));

    const capitalRes = await axios.get(`${BASE_URL}/sapi/v1/capital/config/getall?${capitalParams.toString()}`, {
      headers: { 'X-MBX-APIKEY': apiKey }
    });

    const usdtConfig = capitalRes.data.find((c) => c.coin === 'USDT');
    if (usdtConfig) {
      console.log('USDT Networks:');
      usdtConfig.networkList.forEach((net) => {
        console.log(`  Network: ${net.network} (${net.name}) | WithdrawEnable: ${net.withdrawEnable} | Fee: ${net.withdrawFee} | Min: ${net.withdrawMin} | Max: ${net.withdrawMax}`);
      });
    } else {
      console.log('USDT not found in config.');
    }

    // 3. Query API key permissions via sapi if available
    console.log('\n--- 3. Querying /sapi/v1/account/apiRestrictions ---');
    const restParams = new URLSearchParams({ timestamp: Date.now().toString() });
    restParams.append('signature', sign(restParams));
    try {
      const restRes = await axios.get(`${BASE_URL}/sapi/v1/account/apiRestrictions?${restParams.toString()}`, {
        headers: { 'X-MBX-APIKEY': apiKey }
      });
      console.log('API Restrictions:', restRes.data);
    } catch (e) {
      console.log('apiRestrictions endpoint error:', e.response?.data || e.message);
    }

  } catch (err) {
    if (err.response) {
      console.error('[Binance Error]', err.response.status, err.response.data);
    } else {
      console.error('[Error]', err.message);
    }
  }
}

run();
