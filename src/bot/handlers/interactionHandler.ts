import {
  Interaction,
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  TextChannel
} from 'discord.js';
import axios from 'axios';
import QRCode from 'qrcode';
import { prisma } from '../../services/db.service.js';
import { RateService } from '../../services/rate.service.js';
import { AddressValidator } from '../../services/addressValidator.service.js';
import { PromptPayService } from '../../services/promptpay.service.js';
import { EasySlipService } from '../../services/easyslip.service.js';
import { SlipProcessorService } from '../../services/slipProcessor.service.js';
import { UnifiedCreditService } from '../../services/unifiedCredit.service.js';
import { QueueService } from '../../services/queue.service.js';
import { ExchangeModal } from '../modals/exchangeModal.js';
import { MainPanel } from '../panels/mainPanel.js';
import { AdminService } from '../../services/admin.service.js';
import { config } from '../../config/index.js';

export class InteractionHandler {
  public static async handleInteraction(interaction: Interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        await this.handleChatInput(interaction);
      } else if (interaction.isButton()) {
        await this.handleButton(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await this.handleSelectMenu(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModal(interaction);
      }
    } catch (err: any) {
      console.error('[Interaction Handler Error]:', err?.message || err);
      try {
        if (interaction.isRepliable()) {
          const msg = `❌ เกิดข้อผิดพลาด: ${err?.message || err}`;
          if (interaction.deferred) {
            await interaction.editReply({ content: msg }).catch(() => {});
          } else if (!interaction.replied) {
            await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
          }
        }
      } catch (_) {}
    }
  }

  private static async handleChatInput(interaction: any) {
    const cmdName = interaction.commandName;

    if (cmdName === 'slip') {
      await interaction.deferReply({ ephemeral: true });
      const attachment = interaction.options.getAttachment('image');

      if (!attachment) {
        await interaction.editReply({ content: '❌ กรุณาแนบไฟล์รูปภาพสลิปโอนเงินด้วยครับ' });
        return;
      }

      if (!attachment.contentType?.startsWith('image/')) {
        await interaction.editReply({ content: '❌ ไฟล์ที่แนบมาไม่ใช่รูปภาพ กรุณาแนบไฟล์รูปภาพ (.jpg, .png, .jpeg, .webp)' });
        return;
      }

      try {
        const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        const result = await SlipProcessorService.processSlip(
          imageBuffer,
          interaction.user.id,
          interaction.user.tag,
          0,
          interaction.client
        );

        if (result.success && result.embed) {
          await interaction.editReply({ embeds: [result.embed] });
        } else {
          await interaction.editReply({ content: `❌ ${result.message}` });
        }
      } catch (err: any) {
        await interaction.editReply({ content: `❌ เกิดข้อผิดพลาดในการดาวน์โหลดหรือตรวจสลิป: ${err.message}` });
      }
      return;
    }

    const subCmd = interaction.options.getSubcommand(false);

    // ── /credit add | /credit-add ────────────────────────────────
    if ((cmdName === 'credit' && subCmd === 'add') || cmdName === 'credit-add') {
      await this.handleCreditAddInteraction(interaction);
      return;
    }

    // ── /credit remove | /remove credit | /credit-remove | /remove-credit ─────
    if (
      (cmdName === 'credit' && subCmd === 'remove') ||
      cmdName === 'credit-remove' ||
      (cmdName === 'remove' && subCmd === 'credit') ||
      cmdName === 'remove-credit'
    ) {
      await this.handleCreditRemoveInteraction(interaction);
      return;
    }

    // ── /credit check | /check-credit ────────────────────────────
    if ((cmdName === 'credit' && subCmd === 'check') || cmdName === 'check-credit') {
      await this.handleCreditCheckInteraction(interaction);
      return;
    }
  }

