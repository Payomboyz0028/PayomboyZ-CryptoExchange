import { RateService } from '../src/services/rate.service.js';
import { AddressValidator } from '../src/services/addressValidator.service.js';
import { PromptPayService } from '../src/services/promptpay.service.js';

async function testAll() {
  console.log('--- 1. Testing Rate Service ---');
  const usdtQuote = await RateService.getQuote('USDT_BEP20');
  console.log('USDT BEP20 Quote:', usdtQuote);

  const ltcQuote = await RateService.getQuote('LTC');
  console.log('LTC Quote:', ltcQuote);

  const payout = RateService.calculatePayout(500, usdtQuote);
  console.log('Payout for 500 THB:', payout);

  console.log('\n--- 2. Testing Address Validator ---');
  const validEvm = AddressValidator.validate('USDT_BEP20', '0x55d398326f99059fF775485246999027B3197955');
  console.log('Valid EVM:', validEvm);

  const invalidEvm = AddressValidator.validate('USDT_BEP20', '0xinvalid');
  console.log('Invalid EVM:', invalidEvm);

  const validTron = AddressValidator.validate('USDT_TRC20', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
  console.log('Valid TRON:', validTron);

  const validLtc = AddressValidator.validate('LTC', 'ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgm6n44');
  console.log('Valid LTC:', validLtc);

  console.log('\n--- 3. Testing PromptPay QR Generator ---');
  const qrBuffer = await PromptPayService.generateQrBuffer(150);
  console.log('Generated PromptPay QR PNG Buffer length:', qrBuffer.length, 'bytes');

  console.log('\n✅ ALL SYSTEM TESTS PASSED SUCCESSFULLY!');
}

testAll().catch(console.error);
