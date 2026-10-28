import { Queue, Worker, Job } from 'bullmq';
import axios from 'axios';
import { Redis } from 'ioredis';
import { Client, EmbedBuilder, TextChannel, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config/index.js';
import { prisma } from './db.service.js';
import { EvmHotWallet } from '../wallets/evm/evm.wallet.js';
import { TronHotWallet } from '../wallets/tron/tron.wallet.js';
import { LtcHotWallet } from '../wallets/utxo/ltc.wallet.js';
import { BinanceWithdrawAdapter } from '../wallets/exchange/binance.adapter.js';
import { ReceiptService } from './receipt.service.js';
import { UnifiedCreditService } from './unifiedCredit.service.js';

export interface PayoutJobData {
  orderId: string;
}

export class QueueService {
  private static redisClient: Redis | null = null;
  private static payoutQueue: Queue | null = null;
  private static isRedisAvailable = false;
  private static isProcessingSqliteQueue = false;
  private static discordClient: Client | null = null;

  public static setDiscordClient(client: Client): void {
    this.discordClient = client;
  }

  public static async init(): Promise<void> {
    try {
      this.redisClient = new Redis(config.redis.url, {
        maxRetriesPerRequest: null,
        connectTimeout: 2000,
        retryStrategy: () => null // don't loop endlessly if redis not running
      });

      this.redisClient.on('error', () => {
        if (this.isRedisAvailable) {
          console.warn('[Queue] Redis connection lost. Falling back to Zero-Cost SQLite FIFO Queue.');
          this.isRedisAvailable = false;
        }
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 2000);
        this.redisClient?.once('connect', () => {
          clearTimeout(timer);
          this.isRedisAvailable = true;
          console.log('[Queue] Redis connected successfully. Using BullMQ Engine.');
          resolve();
        });
        this.redisClient?.once('error', () => {
          clearTimeout(timer);
          resolve();
        });
      });

      if (this.isRedisAvailable && this.redisClient) {
        this.payoutQueue = new Queue('crypto-payout-queue', {
          connection: this.redisClient
        });
      } else {
        console.log('[Queue] Using Zero-Cost SQLite Strict FIFO Queue Engine (100% Free & Persistent).');
      }
    } catch {
      console.log('[Queue] Fallback: Active SQLite Strict FIFO Queue Engine.');
    }
  }

  public static async enqueuePayout(orderId: string): Promise<void> {
    if (this.isRedisAvailable && this.payoutQueue) {
      await this.payoutQueue.add('process-payout', { orderId }, {
        jobId: orderId, // Idempotency
        removeOnComplete: 100,
        removeOnFail: 500
      });
      console.log(`[Queue] Order ${orderId} added to BullMQ.`);
    } else {
      // SQLite queue: the order is already in DB with status QUEUED_FOR_PAYOUT
      console.log(`[Queue] Order ${orderId} enqueued in SQLite FIFO.`);
      this.triggerSqliteQueue();
    }
  }

  public static async triggerSqliteQueue(): Promise<void> {
    if (this.isProcessingSqliteQueue) return;
    this.isProcessingSqliteQueue = true;

    try {
      // Recovery sweep: reset orders stuck in PROCESSING_PAYOUT for >3 min (crash recovery)
      const stuckCutoff = new Date(Date.now() - 3 * 60 * 1000);
      const stuckOrders = await prisma.exchangeOrder.findMany({
        where: { status: 'PROCESSING_PAYOUT', createdAt: { lt: stuckCutoff } }
      });
      for (const stuck of stuckOrders) {
        console.warn(`[Queue] Recovering stuck order ${stuck.id} (PROCESSING_PAYOUT → QUEUED_FOR_PAYOUT)`);
        await prisma.exchangeOrder.update({
          where: { id: stuck.id },
          data: { status: 'QUEUED_FOR_PAYOUT' }
        });
      }

      while (true) {
        const nextOrder = await prisma.exchangeOrder.findFirst({
          where: { status: 'QUEUED_FOR_PAYOUT' },
          orderBy: { createdAt: 'asc' }
        });

        if (!nextOrder) break;

        await this.processPayoutOrder(nextOrder.id);
      }
    } catch (err) {
      console.error('[SQLite Queue Worker Error]:', err);
    } finally {
      this.isProcessingSqliteQueue = false;
    }
  }

  public static async processPayoutOrder(orderId: string): Promise<void> {
    const order = await prisma.exchangeOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'QUEUED_FOR_PAYOUT') return;

    // Guard: max 3 retries total to prevent infinite crash-loop
    if (order.retryCount >= 3) {
      console.error(`[Payout Worker] Order ${orderId} exceeded max retries (${order.retryCount}). Marking FAILED.`);
      await prisma.exchangeOrder.update({
        where: { id: orderId },
        data: { status: 'FAILED', errorMessage: `Max retries exceeded (${order.retryCount})` }
      });
      return;
    }

    await prisma.exchangeOrder.update({
      where: { id: orderId },
      data: { status: 'PROCESSING_PAYOUT', retryCount: { increment: 1 } }
    });

    try {
      let result: { txHash: string; explorerUrl: string };

      // 1. Primary Engine: Binance Master Hub SAPI Payout
      if (config.exchangeApi.binanceApiKey && config.exchangeApi.binanceApiSecret) {
        console.log(`[Payout Worker] Routing order ${order.id} through Binance Master SAPI Hub (${order.network})...`);
        const coin = order.asset.split('_')[0]; // USDT or LTC
        let binanceNetwork = 'BSC';
        if (order.network === 'TRON') binanceNetwork = 'TRX';
        else if (order.network === 'POLYGON') binanceNetwork = 'MATIC';
        else if (order.network === 'LITECOIN') binanceNetwork = 'LTC';
        else if (order.network === 'BSC') binanceNetwork = 'BSC';

        const withdrawRes = await BinanceWithdrawAdapter.withdraw(
          coin,
          binanceNetwork,
          order.recipientAddress,
          order.cryptoAmountOut
        );

        let txHash = withdrawRes.withdrawId;
        let explorerUrl = `https://bscscan.com`;
        if (order.network === 'BSC') explorerUrl = `https://bscscan.com/tx/${txHash}`;
        else if (order.network === 'TRON') explorerUrl = `https://tronscan.org/#/transaction/${txHash}`;
        else if (order.network === 'POLYGON') explorerUrl = `https://polygonscan.com/tx/${txHash}`;
        else if (order.network === 'LITECOIN') explorerUrl = `https://live.blockcypher.com/ltc/tx/${txHash}`;

        // Poll Binance for live broadcasted on-chain TxID (up to 8 tries / ~20 seconds)
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise((r) => setTimeout(r, 2500));
          try {
            const history = await BinanceWithdrawAdapter.getWithdrawHistory(coin, withdrawRes.withdrawId);
            const match = history.find((h: any) => h.id === withdrawRes.withdrawId || h.withdrawOrderId === withdrawRes.withdrawId);
            if (match && match.txId) {
              txHash = match.txId;
              if (order.network === 'BSC') explorerUrl = `https://bscscan.com/tx/${txHash}`;
              else if (order.network === 'TRON') explorerUrl = `https://tronscan.org/#/transaction/${txHash}`;
              else if (order.network === 'POLYGON') explorerUrl = `https://polygonscan.com/tx/${txHash}`;
              else if (order.network === 'LITECOIN') explorerUrl = `https://live.blockcypher.com/ltc/tx/${txHash}`;
              console.log(`[Payout Worker] Live on-chain TxID confirmed from Binance: ${txHash}`);
              break;
            }
          } catch (_) {}
        }

        result = { txHash, explorerUrl };
      } else if (config.vault.enabled && order.network === 'BSC') {
        console.log(`[Payout Worker] Pulling ${order.cryptoAmountOut} USDT from Reserve Vault to Disbursement Relay (${config.wallets.evmPrimaryAddress})...`);
        const pullResp = await axios.post(
          `${config.vault.url}/api/v1/payout`,
          {
            to: config.wallets.evmPrimaryAddress,
            amount: order.cryptoAmountOut,
            network: 'BSC',
            orderId: `PULL-${order.id}`
          },
          {
            headers: { 'X-Vault-Token': config.vault.token },
            timeout: 25000
          }
        );

        if (!pullResp.data?.success) {
          throw new Error(pullResp.data?.error || 'Failed to pull funds from Reserve Vault');
        }
        console.log(`[Payout Worker] Vault pull confirmed (Tx: ${pullResp.data.txHash}). Relaying to customer ${order.recipientAddress}...`);

        // Step 2: Relay Wallet dispatches to customer immediately (Draining back to 0 USDT)
        result = await EvmHotWallet.transferUsdt(
          'BSC',
          order.recipientAddress,
          order.cryptoAmountOut
        );
      } else if (order.network === 'BSC' || order.network === 'POLYGON' || order.network === 'ARBITRUM') {
        result = await EvmHotWallet.transferUsdt(
          order.network as any,
          order.recipientAddress,
          order.cryptoAmountOut
        );
      } else if (order.network === 'TRON') {
        result = await TronHotWallet.transferTrc20(
          order.recipientAddress,
          order.cryptoAmountOut
        );
      } else if (order.network === 'LITECOIN') {
        result = await LtcHotWallet.transferLtc(
          order.recipientAddress,
          order.cryptoAmountOut
        );
      } else {
        throw new Error(`ไม่พบ Payout Handler สำหรับเชน ${order.network}`);
      }

      await prisma.exchangeOrder.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          txHash: result.txHash,
          explorerUrl: result.explorerUrl,
          completedAt: new Date()
        }
      });

      console.log(`[Payout Worker] Order ${orderId} COMPLETED. TxHash: ${result.txHash}`);

      // Dispatch Notifications & Digital Receipts
      if (this.discordClient) {
        let receiptBuffer: Buffer | null = null;
        try {
          receiptBuffer = await ReceiptService.generateReceipt({
            orderId: order.id,
            discordUserId: order.discordUserId,
            asset: order.asset,
            network: order.network,
            recipientAddress: order.recipientAddress,
            thbAmountDebit: order.thbAmountDebit,
            netThbAmount: order.netThbAmount,
            networkFeeThb: order.networkFeeThb,
            effectiveRate: order.effectiveRate,
            cryptoAmountOut: order.cryptoAmountOut,
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            createdAt: order.createdAt
          });
        } catch (genErr) {
          console.error('[Receipt Generator Error]:', genErr);
        }

        const coinSymbol = order.asset.split('_')[0];
        const receiptFileName = `receipt_${order.id.slice(0, 8)}.png`;

        // 1. Send Official Digital Receipt to User's DM (Private 100%)
        let dmSuccess = false;
        try {
          const user = await this.discordClient.users.fetch(order.discordUserId);
          const dmEmbed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('🧾 ใบเสร็จการโอนเหรียญคริปโต (Official Crypto Receipt)')
            .setDescription(
              `**ธุรกรรมบล็อกเชนของคุณได้รับการยืนยันเรียบร้อยแล้ว**\n` +
              `──────────────────────────────────────────\n` +
              `• **รหัสออเดอร์:** \`${order.id}\`\n` +
              `• **เหรียญที่โอน:** **\`${order.cryptoAmountOut} ${coinSymbol}\`** (${order.network})\n` +
              `• **ยอดบาทที่หัก:** \`${order.thbAmountDebit.toFixed(2)} บาท\` (ค่าแก๊ส ${order.networkFeeThb.toFixed(2)} บาท)\n` +
              `• **กระเป๋าปลายทาง:** \`${order.recipientAddress}\`\n` +
              `• **TxID:** \`${result.txHash}\`\n` +
              `──────────────────────────────────────────\n` +
              `คุณสามารถเก็บไฟล์รูปภาพใบเสร็จด้านล่างไว้เป็นหลักฐาน หรือคลิกปุ่มด้านล่างเพื่อเปิดดูบน Explorer`
            )
            .setFooter({ text: 'PayomboyZ Crypto Exchange' })
            .setTimestamp();

          const dmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('🔗 ดูธุรกรรมบน Block Explorer')
              .setStyle(ButtonStyle.Link)
              .setURL(result.explorerUrl)
          );

          const dmFiles = receiptBuffer ? [new AttachmentBuilder(receiptBuffer, { name: receiptFileName })] : [];
          if (receiptBuffer) dmEmbed.setImage(`attachment://${receiptFileName}`);

          await user.send({ embeds: [dmEmbed], components: [dmRow], files: dmFiles });
          dmSuccess = true;
        } catch (_) {
          console.warn(`[DM Warning] User ${order.discordUserId} has DMs disabled or closed.`);
        }

        // 3. Send Comprehensive Audit Log to Admin Log Channel (1563930679081697402)
        if (config.discord.adminLogChannelId) {
          try {
            const adminCh = await this.discordClient.channels.fetch(config.discord.adminLogChannelId) as TextChannel;
            if (adminCh && adminCh.isTextBased()) {
              const grossMargin = order.thbAmountDebit - order.netThbAmount;
              const elapsedSec = Math.round((Date.now() - order.createdAt.getTime()) / 1000);

              const logEmbed = new EmbedBuilder()
                .setColor(0x00f0ff)
                .setTitle('📊 [EXCHANGE AUDIT LOG] คำสั่งแลกเหรียญสำเร็จ')
                .addFields(
                  { name: '👤 ผู้ใช้', value: `<@${order.discordUserId}>\n(\`${order.discordUserId}\`)`, inline: true },
                  { name: '🪙 เหรียญ & เครือข่าย', value: `\`${order.asset}\`\n(${order.network})`, inline: true },
                  { name: '🚀 ยอดเหรียญที่โอน', value: `**\`${order.cryptoAmountOut} ${coinSymbol}\`**`, inline: true },
                  { name: '💵 ยอดเงินบาทที่หัก', value: `\`${order.thbAmountDebit.toFixed(2)} บาท\``, inline: true },
                  { name: '⛽ ค่าแก๊สที่เก็บ', value: `\`${order.networkFeeThb.toFixed(2)} บาท\``, inline: true },
                  { name: '💰 แปลงเหรียญสุทธิ', value: `\`${order.netThbAmount.toFixed(2)} บาท\``, inline: true },
                  { name: '🏷️ เรทแลกเปลี่ยน', value: `\`${order.effectiveRate.toFixed(2)} บ.\` (ตลาด: ${order.marketRate.toFixed(2)})`, inline: true },
                  { name: '💼 กำไรส่วนต่าง (Margin)', value: `**\`+${grossMargin.toFixed(2)} บาท\`**`, inline: true },
                  { name: '⚡ เวลาที่ใช้', value: `\`${elapsedSec} วินาที\``, inline: true },
                  { name: '📥 กระเป๋าผู้รับ', value: `\`\`\`\n${order.recipientAddress}\n\`\`\``, inline: false },
                  { name: '🔗 TxHash (คลิกเพื่อดู)', value: `[${result.txHash}](${result.explorerUrl})`, inline: false },
                  { name: '📨 สถานะการส่ง DM', value: dmSuccess ? '✅ ส่งใบเสร็จเข้า DM สำเร็จ' : '⚠️ ลูกค้าปิดรับข้อความส่วนตัว (DM)', inline: false }
                )
                .setFooter({ text: `Order ID: ${order.id}` })
                .setTimestamp();

              const adminFiles = receiptBuffer ? [new AttachmentBuilder(receiptBuffer, { name: receiptFileName })] : [];
              if (receiptBuffer) logEmbed.setImage(`attachment://${receiptFileName}`);

              await adminCh.send({ embeds: [logEmbed], files: adminFiles });
            }
          } catch (logErr) {
            console.error('[Admin Log Channel Error]:', logErr);
          }
        }
      }
    } catch (err: any) {
      console.error(`[Payout Worker] Order ${orderId} FAILED:`, err.message);

      // Refund user credit upon failure via Unified Central Multi-Bridge
      await UnifiedCreditService.adjustBalance(
        order.discordUserId,
        order.thbAmountDebit,
        `REFUND_ORDER_${orderId}`,
        orderId
      );

      await prisma.exchangeOrder.update({
        where: { id: orderId },
        data: { status: 'FAILED', errorMessage: err.message }
      });

      if (this.discordClient) {

        // 1. Notify user in DM (Private & Confidential)
        try {
          const user = await this.discordClient.users.fetch(order.discordUserId);
          const dmFailEmbed = new EmbedBuilder()
            .setColor(0xff3344)
            .setTitle('⚠️ การโอนเหรียญขัดข้อง — คืนเครดิตเรียบร้อยแล้ว')
            .setDescription(
              `**เรียนคุณ <@${order.discordUserId}> รายการแลกเหรียญไม่สำเร็จ**\n` +
              `──────────────────────────────────────────\n` +
              `• **รหัสออเดอร์:** \`${orderId}\`\n` +
              `• **เหรียญที่ทำรายการ:** \`${order.cryptoAmountOut} ${order.asset.split('_')[0]}\` (${order.network})\n` +
              `• **สาเหตุข้อผิดพลาด:** \`${err.message}\`\n` +
              `• **สถานะการคืนเงิน:** ✅ **คืนเครดิตจำนวน \`${order.thbAmountDebit.toFixed(2)} บาท\` เข้ากระเป๋าของคุณแล้ว**\n` +
              `──────────────────────────────────────────\n` +
              `เครดิตของคุณได้รับการคืนเข้ากระเป๋าเรียบร้อยแล้ว คุณสามารถตรวจสอบยอดเครดิตหรือสั่งทำรายการใหม่อีกครั้ง`
            )
            .setFooter({ text: 'PayomboyZ Automated Crypto Exchange • ข้อความส่วนตัว (DM)' })
            .setTimestamp();
          await user.send({ embeds: [dmFailEmbed] });
        } catch (_) {
          console.warn(`[DM Warning] Could not send DM to user ${order.discordUserId}`);
        }

        // 3. Send Alert Log to Admin Channel (1563930679081697402)
        if (config.discord.adminLogChannelId) {
          try {
            const adminCh = await this.discordClient.channels.fetch(config.discord.adminLogChannelId) as TextChannel;
            if (adminCh && adminCh.isTextBased()) {
              const alertEmbed = new EmbedBuilder()
                .setColor(0xff0044)
                .setTitle('🚨 [PAYOUT FAILED] การโอนเหรียญล้มเหลว (คืนเครดิตแล้ว)')
                .addFields(
                  { name: 'ผู้ใช้', value: `<@${order.discordUserId}> (\`${order.discordUserId}\`)`, inline: true },
                  { name: 'เหรียญ', value: `${order.asset} (${order.network})`, inline: true },
                  { name: 'ยอดเงินบาทที่คืน', value: `\`${order.thbAmountDebit.toFixed(2)} THB\``, inline: true },
                  { name: 'ปลายทาง', value: `\`${order.recipientAddress}\``, inline: false },
                  { name: 'สาเหตุข้อผิดพลาด', value: `\`\`\`\n${err.message}\n\`\`\``, inline: false }
                )
                .setFooter({ text: `Order ID: ${orderId}` })
                .setTimestamp();

              await adminCh.send({ embeds: [alertEmbed] });
            }
          } catch (_) {}
        }
      }
    }
  }
}
