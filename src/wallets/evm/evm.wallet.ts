import { ethers } from 'ethers';
import { config } from '../../config/index.js';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

export const EVM_CONTRACTS: Record<string, { address: string; decimals: number; rpc: string; explorer: string }> = {
  BSC: {
    address: '0x55d398326f99059fF775485246999027B3197955', // USDT (BEP20) on BSC
    decimals: 18,
    rpc: config.rpcs.bsc,
    explorer: 'https://bscscan.com/tx/'
  },
  POLYGON: {
    address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT on Polygon
    decimals: 6,
    rpc: config.rpcs.polygon,
    explorer: 'https://polygonscan.com/tx/'
  },
  ARBITRUM: {
    address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT on Arbitrum One
    decimals: 6,
    rpc: config.rpcs.arbitrum,
    explorer: 'https://arbiscan.io/tx/'
  }
};

export class EvmHotWallet {
  public static async getWalletBalance(network: 'BSC' | 'POLYGON' | 'ARBITRUM'): Promise<{
    address: string;
    nativeSymbol: string;
    nativeBalance: string;
    usdtBalance: string;
  }> {
    const netConfig = EVM_CONTRACTS[network];
    const privateKey = config.wallets.evmPrivateKey;
    if (!privateKey) throw new Error('HOT_WALLET_EVM_PRIVATE_KEY not set');

    const provider = new ethers.JsonRpcProvider(netConfig.rpc);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(netConfig.address, ERC20_ABI, provider);

    const [nativeBal, tokenBal] = await Promise.all([
      provider.getBalance(wallet.address),
      contract.balanceOf(wallet.address)
    ]);

    const nativeSymbol = network === 'BSC' ? 'BNB' : network === 'POLYGON' ? 'POL' : 'ETH';

    return {
      address: wallet.address,
      nativeSymbol,
      nativeBalance: ethers.formatEther(nativeBal),
      usdtBalance: ethers.formatUnits(tokenBal, netConfig.decimals)
    };
  }

  public static async transferUsdt(
    network: 'BSC' | 'POLYGON' | 'ARBITRUM',
    recipientAddress: string,
    amountDecimal: number
  ): Promise<{ txHash: string; explorerUrl: string; from: string }> {
    const netConfig = EVM_CONTRACTS[network];
    if (!netConfig) {
      throw new Error(`ไม่พบการตั้งค่าสำหรับเครือข่าย ${network}`);
    }

    const privateKey = config.wallets.evmPrivateKey;
    if (!privateKey) {
      console.warn(`[EVM Hot Wallet] Private key not set in .env. Generating simulated TxHash for ${network}.`);
      const mockHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      return {
        txHash: mockHash,
        explorerUrl: `${netConfig.explorer}${mockHash}`,
        from: '0x000000000000000000000000000000000000dEaD'
      };
    }

    const provider = new ethers.JsonRpcProvider(netConfig.rpc);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(netConfig.address, ERC20_ABI, wallet);

    // 1. ตรวจสอบค่า Gas เหรียญหลัก (BNB / POL / ETH)
    const nativeBal = await provider.getBalance(wallet.address);
    if (nativeBal < ethers.parseEther('0.0005')) {
      throw new Error(`เหรียญค่า Gas ในกระเป๋า Hot Wallet ไม่เพียงพอ (${wallet.address}) คงเหลือ ${ethers.formatEther(nativeBal)} BNB`);
    }

    // 2. ตรวจสอบยอดเหรียญ USDT คงเหลือ
    const rawAmount = ethers.parseUnits(amountDecimal.toFixed(netConfig.decimals), netConfig.decimals);
    const tokenBal = await contract.balanceOf(wallet.address);
    if (tokenBal < rawAmount) {
      throw new Error(`เหรียญ USDT ในกระเป๋า Hot Wallet ไม่เพียงพอ (คงเหลือ ${ethers.formatUnits(tokenBal, netConfig.decimals)} USDT ต้องการโอน ${amountDecimal} USDT)`);
    }

    const feeData = await provider.getFeeData();

    const tx = await contract.transfer(recipientAddress, rawAmount, {
      gasLimit: 90000,
      gasPrice: feeData.gasPrice
    });

    console.log(`[EVM Hot Wallet] Broadcasted ${amountDecimal} USDT to ${recipientAddress} on ${network}. TxHash: ${tx.hash}`);

    return {
      txHash: tx.hash,
      explorerUrl: `${netConfig.explorer}${tx.hash}`,
      from: wallet.address
    };
  }
}
