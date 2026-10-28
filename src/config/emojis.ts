import fs from 'fs';
import path from 'path';
import { Client } from 'discord.js';

export interface EmojiEntry {
  name: string;
  id?: string;
  animated?: boolean;
  fallback: string;
  label: string;
}

const EMOJI_FILE = path.resolve('data/custom_emojis.json');

export const DEFAULT_EMOJIS: Record<string, EmojiEntry> = {
  usdtBsc: {
    name: 'halal_coin_bsc_usdt',
    id: '1564038716962504905',
    fallback: '<:halal_coin_bsc_usdt:1564038716962504905>',
    label: 'USDT (BNB Smart Chain)'
  },
  usdtTron: {
    name: 'halal_coin_tron_usdt',
    id: '1564038731235860571',
    fallback: '<:halal_coin_tron_usdt:1564038731235860571>',
    label: 'USDT (TRON / TRC-20)'
  },
  usdtPoly: {
    name: 'halal_coin_ethereum_usdt',
    id: '1564038738516905984',
    fallback: '<:halal_coin_ethereum_usdt:1564038738516905984>',
    label: 'USDT (Polygon)'
  },
  ltc: {
    name: 'halal_coin_litecoin',
    id: '1564038744875602040',
    fallback: '<:halal_coin_litecoin:1564038744875602040>',
    label: 'LTC (Litecoin)'
  },
  topup: {
    name: 'emoji_16',
    id: '1564046478949879988',
    fallback: '<:emoji_16:1564046478949879988>',
    label: 'เติมเครดิต'
  },
  history: {
    name: 'Rules',
    id: '1564038770729291776',
    fallback: '<:Rules:1564038770729291776>',
    label: 'ประวัติการแลก'
  },
  refresh: {
    name: 'time',
    id: '1564047534157074483',
    animated: true,
    fallback: '<a:time:1564047534157074483>',
    label: 'รีเฟรชเรท'
  }
};

export class EmojiService {
  private static overrides: Record<string, string> = {};

  public static init() {
    try {
      if (fs.existsSync(EMOJI_FILE)) {
        const raw = fs.readFileSync(EMOJI_FILE, 'utf-8');
        this.overrides = JSON.parse(raw);
      }
    } catch (e) {
      this.overrides = {};
    }
  }

  public static setEmoji(key: string, emojiTagOrId: string) {
    this.overrides[key] = emojiTagOrId.trim();
    try {
      const dir = path.dirname(EMOJI_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(EMOJI_FILE, JSON.stringify(this.overrides, null, 2), 'utf-8');
    } catch (e) {
      console.error('[EmojiService] Failed to save overrides:', e);
    }
  }

  public static getEmoji(client: Client | null, key: string): string {
    const def = DEFAULT_EMOJIS[key];
    if (!def) return '🪙';

    // 1. Live server lookup from client cache (ALWAYS fresh if emoji was re-uploaded on server)
    if (client?.emojis?.cache) {
      const cleanName = def.name.replace(/^:|:$/g, '').replace(/~\d+$/, '').toLowerCase();
      const found = client.emojis.cache.find(
        (e) => e.name?.toLowerCase() === cleanName ||
               e.name?.toLowerCase() === def.name.toLowerCase()
      );
      if (found) {
        return `<${found.animated ? 'a' : ''}:${found.name}:${found.id}>`;
      }
    }

    // 2. Persistent overrides
    if (this.overrides[key]) {
      const val = this.overrides[key];
      if (val.startsWith('<') && val.endsWith('>')) return val;
      if (/^\d+$/.test(val)) return `<${def.animated ? 'a' : ''}:${def.name}:${val}>`;
      return val;
    }

    // 3. Exact configured snowflake ID
    if (def.id) {
      return `<${def.animated ? 'a' : ''}:${def.name}:${def.id}>`;
    }

    return def.fallback;
  }
}

EmojiService.init();
