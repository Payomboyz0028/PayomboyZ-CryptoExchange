import { EvmHotWallet } from '../dist/wallets/evm/evm.wallet.js';

async function testBalance() {
  try {
    console.log('--- Checking BSC Hot Wallet Balance ---');
    const bal = await EvmHotWallet.getWalletBalance('BSC');
    console.log('Wallet Details:');
    console.log('  Address:', bal.address);
    console.log(`  Native (${bal.nativeSymbol}) Balance:`, bal.nativeBalance);
    console.log('  USDT Balance:', bal.usdtBalance, 'USDT');
  } catch (err) {
    console.error('Balance Error:', err);
  }
}

testBalance();
