import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  db: {
    url: process.env.DATABASE_URL || 'file:./data/exchange.sqlite3'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  },
  discord: {
    token: process.env.DISCORD_BOT_TOKEN || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    exchangeChannelId: process.env.DISCORD_EXCHANGE_CHANNEL_ID || '',
    adminLogChannelId: process.env.DISCORD_ADMIN_LOG_CHANNEL_ID || ''
  },
  easyslip: {
    apiKey: process.env.EASYSLIP_API_KEY || '',
    verifyUrl: 'https://api.easyslip.com/v2/verify/bank'
  },
  bank: {
    name: process.env.BANK_NAME || 'ไทยพาณิชย์ (SCB)',
    code: process.env.BANK_CODE || '014',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
    accountName: process.env.BANK_ACCOUNT_NAME || '',
    promptpayNatId: process.env.PROMPTPAY_NATID || '',
    truemoneyPhone: process.env.TRUEMONEY_PHONE || ''
  },
  wallets: {
    evmPrivateKey: process.env.HOT_WALLET_EVM_PRIVATE_KEY || '',
    evmPrimaryAddress: process.env.HOT_WALLET_EVM_PRIMARY_ADDRESS || '0xf1F95d0bdD5140e04758294C9614262c8c000183',
    evmReserveAddress: process.env.HOT_WALLET_EVM_RESERVE_ADDRESS || '0xEEa103Fc2f0c03a63C95499609Bf8713B8f81BA2',
    tronPrivateKey: process.env.HOT_WALLET_TRON_PRIVATE_KEY || '',
    ltcWifKey: process.env.HOT_WALLET_LTC_WIF_KEY || ''
  },
  rpcs: {
    bsc: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org',
    polygon: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    arbitrum: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    tronFullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
    tronGridApiKey: process.env.TRONGRID_API_KEY || '',
    ltcApiUrl: process.env.LTC_API_URL || 'https://api.blockcypher.com/v1/ltc/main'
  },
  exchangeApi: {
    binanceApiKey: process.env.BINANCE_API_KEY || '',
    binanceApiSecret: process.env.BINANCE_API_SECRET || ''
  },
  vault: {
    enabled: process.env.USE_REMOTE_VAULT === 'true',
    url: process.env.VAULT_URL || 'https://sn9n9cvijp.apps.bot-hosting.cloud',
    token: process.env.VAULT_AUTH_TOKEN || 'pbz_vault_9f82c47ab1e56304d7c81a2f90be6531'
  },
  business: {
    spreadPercentage: parseFloat(process.env.SPREAD_PERCENTAGE || '0'),
    marginThbUsdt: parseFloat(process.env.MARGIN_THB_USDT || '1.20'),
    marginThbLtc: parseFloat(process.env.MARGIN_THB_LTC || '50.0'),
    networkFeeBsc: parseFloat(process.env.NETWORK_FEE_THB_BSC || '10.0'),
    networkFeeTron: parseFloat(process.env.NETWORK_FEE_THB_TRON || '35.0'),
    networkFeePolygon: parseFloat(process.env.NETWORK_FEE_THB_POLYGON || '5.0'),
    networkFeeLtc: parseFloat(process.env.NETWORK_FEE_THB_LTC || '5.0'),
    maxSingleTxThb: parseFloat(process.env.MAX_SINGLE_TX_THB || '5000.0'),
    hourlyVolumeCapThb: parseFloat(process.env.HOURLY_VOLUME_CAP_THB || '20000.0')
  }
};
