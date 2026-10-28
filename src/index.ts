import http from 'http';
import { Client, GatewayIntentBits, Partials, TextChannel } from 'discord.js';
import { config } from './config/index.js';
import { initDatabase } from './services/db.service.js';
import { QueueService } from './services/queue.service.js';
import { InteractionHandler } from './bot/handlers/interactionHandler.js';
import { MainPanel } from './bot/panels/mainPanel.js';
import { deploySlashCommands } from './bot/commands/register.js';

// HTTP Health Check Server for Render / Cloud deployment
const PORT = process.env.PORT || 3000;
const healthServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    service: 'payomboyz-crypto-exchange',
    time: new Date().toISOString()
  }));
});
healthServer.listen(PORT, () => {
  console.log(`[HTTP] Cloud health check listening on port ${PORT}`);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[Global Unhandled Rejection]:', (reason as any)?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Global Uncaught Exception]:', err?.message || err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user?.tag} (ID: ${client.user?.id})`);
  MainPanel.setClient(client);
  await initDatabase();
  await QueueService.init();
  QueueService.setDiscordClient(client);

  // Slash commands are centrally managed by PAYOMBØYZ Shop Bot (4_shop_bot)
  // await deploySlashCommands(client);

  // Background FIFO Queue Watcher (Dual-engine: processes both immediate and pending jobs)
  setInterval(() => {
    QueueService.triggerSqliteQueue().catch((err) => {
      console.error('[Queue Poller Error]:', err);
    });
  }, 3000);

  // If exchange channel is configured, automatically verify or setup panel
  if (config.discord.exchangeChannelId) {
    try {
      const channel = await client.channels.fetch(config.discord.exchangeChannelId) as TextChannel;
      if (channel && channel.isTextBased()) {
        console.log(`[Bot] Connected to Exchange Channel: #${channel.name} (${channel.id})`);
        const existingPanel = await MainPanel.findExistingPanel(channel);
        let panelMsgId = existingPanel?.id;
        if (!existingPanel) {
          const panelData = await MainPanel.createMainEmbed();
          const sent = await channel.send(panelData);
          panelMsgId = sent.id;
          console.log('[Bot] Deployed new Crypto Exchange Panel to #' + channel.name);
        } else {
          const panelData = await MainPanel.createMainEmbed();
          await existingPanel.edit(panelData);
          console.log('[Bot] Refreshed existing Crypto Exchange Panel in #' + channel.name);
        }

        // Auto-purge any old/extraneous bot messages from exchange channel (Enforce pristine single-panel channel)
        try {
          const fetchedMsgs = await channel.messages.fetch({ limit: 50 });
          for (const msg of fetchedMsgs.values()) {
            if (msg.author.id === client.user?.id && msg.id !== panelMsgId) {
              await msg.delete().catch(() => {});
              console.log(`[Bot] Purged non-panel message: ${msg.id}`);
            }
          }
        } catch (purgeErr) {
          console.warn('[Bot] Message cleanup warning:', purgeErr);
        }
      }
    } catch (err) {
      console.warn('[Bot] Could not fetch or setup exchange channel:', err);
    }
  }

  console.log('[Bot] Crypto Exchange Engine is ONLINE and READY.');
});

// Interaction Listener (Buttons, Modals)
client.on('interactionCreate', async (interaction) => {
  await InteractionHandler.handleInteraction(interaction);
});

