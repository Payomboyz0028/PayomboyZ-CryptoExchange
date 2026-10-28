import { EvmHotWallet } from '../dist/wallets/evm/evm.wallet.js';

const DESTINATION_ADDRESS = '0xc7dd6ed5b2a797b0f7b3d736e59101823b15758d';
const AMOUNT = 5.0; // 5.0 USDT

async function executeTransfer() {
  console.log(`[Live Execution] Starting on-chain transfer of ${AMOUNT} USDT (BSC BEP20)`);
  console.log(`[Live Execution] Recipient (from QR): ${DESTINATION_ADDRESS}`);

  try {
    const result = await EvmHotWallet.transferUsdt('BSC', DESTINATION_ADDRESS, AMOUNT);
    console.log('\n==================================================');
    console.log('🎉 LIVE ON-CHAIN BROADCAST SUCCESSFUL!');
    console.log('TxHash:', result.txHash);
    console.log('Explorer:', result.explorerUrl);
    console.log('From:', result.from);
    console.log('To:', DESTINATION_ADDRESS);
    console.log('Amount:', AMOUNT, 'USDT');
    console.log('==================================================\n');
  } catch (err) {
    console.error('❌ Transfer Error:', err);
  }
}

executeTransfer();
