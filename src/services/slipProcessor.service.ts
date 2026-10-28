import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { EasySlipService } from './easyslip.service.js';
import { prisma } from './db.service.js';
import { UnifiedCreditService } from './unifiedCredit.service.js';
import { config } from '../config/index.js';

export interface ProcessSlipResult {
  success: boolean;
  message: string;
  embed?: EmbedBuilder;
  amount?: number;
  newBalance?: number;
  transRef?: string;
}

export class SlipProcessorService {
  /**
   * Process and verify slip image buffer from any ingress channel (Slash Command / DM / Channel)
   */
  public static async processSlip(
    imageBuffer: Buffer,
    discordUserId: string,
    discordUsername: string,
    expectedAmountThb: number = 0,
    client?: Client
  ): Promise<ProcessSlipResult> {
    try {
      // 1. ตรวจสอบผ่าน EasySlip Engine
      const verifyResult = await EasySlipService.verifySlipImage(imageBuffer, expectedAmountThb, discordUserId);

      if (!verifyResult.success || !verifyResult.rawPayload) {
        return {
          success: false,
          message: verifyResult.error || 'ไม่สามารถตรวจสอบสลิปได้ (รูปภาพอาจไม่ชัดหรือไม่พบ QR Code)'
        };
      }

      const slip = verifyResult.rawPayload;
      const transRef = String(verifyResult.transRef || slip.transRef || slip.payload || '').trim();
      const slipAmount = verifyResult.amount || parseFloat(slip.amount?.amount || '0');
      const receiverAcc = String(slip.receiver?.account?.bank?.account || slip.receiver?.proxy?.value || '').replace(/\D/g, '');

      // 2. บันทึกสลิปและเพิ่มยอดเครดิตแบบ Atomic Database Transaction
      const updatedUser = await prisma.$transaction(async (tx) => {
        await tx.verifiedSlip.create({
          data: {
            transRef,
            discordUserId,
            senderName: verifyResult.senderName || slip.sender?.account?.name?.th || 'ลูกค้า',
            senderAccount: slip.sender?.account?.bank?.account || '',
            senderBank: verifyResult.senderBank || slip.sender?.bank?.name || '',
            receiverAccount: receiverAcc,
            amountThb: slipAmount,
            slipDate: verifyResult.slipDate || new Date(slip.date),
            rawPayload: JSON.stringify(slip)
          }
        });
      });

      // 2.1 Multi-Bridge Synchronous Credit Adjustment (PostgreSQL + All Platforms)
      const syncResult = await UnifiedCreditService.adjustBalance(
        discordUserId,
        slipAmount,
        `TOPUP_SLIP_${transRef}`,
        transRef,
        discordUsername
      );

      const finalBalance = syncResult.newBalance;

      // 3. สร้าง Success Embed สไตล์ Luxury Obsidian-Gold
      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('🎉 เติมเครดิตสำเร็จเรียบร้อยแล้ว!')
        .setDescription(
          `**ระบบทำการตรวจสอบสลิปผ่าน EasySlip สำเร็จ 100%**\n` +
          `• รหัสธุรกรรม (transRef): \`${transRef}\`\n` +
          `• ผู้โอน: **${verifyResult.senderName || 'ลูกค้า'}** (${verifyResult.senderBank || 'ธนาคาร'})\n` +
          `• บัญชีผู้รับ: **${config.bank.accountName}** (${config.bank.name})\n` +
          `• จำนวนเงินที่เติม: **\`+${slipAmount.toFixed(2)} บาท\`**\n` +
          `• เครดิตคงเหลือปัจจุบัน: **\`${finalBalance.toFixed(2)} บาท\`**\n\n` +
          `คุณสามารถเลือกเหรียญบนแผงเมนูเพื่อกดแลกเหรียญคริปโตได้ทันที!`
        )
        .setFooter({ text: 'PayomboyZ Crypto Exchange • EasySlip Instant Ingress' })
        .setTimestamp();

      // 4. บันทึก Audit Log เข้าห้อง Admin Channel
      if (config.discord.adminLogChannelId && client) {
        try {
          const adminCh = await client.channels.fetch(config.discord.adminLogChannelId) as TextChannel;
          if (adminCh && adminCh.isTextBased()) {
            const topupLogEmbed = new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('💳 [TOPUP AUDIT LOG] เติมเครดิตผ่าน EasySlip สำเร็จ')
              .addFields(
                { name: '👤 ผู้ใช้', value: `<@${discordUserId}>\n(\`${discordUserId}\`)`, inline: true },
                { name: '💵 ยอดเงินที่เติม', value: `**\`+${slipAmount.toFixed(2)} บาท\`**`, inline: true },
                { name: '💰 เครดิตคงเหลือ', value: `\`${finalBalance.toFixed(2)} บาท\``, inline: true },
                { name: '🏦 ผู้โอน', value: `${verifyResult.senderBank || 'ธนาคาร'} (${verifyResult.senderName || 'ลูกค้า'})`, inline: false },
                { name: '🏢 บัญชีปลายทาง', value: `\`${receiverAcc}\` (${config.bank.accountName})`, inline: true },
                { name: '🔢 รหัสธุรกรรม (transRef)', value: `\`${transRef}\``, inline: true }
              )
              .setFooter({ text: 'PayomboyZ Fiat Audit Ledger' })
              .setTimestamp();

            await adminCh.send({ embeds: [topupLogEmbed] });
          }
        } catch (logErr) {
          console.error('[Topup Admin Log Error]:', logErr);
        }
      }

      return {
        success: true,
        message: 'เติมเครดิตสำเร็จเรียบร้อยแล้ว!',
        embed: successEmbed,
        amount: slipAmount,
        newBalance: finalBalance,
        transRef
      };
    } catch (err: any) {
      console.error('[Slip Processor Error]:', err?.message || err);
      return {
        success: false,
        message: err.message || 'เกิดข้อผิดพลาดในการประมวลผลสลิป'
      };
    }
  }
}