  private static async handleCreditAddInteraction(interaction: any) {
    await interaction.deferReply({ ephemeral: true });

    const ADMIN_IDS = ['1351000216228331551', '790378344809496656', '1548921066833838080'];
    const isOwnerOrAdmin =
      interaction.memberPermissions?.has('Administrator') ||
      ADMIN_IDS.includes(interaction.user.id) ||
      interaction.guild?.ownerId === interaction.user.id;

    if (!isOwnerOrAdmin) {
      await interaction.editReply({ content: '❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้ (สำหรับแอดมินเท่านั้น)' });
      return;
    }

    const targetRaw =
      interaction.options.getString('target') ||
      interaction.options.getString('discord_id') ||
      interaction.options.getUser('target')?.id ||
      interaction.options.getUser('user')?.id ||
      '';
    const targetId = targetRaw.replace(/[<@!>]/g, '').trim();
    const amount = interaction.options.getNumber('amount', true);
    const reason = interaction.options.getString('reason') || 'Admin manual credit adjustment';

    if (!targetId) {
      await interaction.editReply({ content: '❌ กรุณาระบุผู้ใช้ (@User) หรือ Discord ID' });
      return;
    }

    if (amount <= 0) {
      await interaction.editReply({ content: '❌ จำนวนเงินต้องมากกว่า 0 บาท' });
      return;
    }

    let targetUserTag = 'ลูกค้า';
    try {
      const fetchedUser = await interaction.client.users.fetch(targetId);
      if (fetchedUser) targetUserTag = fetchedUser.tag;
    } catch (_) {}

    try {
      const updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.userCredit.upsert({
          where: { discordUserId: targetId },
          create: {
            discordUserId: targetId,
            discordUsername: targetUserTag,
            balanceThb: amount,
            totalTopupThb: amount
          },
          update: {
            discordUsername: targetUserTag,
            balanceThb: { increment: amount },
            totalTopupThb: { increment: amount }
          }
        });

        await tx.creditTransaction.create({
          data: {
            discordUserId: targetId,
            type: 'ADMIN_ADJUST',
            amountThb: amount,
            balanceBefore: user.balanceThb - amount,
            balanceAfter: user.balanceThb,
            referenceId: `ADMIN_${Date.now()}`,
            note: `Added by ${interaction.user.tag}: ${reason}`
          }
        });

        return user;
      });

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('✅ เพิ่มเครดิตให้ลูกค้าสำเร็จ (Admin Manual Credit)')
        .addFields(
          { name: '👤 ลูกค้า', value: `<@${targetId}>\n(\`${targetId}\`)`, inline: true },
          { name: '💵 ยอดเงินที่เพิ่ม', value: `**\`+${amount.toFixed(2)} บาท\`**`, inline: true },
          { name: '💰 เครดิตคงเหลือใหม่', value: `**\`${updatedUser.balanceThb.toFixed(2)} บาท\`**`, inline: true },
          { name: '📝 เหตุผล', value: `\`${reason}\``, inline: false },
          { name: '👮 แอดมินผู้ดำเนินการ', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setFooter({ text: 'PayomboyZ Crypto Exchange' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      if (config.discord.adminLogChannelId) {
        try {
          const adminCh = await interaction.client.channels.fetch(config.discord.adminLogChannelId);
          if (adminCh?.isTextBased()) {
            await adminCh.send({ embeds: [embed] });
          }
        } catch (_) {}
      }
    } catch (err: any) {
      await interaction.editReply({ content: `❌ บันทึกเครดิตล้มเหลว: ${err.message}` });
    }
  }

  private static async handleCreditRemoveInteraction(interaction: any) {
    await interaction.deferReply({ ephemeral: true });

    const ADMIN_IDS = ['1351000216228331551', '790378344809496656', '1548921066833838080'];
    const isOwnerOrAdmin =
      interaction.memberPermissions?.has('Administrator') ||
      ADMIN_IDS.includes(interaction.user.id) ||
      interaction.guild?.ownerId === interaction.user.id;

    if (!isOwnerOrAdmin) {
      await interaction.editReply({ content: '❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้ (สำหรับแอดมินเท่านั้น)' });
      return;
    }

    const targetRaw =
      interaction.options.getString('target') ||
      interaction.options.getString('discord_id') ||
      interaction.options.getUser('target')?.id ||
      interaction.options.getUser('user')?.id ||
      '';
    const targetId = targetRaw.replace(/[<@!>]/g, '').trim();
    const amount = interaction.options.getNumber('amount', true);
    const reason = interaction.options.getString('reason') || 'Admin manual deduct';

    if (!targetId) {
      await interaction.editReply({ content: '❌ กรุณาระบุผู้ใช้ (@User) หรือ Discord ID' });
      return;
    }

    if (amount <= 0) {
      await interaction.editReply({ content: '❌ จำนวนเงินต้องมากกว่า 0 บาท' });
      return;
    }

    const existingUser = await prisma.userCredit.findUnique({ where: { discordUserId: targetId } });
    if (!existingUser || existingUser.balanceThb < amount) {
      await interaction.editReply({
        content: `❌ ยอดเครดิตของลูกค้าไม่เพียงพอให้หัก (ยอดคงเหลือปัจจุบัน: ${existingUser?.balanceThb?.toFixed(2) || '0.00'} บาท)`
      });
      return;
    }

    try {
      const updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.userCredit.update({
          where: { discordUserId: targetId },
          data: {
            balanceThb: { decrement: amount }
          }
        });

        await tx.creditTransaction.create({
          data: {
            discordUserId: targetId,
            type: 'ADMIN_DEDUCT',
            amountThb: -amount,
            balanceBefore: existingUser.balanceThb,
            balanceAfter: user.balanceThb,
            referenceId: `ADMIN_DEDUCT_${Date.now()}`,
            note: `Deducted by ${interaction.user.tag}: ${reason}`
          }
        });

        return user;
      });

      const embed = new EmbedBuilder()
        .setColor(0xff3366)
        .setTitle('🔻 หักเครดิตลูกค้าสำเร็จ (Admin Manual Deduct)')
        .addFields(
          { name: '👤 ลูกค้า', value: `<@${targetId}>\n(\`${targetId}\`)`, inline: true },
          { name: '💸 ยอดเงินที่หัก', value: `**\`-${amount.toFixed(2)} บาท\`**`, inline: true },
          { name: '💰 เครดิตคงเหลือใหม่', value: `**\`${updatedUser.balanceThb.toFixed(2)} บาท\`**`, inline: true },
          { name: '📝 เหตุผล', value: `\`${reason}\``, inline: false },
          { name: '👮 แอดมินผู้ดำเนินการ', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setFooter({ text: 'PayomboyZ Crypto Exchange' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      if (config.discord.adminLogChannelId) {
        try {
          const adminCh = await interaction.client.channels.fetch(config.discord.adminLogChannelId);
          if (adminCh?.isTextBased()) {
            await adminCh.send({ embeds: [embed] });
          }
        } catch (_) {}
      }
    } catch (err: any) {
      await interaction.editReply({ content: `❌ หักเครดิตล้มเหลว: ${err.message}` });
    }
  }

  private static async handleCreditCheckInteraction(interaction: any) {
    await interaction.deferReply({ ephemeral: true });

    const targetRaw =
      interaction.options.getString('target') ||
      interaction.options.getString('discord_id') ||
      interaction.options.getUser('target')?.id ||
      interaction.options.getUser('user')?.id ||
      interaction.user.id;
    const targetId = targetRaw.replace(/[<@!>]/g, '').trim();

    const user = await prisma.userCredit.findUnique({ where: { discordUserId: targetId } });
    if (!user) {
      await interaction.editReply({
        content: `ℹ️ ไม่พบข้อมูลบัญชีของ <@${targetId}> (\`${targetId}\`) ในระบบ (เครดิตคงเหลือ: 0.00 บาท)`
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00d9ff)
      .setTitle('💰 ข้อมูลกระเป๋าเครดิตลูกค้า (User Credit Info)')
      .addFields(
        { name: '👤 ผู้ใช้', value: `<@${targetId}>\n(\`${targetId}\`)`, inline: true },
        { name: '💵 เครดิตคงเหลือ', value: `**\`${user.balanceThb.toFixed(2)} บาท\`**`, inline: true },
        { name: '📈 ยอดเติมสะสม', value: `\`${user.totalTopupThb.toFixed(2)} บาท\``, inline: true }
      )
      .setFooter({ text: 'PayomboyZ Crypto Exchange' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  private static async handleSelectMenu(interaction: any) {
    const id: string = interaction.customId;

    if (id === 'select_exchange_asset_panel' || id === 'select_exchange_asset') {
      const selectedAsset = interaction.values[0];
      const modal = ExchangeModal.createModal(selectedAsset);
      await interaction.showModal(modal);
      return;
    }
  }

  private static async handleButton(interaction: any) {
    const id: string = interaction.customId;

    if (id === 'btn_refresh_panel') {
      const panelData = await MainPanel.createMainEmbed(interaction.user.id);
      await interaction.update(panelData);
      return;
    }

    if (id === 'btn_topup_credit') {
      const modal = ExchangeModal.createTopupModal();
      await interaction.showModal(modal);
      return;
    }

    // ปุ่มแนบสลิปเติมเงิน (จาก Main Panel)
    if (id === 'btn_topup_attach_slip') {
      const attachEmbed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle('📤 ระบบแนบสลิปเติมเงิน (EasySlip Instant Ingress)')
        .setDescription(
          `**กรุณาเลือกช่องทางในการแนบสลิปเพื่อตรวจสอบยอด:**\n\n` +
          `1️⃣ **ส่งสลิปทางแชทส่วนตัว (DM) [แนะนำที่สุด / ปลอดภัย 100%]**\n` +
          `กดปุ่ม \`[📩 ส่งสลิปทาง DM บอท]\` ด้านล่าง บอทจะส่งข้อความทักไปในแชทส่วนตัวของคุณทันที คุณสามารถลากหรือส่งรูปภาพสลิปใน DM ได้โดยไม่ต้องเปิดเผยข้อมูลธนาคารในเซิร์ฟเวอร์\n\n` +
          `2️⃣ **แนบรูปภาพตรงด้วยคำสั่ง \`/slip\`**\n` +
          `พิมพ์คำสั่ง \`/slip\` ในช่องแชท จะมีช่อง \`image\` ปรากฏขึ้นมาให้เลือกไฟล์รูปสลิปจากมือถือหรือคอมพิวเตอร์ของคุณ ระบบจะตรวจสอบและเพิ่มเครดิตให้อัตโนมัติใน 3 วินาที (เฉพาะคุณเท่านั้นที่เห็น)`
        )
        .setFooter({ text: 'PayomboyZ EasySlip Verification' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_topup_dm_slip')
          .setLabel('ส่งสลิปทาง DM บอท (แนะนำ)')
          .setEmoji('📩')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_guide_slash_slip')
          .setLabel('วิธีใช้คำสั่ง /slip')
          .setEmoji('⌨️')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [attachEmbed], components: [row], ephemeral: true });
      return;
    }

    // ปุ่มเปิดแชทส่วนตัวเพื่อรับสลิป
    if (id === 'btn_topup_dm_slip') {
      try {
        const dmChannel = await interaction.user.createDM();
        await dmChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('📸 แชทส่งสลิปโอนเงิน (PayomboyZ Crypto Exchange)')
              .setDescription(
                `สวัสดีครับคุณ <@${interaction.user.id}>!\n\n` +
                `**กรุณากดแนบรูปภาพสลิปโอนเงินส่งเข้ามาในช่องแชทส่วนตัวนี้ได้เลยครับ**\n` +
                `ระบบ EasySlip จะสแกน QR Code บนสลิปและเพิ่มเครดิตเข้ากระเป๋าของคุณทันทีภายใน 3 วินาที!\n\n` +
                `*(ช่องทางนี้ปลอดภัย 100% สลิปจะไม่ถูกเปิดเผยในเซิร์ฟเวอร์)*`
              )
              .setFooter({ text: 'EasySlip Instant Verification 24/7' })
          ]
        });

        await interaction.reply({
          content: '✅ บอทได้ส่งข้อความทักไปใน **แชทส่วนตัว (DM)** ของคุณเรียบร้อยแล้ว! กรุณาเปิดหน้าแชทกับบอทแล้วส่งรูปภาพสลิปได้เลยครับ',
          ephemeral: true
        });
      } catch (dmErr: any) {
        await interaction.reply({
          content: '⚠️ ไม่สามารถส่งข้อความไปทาง DM ได้ เนื่องจากคุณปิดรับข้อความส่วนตัว (Direct Messages) กรุณาเปิดรับ DM จากสมาชิกในเซิร์ฟเวอร์ หรือใช้คำสั่ง `/slip` เพื่อแนบรูปสลิปโดยตรงได้เลยครับ',
          ephemeral: true
        });
      }
      return;
    }

    // คำแนะนำการใช้คำสั่ง /slip
    if (id === 'btn_guide_slash_slip') {
      await interaction.reply({
        content:
          `📌 **วิธีแนบสลิปผ่านคำสั่ง \`/slip\`:**\n` +
          `1. พิมพ์คำสั่ง \`/slip\` ในช่องแชทของเซิร์ฟเวอร์\n` +
          `2. จะมีช่อง \`image\` ปรากฏขึ้นมา ให้กดเลือกไฟล์รูปภาพสลิปจากมือถือหรือคอมพิวเตอร์ของคุณ\n` +
          `3. กด Enter ส่งคำสั่งได้ทันที ระบบจะตรวจสอบและเพิ่มเครดิตให้อัตโนมัติใน 3 วินาที (คำสั่งนี้จะเห็นเฉพาะคุณเท่านั้น ไม่มีใครในห้องเห็นสลิปของคุณ)`,
        ephemeral: true
      });
      return;
    }

    // Quick Coin Button: btn_asset_{assetId} (e.g. btn_asset_USDT_BEP20)
    if (id.startsWith('btn_asset_')) {
      const asset = id.replace('btn_asset_', '');
      const modal = ExchangeModal.createModal(asset);
      await interaction.showModal(modal);
      return;
    }

    if (id === 'btn_open_exchange') {
      const balance = await UnifiedCreditService.getBalance(interaction.user.id);
      const selectorData = ExchangeModal.createAssetSelector(balance);
      await interaction.reply({ ...selectorData, ephemeral: true });
      return;
    }

    if (id === 'btn_view_history') {
      await interaction.deferReply({ ephemeral: true });
      const orders = await prisma.exchangeOrder.findMany({
        where: { discordUserId: interaction.user.id },
        orderBy: { createdAt: 'desc' },
        take: 5
      });

      if (orders.length === 0) {
        await interaction.editReply({ content: '📜 คุณยังไม่มีประวัติการแลกเหรียญคริปโตในระบบ' });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00f0ff)
        .setTitle('📜 ประวัติการแลกคริปโต 5 รายการล่าสุด')
        .setDescription(
          orders
            .map((o, idx) => {
              const statusEmoji = o.status === 'COMPLETED' ? '✅' : o.status === 'FAILED' ? '❌' : '⏳';
              const link = o.explorerUrl ? `[ดูบนบล็อกเชน](${o.explorerUrl})` : 'กำลังประมวลผล';
              return `**${idx + 1}. ${statusEmoji} ${o.asset}**\n• จำนวน: \`${o.cryptoAmountOut} ${o.asset.split('_')[0]}\` (${o.thbAmountDebit} บาท)\n• สถานะ: \`${o.status}\` • ${link}\n• เวลา: <t:${Math.floor(o.createdAt.getTime() / 1000)}:R>`;
            })
            .join('\n\n')
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Dismiss Receipt / Notification Button: btn_dismiss_receipt_{targetUserId}
    if (id.startsWith('btn_dismiss_receipt_')) {
      const targetUserId = id.replace('btn_dismiss_receipt_', '');
      const isOwner = interaction.user.id === targetUserId;
      const isAdmin = interaction.memberPermissions?.has('Administrator');
      if (!isOwner && !isAdmin) {
        await interaction.reply({
          content: '⚠️ คุณไม่ใช่เจ้าของออเดอร์นี้ ไม่สามารถปิดข้อความนี้ได้',
          ephemeral: true
        });
        return;
      }
      try {
        await interaction.message.delete();
      } catch (_) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '✅ ปิดข้อความเรียบร้อยแล้ว', ephemeral: true });
        }
      }
      return;
    }

    // Owner Executive Dashboard Refresh: btn_owner_refresh_history
    if (id === 'btn_owner_refresh_history') {
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({ content: '⚠️ เฉพาะผู้ดูแลระบบ (Owner/Admin) เท่านั้นที่เข้าถึงได้', ephemeral: true });
        return;
      }
      const dashboardData = await AdminService.createExecutiveDashboard();
      await interaction.update(dashboardData);
      return;
    }

    // Owner Check Wallets Details: btn_owner_check_wallets
    if (id === 'btn_owner_check_wallets') {
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({ content: '⚠️ เฉพาะผู้ดูแลระบบ (Owner/Admin) เท่านั้นที่เข้าถึงได้', ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const { EvmHotWallet } = await import('../../wallets/evm/evm.wallet.js');
        const [bscBal, polyBal] = await Promise.all([
          EvmHotWallet.getWalletBalance('BSC'),
          EvmHotWallet.getWalletBalance('POLYGON')
        ]);
        const walletEmbed = new EmbedBuilder()
          .setColor(0x00f0ff)
          .setTitle('🏦 ข้อมูลกระเป๋า Hot Wallet ละเอียด')
          .addFields(
            {
              name: '🟡 Binance Smart Chain (BSC)',
              value: `• Address: \`${bscBal.address}\`\n• Gas Balance: \`${bscBal.nativeBalance} BNB\`\n• USDT Balance: \`${bscBal.usdtBalance} USDT\``,
              inline: false
            },
            {
              name: '🟣 Polygon Network',
              value: `• Address: \`${polyBal.address}\`\n• Gas Balance: \`${polyBal.nativeBalance} POL\`\n• USDT Balance: \`${polyBal.usdtBalance} USDT\``,
              inline: false
            },
            {
              name: '🛡️ Remote Isolated Signing Vault',
              value: `• Endpoint: \`${config.vault.url}\`\n• Status: \`${config.vault.enabled ? 'ONLINE & ACTIVE' : 'DISABLED'}\``,
              inline: false
            }
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [walletEmbed] });
      } catch (err: any) {
        await interaction.editReply({ content: `❌ ตรวจสอบกระเป๋าล้มเหลว: ${err.message}` });
      }
      return;
    }

    // --- 3-STEP CONFIRMATION GATE BUTTON HANDLERS ---

    // Cancel Button: btn_cancel_{orderId}
    if (id.startsWith('btn_cancel_')) {
      const orderId = id.replace('btn_cancel_', '');
      await prisma.exchangeOrder.updateMany({
        where: { id: orderId, status: { in: ['PENDING_STEP1_ADDRESS', 'PENDING_STEP2_AMOUNT', 'PENDING_STEP3_FINAL', 'PENDING_RATE_CONFIRM'] } },
        data: { status: 'CANCELLED' }
      });
      await interaction.update({
        content: '❌ **ยกเลิกรายการเรียบร้อยแล้ว** ไม่มีการหักเครดิตใดๆ ทั้งสิ้น',
        embeds: [],
        components: []
      });
      return;
    }

    // Step 1 Confirm -> Proceed to Step 2 (Amount & Live Rate Verification)
    if (id.startsWith('btn_step1_')) {
      const orderId = id.replace('btn_step1_', '');
      const order = await prisma.exchangeOrder.findUnique({ where: { id: orderId } });
      if (!order || order.status !== 'PENDING_STEP1_ADDRESS') {
        await interaction.update({ content: '❌ คำสั่งนี้หมดอายุหรือไม่ถูกต้อง กรุณากดทำรายการใหม่', embeds: [], components: [] });
        return;
      }

      // ตรวจสอบเวลา 3 นาที
      const diffMins = (Date.now() - order.createdAt.getTime()) / (1000 * 60);
      if (diffMins > 3) {
        await prisma.exchangeOrder.update({ where: { id: orderId }, data: { status: 'EXPIRED' } });
        await interaction.update({ content: '⚠️ เรทราคาหมดอายุแล้ว (เกิน 3 นาที) กรุณาทำรายการใหม่', embeds: [], components: [] });
        return;
      }

      await prisma.exchangeOrder.update({
        where: { id: orderId },
        data: { status: 'PENDING_STEP2_AMOUNT' }
      });

      const step2Embed = new EmbedBuilder()
        .setColor(0x00d9ff)
        .setTitle('⚖️ ขั้นตอนที่ 2/3: ทวนยอดเงินและเรทแลกเปลี่ยน (Amount & Rate Review)')
        .setDescription(
          `**กรุณาตรวจสอบยอดเงินและเรทราคาก่อนดำเนินการ**\n` +
          `• เหรียญที่เลือก: **\`${order.asset}\`** (${order.network})\n` +
          `──────────────────────────────────────────`
        )
        .addFields(
          {
            name: '🪙 จำนวนเหรียญคริปโตที่จะโอนปลายทาง (Amount Out)',
            value: `🚀 **\`${order.cryptoAmountOut} ${order.asset.split('_')[0]}\`**`,
            inline: false
          },
          { name: '💵 ยอดเงินบาทที่หักจากเครดิต', value: `\`${order.thbAmountDebit.toFixed(2)} บาท\``, inline: true },
          { name: '⛽ ค่าธรรมเนียมเน็ตเวิร์ก (Gas)', value: `\`${order.networkFeeThb.toFixed(2)} บาท\``, inline: true },
          { name: '💰 ยอดบาทสำหรับค่าเหรียญ', value: `\`${order.netThbAmount.toFixed(2)} บาท\``, inline: true },
          { name: '📊 ราคาตลาดปัจจุบัน', value: `\`${order.marketRate.toFixed(2)} บาท\` / 1 ${order.asset.split('_')[0]}`, inline: true },
          { name: '🏷️ เรทแลกเปลี่ยนสุทธิ', value: `**\`${order.effectiveRate.toFixed(2)} บาท\`** / 1 ${order.asset.split('_')[0]}`, inline: true }
        )
        .setFooter({ text: 'กด [ยอดถูกต้อง] เพื่อไปยังขั้นตอนสุดท้ายสรุปคำสั่งโอน' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_step2_${order.id}`)
          .setLabel('💵 ยอดถูกต้อง (ยืนยันขั้นที่ 2/3)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`btn_cancel_${order.id}`)
          .setLabel('❌ ยกเลิก')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.update({ embeds: [step2Embed], components: [row], files: [] });
      return;
    }

    // Step 2 Confirm -> Proceed to Step 3 (Final Gate Review)
    if (id.startsWith('btn_step2_')) {
      const orderId = id.replace('btn_step2_', '');
      const order = await prisma.exchangeOrder.findUnique({ where: { id: orderId } });
      if (!order || order.status !== 'PENDING_STEP2_AMOUNT') {
        await interaction.update({ content: '❌ คำสั่งนี้หมดอายุหรือไม่ถูกต้อง กรุณากดทำรายการใหม่', embeds: [], components: [] });
        return;
      }

      await prisma.exchangeOrder.update({
        where: { id: orderId },
        data: { status: 'PENDING_STEP3_FINAL' }
      });

      const step3Embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('⚠️ ขั้นตอนที่ 3/3: สรุปบิลภาพรวมและยืนยันโอนเหรียญ (Final Gate)')
        .setDescription(
          `**กรุณาตรวจสอบความถูกต้องรอบสุดท้าย**\n` +
          `──────────────────────────────────────────\n` +
          `• 🪙 **เหรียญที่จะโอน:** \`${order.cryptoAmountOut} ${order.asset.split('_')[0]}\` (${order.network})\n` +
          `• 📥 **กระเป๋าปลายทาง:** \`${order.recipientAddress}\`\n` +
          `• 💵 **ยอดเงินบาทที่หักจากเครดิต:** \`${order.thbAmountDebit.toFixed(2)} บาท\`\n` +
          `──────────────────────────────────────────\n` +
          `⚠️ **คำเตือนความปลอดภัยสูงสุด (Irreversible Operation):**\n` +
          `การโอนเหรียญบล็อกเชนไม่สามารถยกเลิกหรือดึงเงินกลับคืนได้ หากคุณระบุ Address หรือ Chain ผิดพลาด เหรียญจะสูญหายทันที`
        )
        .setFooter({ text: 'เมื่อกดยืนยัน ระบบจะตัดเครดิตและยิงธุรกรรมสู่บล็อกเชนทันที' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_confirm_final_${order.id}`)
          .setLabel('🚀 ยืนยันโอนเหรียญทันที (Final Confirm)')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`btn_cancel_${order.id}`)
          .setLabel('❌ ยกเลิก')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ embeds: [step3Embed], components: [row] });
      return;
    }

    // Final Confirm: Execute Order Payout
    if (id.startsWith('btn_confirm_final_') || id.startsWith('btn_confirm_')) {
      const orderId = id.replace('btn_confirm_final_', '').replace('btn_confirm_', '');
      await this.executeExchangeOrder(interaction, orderId);
      return;
    }
  }

  private static async handleModal(interaction: any) {
    const id = interaction.customId;

    if (id === 'modal_topup_submit') {
      await interaction.deferReply({ ephemeral: true });
      const rawAmount = interaction.fields.getTextInputValue('input_topup_amount');
      const amount = parseFloat(rawAmount);

      if (isNaN(amount) || amount <= 0) {
        await interaction.editReply({ content: '❌ กรุณาระบุจำนวนเงินที่ถูกต้อง (เช่น 50, 100, 500)' });
        return;
      }

      const qrBuffer = await PromptPayService.generateQrBuffer(amount);
      const attachment = new AttachmentBuilder(qrBuffer, { name: 'promptpay_qr.png' });

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle(`💰 สแกน QR Code เติมเงิน ${amount.toFixed(2)} บาท`)
        .setDescription(
          `**กรุณาสแกน QR Code ด้านล่างเพื่อโอนเงินเข้าระบบ**\n` +
          `• บัญชีผู้รับ: **${config.bank.accountName}** (${config.bank.name})\n` +
          `• ยอดเงิน: **${amount.toFixed(2)} บาท** (ตรงตามยอดเป๊ะๆ)\n\n` +
          `──────────────────────────────────────────\n` +
          `**เมื่อโอนเงินเสร็จแล้ว เลือกแนบสลิปได้ 2 วิธีทันที:**\n` +
          `1️⃣ **ส่งสลิปทางแชท DM บอท (แนะนำ / เป็นส่วนตัว 100%)**\n` +
          `กดปุ่ม \`[📩 ส่งสลิปทาง DM บอท]\` ด้านล่าง บอทจะเปิดห้องแชทส่วนตัวให้ส่งรูปภาพได้ทันที ปลอดภัย ข้อมูลไม่หลุดในเซิร์ฟเวอร์\n\n` +
          `2️⃣ **แนบรูปภาพด้วยคำสั่ง \`/slip\`**\n` +
          `พิมพ์คำสั่ง \`/slip\` ในช่องแชท แล้วเลือกไฟล์รูปสลิปจากเครื่องส่งตรวจสอบอัตโนมัติ (เฉพาะคุณเท่านั้นที่เห็น)`
        )
        .setImage('attachment://promptpay_qr.png')
        .setFooter({ text: 'EasySlip ตรวจสอบสลิปอัตโนมัติ 24 ชม.' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_topup_dm_slip')
          .setLabel('ส่งสลิปทาง DM บอท (แนะนำ)')
          .setEmoji('📩')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_guide_slash_slip')
          .setLabel('วิธีใช้คำสั่ง /slip แนบไฟล์')
          .setEmoji('📤')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [row], files: [attachment] });
      return;
    }

    if (id === 'modal_exchange_submit' || id.startsWith('modal_exchange_')) {
      await interaction.deferReply({ ephemeral: true });
      let asset = '';
      if (id.startsWith('modal_exchange_') && id !== 'modal_exchange_submit') {
        asset = id.replace('modal_exchange_', '').trim().toUpperCase();
      } else {
        asset = interaction.fields.getTextInputValue('input_asset').trim().toUpperCase();
      }
      const address = interaction.fields.getTextInputValue('input_address').trim();
      const rawInput = interaction.fields.getTextInputValue('input_amount').trim().toLowerCase();
      const symbol = asset.split('_')[0];

      // 1. ตรวจสอบความถูกต้องของ Address ตาม Cryptographic Specification
      const validation = AddressValidator.validate(asset, address);
      if (!validation.isValid) {
        await interaction.editReply({ content: `❌ ${validation.error}` });
        return;
      }

      // 2. ดึงเรทสดจาก Bitkub/Binance โดยตรง (Real-time check before calculation)
      const quote = await RateService.getQuote(asset, true);
      let payoutCalc;

      // Smart Parsing: ตรวจจับว่าผู้ใช้ระบุเป็นเงินบาท หรือยอดเหรียญคริปโตตรงๆ
      if (rawInput.includes('บาท') || rawInput.includes('thb') || rawInput.includes('฿') || rawInput.endsWith('b')) {
        const cleanThb = parseFloat(rawInput.replace(/[^0-9.]/g, ''));
        if (isNaN(cleanThb) || cleanThb <= 0) {
          await interaction.editReply({ content: '❌ จำนวนเงินบาทไม่ถูกต้อง กรุณากรอกเป็นตัวเลข' });
          return;
        }
        payoutCalc = RateService.calculatePayout(cleanThb, quote);
      } else {
        // Default mode: ลูกค้าระบุยอดเหรียญคริปโตที่ต้องการให้โอนตรงๆ (e.g. 5 USDT, 0.05 LTC)
        const cleanCrypto = parseFloat(rawInput.replace(/[^0-9.]/g, ''));
        if (isNaN(cleanCrypto) || cleanCrypto <= 0) {
          await interaction.editReply({
            content: `❌ จำนวนเหรียญ ${symbol} ไม่ถูกต้อง กรุณากรอกเป็นตัวเลข (เช่น 5 หรือ 0.05)`
          });
          return;
        }
        payoutCalc = RateService.calculateDebitFromCrypto(cleanCrypto, quote);
      }

      // 3. ตรวจสอบยอดขั้นต่ำในการถอนของแต่ละเครือข่าย (Binance Network Limits)
      let minWithdraw = 0;
      if (asset.includes('BEP20')) minWithdraw = 5;
      else if (asset.includes('TRC20')) minWithdraw = 5;
      else if (asset.includes('POLYGON')) minWithdraw = 3;
      else if (asset === 'LTC') minWithdraw = 0.002;

      if (minWithdraw > 0 && payoutCalc.cryptoAmount < minWithdraw) {
        await interaction.editReply({
          content: `⚠️ ยอดเหรียญต่ำกว่าขั้นต่ำของเครือข่าย: ขั้นต่ำในการโอนสำหรับ **${asset}** คือ **\`${minWithdraw} ${symbol}\`** (คุณระบุ: \`${payoutCalc.cryptoAmount} ${symbol}\`)`
        });
        return;
      }

      // 4. ตรวจสอบเครดิตผู้ใช้แบบ Real-time จาก Central Unified SSOT
      const balance = await UnifiedCreditService.getBalance(interaction.user.id);

      if (balance < payoutCalc.thbAmount) {
        await interaction.editReply({
          content:
            `⚠️ **เครดิตของคุณไม่เพียงพอสำหรับการโอนเหรียญจำนวนนี้**\n` +
            `• 🪙 เหรียญที่ต้องการโอน: **\`${payoutCalc.cryptoAmount} ${symbol}\`**\n` +
            `• 💵 ยอดเงินบาทที่ต้องใช้ (รวมค่าเน็ตเวิร์ก ${payoutCalc.networkFeeThb.toFixed(2)} บ.): **\`${payoutCalc.thbAmount.toFixed(2)} บาท\`**\n` +
            `• 💰 เครดิตคงเหลือปัจจุบัน: \`${balance.toFixed(2)} บาท\` (ขาดอีก \`${(payoutCalc.thbAmount - balance).toFixed(2)} บาท\`)\n\n` +
            `กรุณากดปุ่ม **[💰 เติมเครดิต]** บนหน้าแรกเพื่อเติมเงินก่อนทำรายการ!`
        });
        return;
      }

      // 5. สร้าง QR Code สำหรับตรวจสอบ Address ปลายทาง
      const qrBuffer = await QRCode.toBuffer(address, {
        type: 'png',
        width: 280,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      const qrAttachment = new AttachmentBuilder(qrBuffer, { name: 'dest_address_qr.png' });

      // 6. บันทึก Draft Order ลง DB (Status: PENDING_STEP1_ADDRESS)
      const network = asset.includes('BEP20') ? 'BSC' : asset.includes('TRC20') ? 'TRON' : asset.includes('POLYGON') ? 'POLYGON' : 'LITECOIN';

      // Guard: block if user already has an active payout in-flight
      const activeOrder = await prisma.exchangeOrder.findFirst({
        where: {
          discordUserId: interaction.user.id,
          status: { in: ['QUEUED_FOR_PAYOUT', 'PROCESSING_PAYOUT'] }
        }
      });
      if (activeOrder) {
        await interaction.editReply({
          content: `⚠️ **คำสั่งโอนของคุณกำลังอยู่ระหว่างประมวลผล (Order \`${activeOrder.id.slice(0, 8)}\`)** กรุณารอให้รายการก่อนหน้าเสร็จก่อนสั่งใหม่ บอทจะแจ้งผลเข้า DM ทันทีเมื่อโอนสำเร็จ`
        });
        return;
      }

      // Auto-expire zombie PENDING orders from this user older than 5 min
      await prisma.exchangeOrder.updateMany({
        where: {
          discordUserId: interaction.user.id,
          status: { in: ['PENDING_STEP1_ADDRESS', 'PENDING_STEP2_AMOUNT', 'PENDING_STEP3_FINAL', 'PENDING_RATE_CONFIRM'] },
          createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }
        },
        data: { status: 'EXPIRED' }
      });

      const order = await prisma.exchangeOrder.create({
        data: {
          discordUserId: interaction.user.id,
          asset,
          network,
          recipientAddress: address,
          thbAmountDebit: payoutCalc.thbAmount,
          networkFeeThb: payoutCalc.networkFeeThb,
          netThbAmount: payoutCalc.netThb,
          marketRate: quote.marketPriceThb,
          appliedSpreadPct: quote.spreadPct,
          effectiveRate: payoutCalc.effectiveRate,
          cryptoAmountOut: payoutCalc.cryptoAmount,
          status: 'PENDING_STEP1_ADDRESS'
        }
      });

      // 7. ส่ง Confirmation Step 1/3: ทวน Address ปลายทาง พร้อม QR Code
      const step1Embed = new EmbedBuilder()
        .setColor(0x00f0ff)
        .setTitle('🔍 ขั้นตอนที่ 1/3: ทวน Address และยอดเหรียญปลายทาง (Verification)')
        .setDescription(
          `**กรุณาตรวจสอบ Address กระเป๋าและยอดเหรียญของคุณอย่างละเอียด**\n` +
          `• 🪙 **ยอดเหรียญที่จะโอน:** **\`${payoutCalc.cryptoAmount} ${symbol}\`** (เครือข่าย: **\`${network}\`**)\n` +
          `• 💵 **ยอดบาทที่หักจากเครดิต:** \`${payoutCalc.thbAmount.toFixed(2)} บาท\` (รวมค่าเน็ตเวิร์ก \`${payoutCalc.networkFeeThb.toFixed(2)} บาท\`)\n` +
          `• 📥 **ที่อยู่ปลายทาง:** \n\`\`\`\n${address}\n\`\`\`\n` +
          `คุณสามารถใช้โทรศัพท์มือถือหรือแอพ Wallet สแกน QR Code ด้านล่างเพื่อตรวจสอบว่าตรงกับกระเป๋าของคุณทุกตัวอักษร`
        )
        .setImage('attachment://dest_address_qr.png')
        .setFooter({ text: 'ตรวจสอบให้ตรงกันทุกตัวอักษร แล้วกดปุ่มยืนยันขั้นที่ 1 ด้านล่าง' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_step1_${order.id}`)
          .setLabel('✅ ที่อยู่ถูกต้อง (ยืนยันขั้นที่ 1/3)')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`btn_cancel_${order.id}`)
          .setLabel('❌ ยกเลิก')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [step1Embed], components: [row], files: [qrAttachment] });
    }
  }

  private static async executeExchangeOrder(interaction: any, orderId: string) {
    const order = await prisma.exchangeOrder.findUnique({
      where: { id: orderId }
    });

    if (!order || (order.status !== 'PENDING_STEP3_FINAL' && order.status !== 'PENDING_RATE_CONFIRM')) {
      await interaction.update({ content: '❌ คำสั่งแลกนี้หมดอายุหรือไม่ถูกต้อง กรุณาทำรายการใหม่', embeds: [], components: [] });
      return;
    }

    // ตรวจสอบเวลาล็อกเรท 3 นาที
    const diffMins = (Date.now() - order.createdAt.getTime()) / (1000 * 60);
    if (diffMins > 3) {
      await prisma.exchangeOrder.update({
        where: { id: orderId },
        data: { status: 'EXPIRED' }
      });
      await interaction.update({ content: '⚠️ เรทราคาหมดอายุแล้ว (เกิน 3 นาที) กรุณากดแลกเหรียญใหม่อีกครั้ง', embeds: [], components: [] });
      return;
    }

    // หักยอดเงินแบบ Unified Real-time Atomic Multi-Bridge Adjustment (Central SSOT)
    try {
      const debitResult = await UnifiedCreditService.adjustBalance(
        interaction.user.id,
        -order.thbAmountDebit,
        `CRYPTO_EXCHANGE_DEBIT_${order.id}`,
        order.id,
        interaction.user.username
      );

      if (!debitResult.success) {
        await interaction.update({
          content: `⚠️ เครดิตคงเหลือของคุณไม่เพียงพอ (ต้องการ \`${order.thbAmountDebit.toFixed(2)} บาท\` แต่ระบบตรวจพบคงเหลือ \`${debitResult.newBalance.toFixed(2)} บาท\`) กรุณาเติมเครดิตก่อน!`,
          embeds: [],
          components: []
        });
        return;
      }

      await prisma.exchangeOrder.update({
        where: { id: order.id },
        data: { status: 'QUEUED_FOR_PAYOUT' }
      });

      // ส่งงานเข้าคิวประมวลผลทันที
      await QueueService.enqueuePayout(order.id);

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('🚀 ธุรกรรมได้รับการยืนยันและส่งเข้าคิวโอนเหรียญแล้ว!')
        .setDescription(
          `**ระบบตัดเครดิตและนำรายการเข้าสู่คิวโอนเหรียญทันที**\n` +
          `• รหัสออเดอร์: \`${order.id}\`\n` +
          `• เหรียญที่จะได้รับ: **\`${order.cryptoAmountOut} ${order.asset.split('_')[0]}\`**\n` +
          `• กระเป๋าผู้รับ: \`${order.recipientAddress}\`\n\n` +
          `เมื่อระบบสร้าง TxID บนบล็อกเชนสำเร็จ บอทจะส่งข้อความแจ้งเตือนพร้อมลิงก์ Block Explorer ให้คุณทันที!`
        )
        .setFooter({ text: 'PayomboyZ Crypto Exchange' })
        .setTimestamp();

      await interaction.update({ embeds: [successEmbed], components: [] });
    } catch (err: any) {
      await interaction.update({ content: `❌ ดำเนินการล้มเหลว: ${err.message}`, embeds: [], components: [] });
    }
  }

  public static async handleIncomingMessage(message: Message) {
    if (message.author.bot) return;

    // ตรวจสอบว่ามีไฟล์แนบรูปภาพส่งเข้ามาหรือไม่
    if (message.attachments.size === 0) return;

    const attachment = message.attachments.first();
    if (!attachment || !attachment.contentType?.startsWith('image/')) return;

    const isGuild = !!message.guild;

    // หากส่งในช่องสาธารณะ ให้ลบรูปสลิปทันทีเพื่อป้องกันข้อมูลการเงินส่วนตัวรั่วไหล
    if (isGuild) {
      await message.delete().catch(() => {});
    }

    // ตรวจสอบสลิปโอนเงินผ่าน SlipProcessorService
    try {
      let waitMsg: Message | null = null;
      if (!isGuild) {
        waitMsg = await message.reply('🔍 กำลังตรวจสอบสลิปโอนเงินผ่าน EasySlip API...');
      }

      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      const result = await SlipProcessorService.processSlip(
        imageBuffer,
        message.author.id,
        message.author.tag,
        0,
        message.client
      );

      if (isGuild) {
        // ส่งผลลัพธ์เข้า DM ของลูกค้าแบบส่วนตัว 100%
        try {
          if (result.success && result.embed) {
            await message.author.send({
              content: '🔒 **(ข้อความส่วนตัว)** ระบบตรวจพบสลิปที่คุณส่งในเซิร์ฟเวอร์ บอทได้ทำการลบรูปภาพออกจากห้องสาธารณะเพื่อความปลอดภัย และเติมเครดิตให้คุณเรียบร้อยแล้ว:',
              embeds: [result.embed]
            });
          } else {
            await message.author.send({
              content: `🔒 **(ข้อความส่วนตัว)** สลิปที่คุณส่งไม่สามารถตรวจสอบได้: ${result.message}\n*(บอทได้ลบรูปภาพออกจากห้องสาธารณะเพื่อความปลอดภัยแล้ว)*`
            });
          }
        } catch (_) {
          console.warn(`[Slip DM Warning] Could not DM user ${message.author.id}`);
        }
      } else {
        // ตอบกลับใน DM ปกติ
        if (result.success && result.embed) {
          if (waitMsg) await waitMsg.edit({ content: null, embeds: [result.embed] });
        } else {
          if (waitMsg) await waitMsg.edit(`❌ ไม่สามารถตรวจสอบสลิปได้: ${result.message}`);
        }
      }
    } catch (err: any) {
      console.error('[Slip Processing Error]:', err?.message || err);
    }
  }
}
