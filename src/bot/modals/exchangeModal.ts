import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Client
} from 'discord.js';
import { EmojiService } from '../../config/emojis.js';

export interface AssetOption {
  id: string;
  label: string;
  shortLabel: string;
  network: string;
  symbol: string;
  emojiKey: string;
  emoji: string;
  description: string;
  placeholder: string;
  btnStyle: ButtonStyle;
}

export class ExchangeModal {
  private static client: Client | null = null;

  public static setClient(client: Client | null) {
    this.client = client;
  }
  public static readonly SUPPORTED_ASSETS: AssetOption[] = [
    {
      id: 'USDT_BEP20',
      label: 'USDT (BNB Smart Chain / BEP-20)',
      shortLabel: 'USDT (BEP-20)',
      network: 'BSC / BEP-20',
      symbol: 'USDT',
      emojiKey: 'usdtBsc',
      emoji: '🟢',
      description: 'ค่าแก๊ส 10 บาท • ยอดนิยม รวดเร็ว',
      placeholder: '0x... วางกระเป๋า BNB Smart Chain (42 ตัวอักษร)',
      btnStyle: ButtonStyle.Primary
    },
    {
      id: 'USDT_TRC20',
      label: 'USDT (TRON / TRC-20)',
      shortLabel: 'USDT (TRC-20)',
      network: 'TRON / TRC-20',
      symbol: 'USDT',
      emojiKey: 'usdtTron',
      emoji: '🔴',
      description: 'ค่าแก๊ส 35 บาท • เครือข่าย TRON',
      placeholder: 'T... วางกระเป๋า TRON (ขึ้นต้นด้วย T 34 ตัวอักษร)',
      btnStyle: ButtonStyle.Danger
    },
    {
      id: 'USDT_POLYGON',
      label: 'USDT (Polygon)',
      shortLabel: 'USDT (Polygon)',
      network: 'Polygon',
      symbol: 'USDT',
      emojiKey: 'usdtPoly',
      emoji: '🟣',
      description: 'ค่าแก๊ส 5 บาท • เครือข่าย Polygon (MATIC)',
      placeholder: '0x... วางกระเป๋า Polygon (42 ตัวอักษร)',
      btnStyle: ButtonStyle.Primary
    },
    {
      id: 'LTC',
      label: 'LTC (Litecoin Native SegWit)',
      shortLabel: 'LTC (Litecoin)',
      network: 'Litecoin',
      symbol: 'LTC',
      emojiKey: 'ltc',
      emoji: '⚪',
      description: 'ค่าแก๊ส 5 บาท • SegWit ค่าโอนถูกมาก',
      placeholder: 'ltc1... / L... / M... วางกระเป๋า Litecoin',
      btnStyle: ButtonStyle.Secondary
    }
  ];

  public static getAssetConfig(assetId: string): AssetOption {
    const found = this.SUPPORTED_ASSETS.find(a => a.id === assetId);
    if (found) return found;

    return {
      id: assetId,
      label: assetId,
      shortLabel: assetId,
      network: assetId,
      symbol: assetId.split('_')[0] || assetId,
      emojiKey: 'usdtBsc',
      emoji: '🪙',
      description: 'เหรียญคริปโตเคอร์เรนซี',
      placeholder: 'วาง Address กระเป๋าของคุณให้ตรงกับเชนที่เลือก',
      btnStyle: ButtonStyle.Primary
    };
  }

