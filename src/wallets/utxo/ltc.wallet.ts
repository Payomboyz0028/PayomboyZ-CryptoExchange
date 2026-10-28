import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import axios from 'axios';
import { config } from '../../config/index.js';
import { LITECOIN_NETWORK } from '../../services/addressValidator.service.js';

const ECPair = ECPairFactory(ecc);

export class LtcHotWallet {
  private static readonly EXPLORER = 'https://blockchair.com/litecoin/transaction/';

  public static async transferLtc(
    recipientAddress: string,
    amountLtc: number,
    satPerByte: number = 2
  ): Promise<{ txHash: string; explorerUrl: string; from: string }> {
    const wifKey = config.wallets.ltcWifKey;

    if (!wifKey) {
      console.warn('[LTC Hot Wallet] WIF Private key not set in .env. Generating simulated TxHash.');
      const mockHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      return {
        txHash: mockHash,
        explorerUrl: `${this.EXPLORER}${mockHash}`,
        from: 'ltc1qmockaddress0000000000000000000000000'
      };
    }

    const keyPair = ECPair.fromWIF(wifKey, LITECOIN_NETWORK);
    const { address: myAddress } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: LITECOIN_NETWORK
    });

    if (!myAddress) throw new Error('ไม่สามารถสร้างที่อยู่ Litecoin จาก Private Key ได้');

    const targetSatoshis = Math.round(amountLtc * 1e8);

    // 1. ดึง UTXOs จาก BlockCypher หรือ Tatum API
    const utxoRes = await axios.get(`https://api.blockcypher.com/v1/ltc/main/addrs/${myAddress}?unspentOnly=true`, {
      timeout: 8000
    });
    const txrefs = utxoRes.data.txrefs || [];

    if (txrefs.length === 0) {
      throw new Error(`ไม่พบ UTXO ในกระเป๋า Hot Wallet Litecoin (${myAddress})`);
    }

    const psbt = new bitcoin.Psbt({ network: LITECOIN_NETWORK });
    let inputSum = 0;

    for (const utxo of txrefs) {
      psbt.addInput({
        hash: utxo.tx_hash,
        index: utxo.tx_output_n,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: LITECOIN_NETWORK }).output!,
          value: utxo.value
        }
      });

      inputSum += utxo.value;
      if (inputSum >= targetSatoshis + 2000) break;
    }

    const estimatedBytes = psbt.inputCount * 68 + 2 * 31 + 10;
    const estimatedFee = estimatedBytes * satPerByte;
    const changeSatoshis = inputSum - targetSatoshis - estimatedFee;

    if (changeSatoshis < 0) {
      throw new Error(`ยอด LTC ใน Hot Wallet ไม่เพียงพอสำหรับยอดโอนและค่าธรรมเนียม Mining Fee`);
    }

    psbt.addOutput({ address: recipientAddress, value: targetSatoshis });
    if (changeSatoshis > 546) {
      psbt.addOutput({ address: myAddress, value: changeSatoshis });
    }

    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();

    const rawHex = psbt.extractTransaction().toHex();
    const pushRes = await axios.post('https://api.blockcypher.com/v1/ltc/main/txs/push', { tx: rawHex });

    return {
      txHash: pushRes.data.tx.hash,
      explorerUrl: `${this.EXPLORER}${pushRes.data.tx.hash}`,
      from: myAddress
    };
  }
}