// Message Listener (Slip detection & Admin commands)
client.on('messageCreate', async (message) => {
  // Command to deploy or refresh main panel: !setup-crypto
  if (message.content.trim() === '!setup-crypto' || message.content.trim() === '!crypto-panel') {
    if (message.member?.permissions.has('Administrator')) {
      const panelData = await MainPanel.createMainEmbed();
      await (message.channel as TextChannel).send(panelData);
      await message.reply('✅ วาง Panel แลกเปลี่ยนเหรียญคริปโตในห้องนี้เรียบร้อยแล้ว!');
      return;
    }
  }

  // Command to sync/set custom emojis: !emojis <paste custom emojis>
  if (message.content.startsWith('!set-emojis') || message.content.startsWith('!emojis')) {
    if (message.member?.permissions.has('Administrator')) {
      const { EmojiService, DEFAULT_EMOJIS } = await import('./config/emojis.js');
      const emojiRegex = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;
      let match;
      let count = 0;
      while ((match = emojiRegex.exec(message.content)) !== null) {
        const [fullTag, name] = match;
        const lowerName = name.toLowerCase();
        for (const [key, def] of Object.entries(DEFAULT_EMOJIS)) {
          if (def.name.toLowerCase() === lowerName || lowerName.includes(def.name.toLowerCase()) || def.name.toLowerCase().includes(lowerName)) {
            EmojiService.setEmoji(key, fullTag);
            count++;
          }
        }
      }

      const panelData = await MainPanel.createMainEmbed();
      if (config.discord.exchangeChannelId) {
        const ch = await client.channels.fetch(config.discord.exchangeChannelId) as TextChannel;
        if (ch) {
          const p = await MainPanel.findExistingPanel(ch);
          if (p) await p.edit(panelData);
        }
      }
      await message.reply(`✅ บันทึก Custom Emojis สำเร็จ ${count} รายการ และรีเฟรช Panel บนดิสคอร์ดเรียบร้อยแล้ว!`);
      return;
    }
  }

  // Owner Executive Command: !crypto-history, !history, !tx, !dashboard
  if (
    message.content.trim() === '!crypto-history' ||
    message.content.trim() === '!history' ||
    message.content.trim() === '!tx' ||
    message.content.trim() === '!dashboard'
  ) {
    if (message.member?.permissions.has('Administrator')) {
      const { AdminService } = await import('./services/admin.service.js');
      const dashboard = await AdminService.createExecutiveDashboard();
      await (message.channel as TextChannel).send(dashboard);
      return;
    }
  }

  const content = message.content.trim();
  const lower = content.toLowerCase();

  const ADMIN_IDS = ['1351000216228331551', '790378344809496656', '1548921066833838080'];
  const isOwnerOrAdmin =
    message.member?.permissions.has('Administrator') ||
    ADMIN_IDS.includes(message.author.id) ||
    message.guild?.ownerId === message.author.id;

  // ── Admin Command: Add Credit (!credit add, !credit-add, !add-credit) ──
  if (
    lower.startsWith('!credit add ') ||
    lower.startsWith('!credit-add ') ||
    lower.startsWith('!add-credit ')
  ) {
    if (isOwnerOrAdmin) {
      const parts = content.split(/\s+/);
      let targetId = '';
      let amount = 0;
      let reason = '';

      if (parts[1]?.toLowerCase() === 'add') {
        targetId = (parts[2] || '').replace(/[<@!>]/g, '');
        amount = parseFloat(parts[3] || '0');
        reason = parts.slice(4).join(' ') || 'Admin manual credit via text command';
      } else {
        targetId = (parts[1] || '').replace(/[<@!>]/g, '');
        amount = parseFloat(parts[2] || '0');
        reason = parts.slice(3).join(' ') || 'Admin manual credit via text command';
      }

      if (!targetId || isNaN(amount) || amount <= 0) {
        await message.reply('❌ รูปแบบคำสั่ง: `!credit add <@User/ID> <จำนวนเงินบาท> [เหตุผล]` หรือ `!credit-add <@User/ID> <จำนวนบาท>`');
        return;
      }

      let targetUserTag = 'ลูกค้า';
      try {
        const fetchedUser = await client.users.fetch(targetId);
        if (fetchedUser) targetUserTag = fetchedUser.tag;
      } catch (_) {}

      try {
        const { prisma } = await import('./services/db.service.js');
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
              referenceId: `ADMIN_CMD_${Date.now()}`,
              note: `Added by ${message.author.tag}: ${reason}`
            }
          });

          return user;
        });

        await message.reply(
          `✅ **เพิ่มเครดิตสำเร็จ!**\n• ลูกค้า: <@${targetId}> (\`${targetId}\`)\n• จำนวน: **\`+${amount.toFixed(2)} บาท\`**\n• เครดิตคงเหลือใหม่: **\`${updatedUser.balanceThb.toFixed(2)} บาท\`**\n• หมายเหตุ: \`${reason}\``
        );
      } catch (err: any) {
        await message.reply(`❌ บันทึกเครดิตล้มเหลว: ${err.message}`);
      }
      return;
    }
  }

  // ── Admin Command: Remove Credit (!credit remove, !remove credit, !credit-remove, !remove-credit) ──
  if (
    lower.startsWith('!credit remove ') ||
    lower.startsWith('!remove credit ') ||
    lower.startsWith('!credit-remove ') ||
    lower.startsWith('!remove-credit ')
  ) {
    if (isOwnerOrAdmin) {
      const parts = content.split(/\s+/);
      let targetId = '';
      let amount = 0;
      let reason = '';

      if (parts[1]?.toLowerCase() === 'remove' || parts[1]?.toLowerCase() === 'credit') {
        targetId = (parts[2] || '').replace(/[<@!>]/g, '');
        amount = parseFloat(parts[3] || '0');
        reason = parts.slice(4).join(' ') || 'Admin manual deduct via text command';
      } else {
        targetId = (parts[1] || '').replace(/[<@!>]/g, '');
        amount = parseFloat(parts[2] || '0');
        reason = parts.slice(3).join(' ') || 'Admin manual deduct via text command';
      }

      if (!targetId || isNaN(amount) || amount <= 0) {
        await message.reply('❌ รูปแบบคำสั่ง: `!credit remove <@User/ID> <จำนวนเงินบาท> [เหตุผล]` หรือ `!credit-remove <@User/ID> <จำนวนบาท>`');
        return;
      }

      try {
        const { prisma } = await import('./services/db.service.js');
        const existingUser = await prisma.userCredit.findUnique({ where: { discordUserId: targetId } });
        if (!existingUser || existingUser.balanceThb < amount) {
          await message.reply(`❌ ยอดเครดิตไม่พอให้หัก (คงเหลือปัจจุบัน: ${existingUser?.balanceThb?.toFixed(2) || '0.00'} บาท)`);
          return;
        }

        const updatedUser = await prisma.$transaction(async (tx) => {
          const user = await tx.userCredit.update({
            where: { discordUserId: targetId },
            data: { balanceThb: { decrement: amount } }
          });

          await tx.creditTransaction.create({
            data: {
              discordUserId: targetId,
              type: 'ADMIN_DEDUCT',
              amountThb: -amount,
              balanceBefore: existingUser.balanceThb,
              balanceAfter: user.balanceThb,
              referenceId: `ADMIN_DEDUCT_CMD_${Date.now()}`,
              note: `Deducted by ${message.author.tag}: ${reason}`
            }
          });

          return user;
        });

        await message.reply(
          `🔻 **หักเครดิตสำเร็จ!**\n• ลูกค้า: <@${targetId}> (\`${targetId}\`)\n• ยอดที่หัก: **\`-${amount.toFixed(2)} บาท\`**\n• เครดิตคงเหลือใหม่: **\`${updatedUser.balanceThb.toFixed(2)} บาท\`**\n• หมายเหตุ: \`${reason}\``
        );
      } catch (err: any) {
        await message.reply(`❌ หักเครดิตล้มเหลว: ${err.message}`);
      }
      return;
    }
  }

  // ── Admin Command: Check Credit (!credit check, !check-credit, !credit) ──
  if (
    lower.startsWith('!credit check ') ||
    lower.startsWith('!check-credit ') ||
    lower.startsWith('!credit ')
  ) {
    const parts = content.split(/\s+/);
    let targetId = '';
    if (parts[1]?.toLowerCase() === 'check') {
      targetId = (parts[2] || '').replace(/[<@!>]/g, '');
    } else {
      targetId = (parts[1] || '').replace(/[<@!>]/g, '');
    }

    if (targetId) {
      const { prisma } = await import('./services/db.service.js');
      const user = await prisma.userCredit.findUnique({ where: { discordUserId: targetId } });
      if (user) {
        await message.reply(`💰 ยอดเครดิตของ <@${targetId}>: **\`${user.balanceThb.toFixed(2)} บาท\`** (ยอดเติมสะสม: \`${user.totalTopupThb.toFixed(2)} บาท\`)`);
      } else {
        await message.reply(`ℹ️ ไม่พบบัญชีของ <@${targetId}> ในระบบ (เครดิต: 0.00 บาท)`);
      }
      return;
    }
  }

  await InteractionHandler.handleIncomingMessage(message);
});

client.login(config.discord.token).catch((err) => {
  console.error('[Bot] Login failed:', err.message);
});
