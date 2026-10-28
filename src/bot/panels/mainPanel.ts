import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  Client,
  TextChannel
} from 'discord.js';
import { RateService } from '../../services/rate.service.js';
import { prisma } from '../../services/db.service.js';
import { UnifiedCreditService } from '../../services/unifiedCredit.service.js';
import { ExchangeModal } from '../modals/exchangeModal.js';
import { EmojiService } from '../../config/emojis.js';

export class MainPanel {
  private static client: Client | null = null;

  public static setClient(client: Client) {
    this.client = client;
    ExchangeModal.setClient(client);
  }

  public static async findExistingPanel(channel: TextChannel) {
    try {
      const specificMsg = await channel.messages.fetch('1563880215371849750');
      if (specificMsg && specificMsg.author.id === this.client?.user?.id) {
        return specificMsg;
      }
    } catch (_) {}

    const messages = await channel.messages.fetch({ limit: 15 });
    return messages.find(m => m.author.id === this.client?.user?.id && m.embeds.some(e => e.title?.includes('PAYOMBØYZ AUTOMATED CRYPTO EXCHANGE')));
  }

  public static async createMainEmbed(discordUserId?: string, customClient?: Client | null) {
    const client = customClient || this.client;

    // ดึงเรทสด
    const usdtBsc = await RateService.getQuote('USDT_BEP20');
    const usdtTron = await RateService.getQuote('USDT_TRC20');
    const usdtPoly = await RateService.getQuote('USDT_POLYGON');
    const ltc = await RateService.getQuote('LTC');

    // แก้ไขอิโมจิตามความต้องการของ dj
    const emojiBsc = EmojiService.getEmoji(client, 'usdtBsc');
    const emojiTron = EmojiService.getEmoji(client, 'usdtTron');
    const emojiPoly = EmojiService.getEmoji(client, 'usdtPoly');
    const emojiLtc = EmojiService.getEmoji(client, 'ltc');
    const emojiTopup = EmojiService.getEmoji(client, 'topup');
    const emojiHistory = EmojiService.getEmoji(client, 'history');
    const emojiRefresh = EmojiService.getEmoji(client, 'refresh');

    let userBalance = 0;
    if (discordUserId) {
      userBalance = await UnifiedCreditService.getBalance(discordUserId);
    }

    const embed = new EmbedBuilder()
      .setColor(0xd97706) // Luxury Burnished Gold
      .setTitle('⚡ PAYOMBØYZ AUTOMATED CRYPTO EXCHANGE')
      .setDescription(
        '**ระบบแลกเปลี่ยนเงินบาทเป็นคริปโตเคอร์เรนซีอัตโนมัติ (THB ➔ Crypto)**\n' +
        'เติมเงินบาทผ่านสลิปธนาคาร (EasySlip) ➔ โอนเหรียญเข้ากระเป๋าคุณเสี้ยววินาที!\n' +
        '──────────────────────────────────────────'
      )
      .addFields(
        {
          name: '📊 อัตราแลกเปลี่ยนปัจจุบัน (Live Exchange Rates)',
          value:
            `• ${emojiBsc} **USDT (BNB Smart Chain / BEP-20):** \`${usdtBsc.effectiveRate.toFixed(2)} บาท\` / 1 USDT\n` +
            `• ${emojiTron} **USDT (TRON / TRC-20):** \`${usdtTron.effectiveRate.toFixed(2)} บาท\` / 1 USDT\n` +
            `• ${emojiPoly} **USDT (Polygon):** \`${usdtPoly.effectiveRate.toFixed(2)} บาท\` / 1 USDT\n` +
            `• ${emojiLtc} **LTC (Litecoin Native SegWit):** \`${ltc.effectiveRate.toFixed(2)} บาท\` / 1 LTC\n` +
            `*(รวมค่าบริการแลกเปลี่ยน +${usdtBsc.marginThb.toFixed(2)} บาท/USDT แล้ว • อ้างอิงราคาตลาด Bitkub/Binance)*`,
          inline: false
        },
        {
          name: '💰 กระเป๋าเครดิตของคุณ (Your Balance)',
          value: `\`${userBalance.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท\``,
          inline: true
        },
        {
          name: '🛡️ สถานะระบบความปลอดภัย',
          value: '`🟢 Binance Master Hub Online`\n`⚡ Instant Multi-Chain Payout`',
          inline: true
        }
      )
      .setFooter({
        text: 'PayomboyZ Binance Master Hub • ล็อกเรทราคา 5 นาทีต่อรายการ'
      })
      .setTimestamp();

    // แถวที่ 1: ปุ่มเลือกเหรียญ (Coin Buttons)
    const coinButtonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_asset_USDT_BEP20')
        .setLabel('USDT (BEP-20)')
        .setEmoji(emojiBsc)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_asset_USDT_TRC20')
        .setLabel('USDT (TRC-20)')
        .setEmoji(emojiTron)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('btn_asset_USDT_POLYGON')
        .setLabel('USDT (Polygon)')
        .setEmoji(emojiPoly)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_asset_LTC')
        .setLabel('LTC (Litecoin)')
        .setEmoji(emojiLtc)
        .setStyle(ButtonStyle.Secondary)
    );

    // แถวที่ 2: ปุ่มจัดการเครดิตและระบบ
    const manageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_topup_credit')
        .setLabel('เติมเครดิต (สร้าง QR)')
        .setEmoji(emojiTopup)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('btn_topup_attach_slip')
        .setLabel('แนบสลิปเติมเงิน')
        .setEmoji('📤')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_view_history')
        .setLabel('ประวัติการแลก')
        .setEmoji(emojiHistory)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_refresh_panel')
        .setLabel('รีเฟรชเรท')
        .setEmoji(emojiRefresh)
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [coinButtonsRow, manageRow] };
  }
}