  public static createModal(assetId: string = 'USDT_BEP20') {
    const asset = this.getAssetConfig(assetId);

    const modal = new ModalBuilder()
      .setCustomId(`modal_exchange_${asset.id}`)
      .setTitle(`🔄 แลกเหรียญ ${asset.shortLabel}`);

    const addressInput = new TextInputBuilder()
      .setCustomId('input_address')
      .setLabel(`ที่อยู่กระเป๋า ${asset.shortLabel} ปลายทาง`)
      .setPlaceholder(asset.placeholder)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const isLtc = asset.symbol === 'LTC';
    const amountPlaceholder = isLtc
      ? 'ระบุยอด LTC เช่น 0.05, 0.1, 1 (หรือใส่ 200B เพื่อระบุเป็นบาท)'
      : 'ระบุยอด USDT เช่น 5, 10.5, 25 (หรือใส่ 200B เพื่อระบุเป็นบาท)';

    const amountInput = new TextInputBuilder()
      .setCustomId('input_amount')
      .setLabel(`จำนวนเหรียญ ${asset.symbol} ที่ต้องการให้โอน`)
      .setPlaceholder(amountPlaceholder)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput)
    );

    return modal;
  }

  public static createAssetSelector(userBalance: number = 0) {
    const emojiBsc = EmojiService.getEmoji(this.client, 'usdtBsc');
    const emojiTron = EmojiService.getEmoji(this.client, 'usdtTron');
    const emojiPoly = EmojiService.getEmoji(this.client, 'usdtPoly');
    const emojiLtc = EmojiService.getEmoji(this.client, 'ltc');

    const embed = new EmbedBuilder()
      .setColor(0x00f0ff)
      .setTitle('🪙 เลือกเหรียญและเครือข่ายที่ต้องการรับ (Select Asset & Network)')
      .setDescription(
        '**กรุณาเลือกเหรียญและเครือข่ายบล็อกเชนที่คุณต้องการรับโอนด้านล่าง**\n' +
        `• 💰 เครดิตคงเหลือของคุณ: \`${userBalance.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท\`\n` +
        '──────────────────────────────────────────\n' +
        `• ${emojiBsc} **USDT (BNB Smart Chain / BEP-20):** แก๊ส 10 บาท • ยอดนิยม รวดเร็ว\n` +
        `• ${emojiTron} **USDT (TRON / TRC-20):** แก๊ส 35 บาท • เครือข่าย TRON มาตรฐาน\n` +
        `• ${emojiPoly} **USDT (Polygon):** แก๊ส 5 บาท • เครือข่าย Polygon (MATIC) ค่าโอนประหยัด\n` +
        `• ${emojiLtc} **LTC (Litecoin Native):** แก๊ส 5 บาท • SegWit สะดวก ค่าธรรมเนียมต่ำ\n` +
        '──────────────────────────────────────────\n' +
        '👇 **กดปุ่มเหรียญหรือเลือกจากเมนูด้านล่าง เพื่อเปิดแบบฟอร์มกรอก Address ทันที:**'
      );

    // Dropdown Select Menu
    const selectMenuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_exchange_asset')
        .setPlaceholder('🪙 เลือกเหรียญและเน็ตเวิร์กที่ต้องการแลก...')
        .addOptions([
          {
            label: 'USDT (BNB Smart Chain / BEP-20)',
            value: 'USDT_BEP20',
            description: 'ค่าแก๊ส 10 บาท • ยอดนิยม รวดเร็ว',
            emoji: emojiBsc
          },
          {
            label: 'USDT (TRON / TRC-20)',
            value: 'USDT_TRC20',
            description: 'ค่าแก๊ส 35 บาท • เครือข่าย TRON',
            emoji: emojiTron
          },
          {
            label: 'USDT (Polygon)',
            value: 'USDT_POLYGON',
            description: 'ค่าแก๊ส 5 บาท • เครือข่าย Polygon (MATIC)',
            emoji: emojiPoly
          },
          {
            label: 'LTC (Litecoin Native SegWit)',
            value: 'LTC',
            description: 'ค่าแก๊ส 5 บาท • SegWit ค่าโอนถูกมาก',
            emoji: emojiLtc
          }
        ])
    );

    // Quick Buttons
    const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

    return {
      embeds: [embed],
      components: [selectMenuRow, buttonsRow]
    };
  }

  public static createTopupModal() {
    const modal = new ModalBuilder()
      .setCustomId('modal_topup_submit')
      .setTitle('💰 เติมเครดิตเข้าระบบ (PromptPay QR)');

    const amountInput = new TextInputBuilder()
      .setCustomId('input_topup_amount')
      .setLabel('ระบุจำนวนเงินบาทที่ต้องการเติม')
      .setPlaceholder('เช่น 50, 100, 500, 1000')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput)
    );

    return modal;
  }
}
