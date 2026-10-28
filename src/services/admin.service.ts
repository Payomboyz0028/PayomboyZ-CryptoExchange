import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { prisma } from './db.service.js';
import { EvmHotWallet } from '../wallets/evm/evm.wallet.js';
import { config } from '../config/index.js';

export class AdminService {
  public static async createExecutiveDashboard() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Query Statistics
    const [
      totalOrdersCount,
      completedOrdersCount,
      failedOrdersCount,
      todayCompletedOrders,
      recentOrders
    ] = await Promise.all([
      prisma.exchangeOrder.count(),
      prisma.exchangeOrder.count({ where: { status: 'COMPLETED' } }),
      prisma.exchangeOrder.count({ where: { status: 'FAILED' } }),
      prisma.exchangeOrder.findMany({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startOfToday }
        }
      }),
      prisma.exchangeOrder.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8
      })
    ]);

    // Financial Totals for Today
    const todayVolumeThb = todayCompletedOrders.reduce((acc, o) => acc + o.thbAmountDebit, 0);
    const todayProfitThb = todayCompletedOrders.reduce((acc, o) => acc + (o.thbAmountDebit - o.netThbAmount), 0);
    const todayGasCollected = todayCompletedOrders.reduce((acc, o) => acc + o.networkFeeThb, 0);

    // 2. Fetch Hot Wallet Balances (Gracefully catch if RPC or key not set)
    let bscBnb = '0.00';
    let bscUsdt = '0.00';
    let polygonPol = '0.00';
    let polygonUsdt = '0.00';

    try {
      if (config.wallets.evmPrivateKey) {
        const [bscBal, polyBal] = await Promise.allSettled([
          EvmHotWallet.getWalletBalance('BSC'),
          EvmHotWallet.getWalletBalance('POLYGON')
        ]);
        if (bscBal.status === 'fulfilled') {
          bscBnb = parseFloat(bscBal.value.nativeBalance).toFixed(4);
          bscUsdt = parseFloat(bscBal.value.usdtBalance).toFixed(2);
        }
        if (polyBal.status === 'fulfilled') {
          polygonPol = parseFloat(polyBal.value.nativeBalance).toFixed(4);
          polygonUsdt = parseFloat(polyBal.value.usdtBalance).toFixed(2);
        }
      }
    } catch (_) {}

    // 3. Construct Executive Embed
    const embed = new EmbedBuilder()
      .setColor(0x00f0ff)
      .setTitle('👑 SC-HUB EXECUTIVE DASHBOARD — ระบบประวัติธุรกรรมคริปโต')
      .setDescription(
        `**ศูนย์บัญชาการและตรวจสอบประวัติการทำธุรกรรม (Owner Command Center)**\n` +
        `ข้อมูลอัปเดตแบบเรียลไทม์จากฐานข้อมูลและระบบ Hot Wallet\n` +
        `──────────────────────────────────────────`
      )
      .addFields(
        {
          name: '📊 ยอดรวมวันนี้ (Today 24h Summary)',
          value:
            `• 💵 ปริมาณการแลก: **\`${todayVolumeThb.toFixed(2)} THB\`** (${todayCompletedOrders.length} ออเดอร์)\n` +
            `• 💼 กำไรส่วนต่างสุทธิ: 🚀 **\`+${todayProfitThb.toFixed(2)} THB\`**\n` +
            `• ⛽ ค่าแก๊สที่เรียกเก็บ: \`${todayGasCollected.toFixed(2)} THB\``,
          inline: false
        },
        {
          name: '🏦 สถานะกระเป๋า Hot Wallet',
          value:
            `• **BSC (BEP-20):** \`${bscUsdt} USDT\` • Gas: \`${bscBnb} BNB\`\n` +
            `• **Polygon:** \`${polygonUsdt} USDT\` • Gas: \`${polygonPol} POL\`\n` +
            `• **Remote Vault:** \`${config.vault.enabled ? '🟢 ENABLED (Cloud API)' : '⚪ DISABLED'}\``,
          inline: false
        },
        {
          name: '📜 ประวัติการทำธุรกรรม 8 รายการล่าสุด (Recent Ledger)',
          value:
            recentOrders.length === 0
              ? 'ยังไม่มีรายการธุรกรรมในระบบ'
              : recentOrders
                  .map((o, idx) => {
                    const statusEmoji =
                      o.status === 'COMPLETED'
                        ? '✅'
                        : o.status === 'FAILED'
                        ? '❌'
                        : o.status.startsWith('PENDING')
                        ? '⏳'
                        : '🔄';
                    const link = o.txHash
                      ? `[TxID](${o.explorerUrl || `https://bscscan.com/tx/${o.txHash}`})`
                      : `\`${o.status}\``;
                    const coin = o.asset.split('_')[0];
                    return (
                      `**${idx + 1}. ${statusEmoji} \`${o.id.slice(0, 8)}\`** | <@${o.discordUserId}>\n` +
                      `• ยอด: \`${o.thbAmountDebit.toFixed(2)} THB\` ➔ **\`${o.cryptoAmountOut} ${coin}\`** (${o.network})\n` +
                      `• สถานะ: \`${o.status}\` • ${link} • <t:${Math.floor(o.createdAt.getTime() / 1000)}:R>`
                    );
                  })
                  .join('\n\n'),
          inline: false
        }
      )
      .setFooter({ text: `Total Orders: ${totalOrdersCount} | Success: ${completedOrdersCount} | Failed: ${failedOrdersCount}` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_owner_refresh_history')
        .setLabel('🔄 รีเฟรชประวัติ')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_owner_check_wallets')
        .setLabel('🏦 ตรวจสอบ Hot Wallets')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }
}
