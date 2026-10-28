import {
  SlashCommandBuilder,
  Client,
  RESTPostAPIChatInputApplicationCommandsJSONBody
} from 'discord.js';
import { config } from '../../config/index.js';

export function getSlashCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  // 1. /credit [add | remove | check]
  const creditCommand = new SlashCommandBuilder()
    .setName('credit')
    .setDescription('จัดการเครดิตลูกค้า (Admin Credit Management)')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('เพิ่มเครดิตเงินบาทให้ลูกค้า')
        .addStringOption(opt =>
          opt
            .setName('target')
            .setDescription('แท็กผู้ใช้ (@User) หรือพิมพ์ Discord ID (18-19 หลัก)')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt
            .setName('amount')
            .setDescription('จำนวนเงินบาทที่ต้องการเพิ่ม (THB)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('เหตุผลในการเพิ่มเครดิต')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('หักเครดิตเงินบาทของลูกค้า')
        .addStringOption(opt =>
          opt
            .setName('target')
            .setDescription('แท็กผู้ใช้ (@User) หรือพิมพ์ Discord ID (18-19 หลัก)')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt
            .setName('amount')
            .setDescription('จำนวนเงินบาทที่ต้องการหัก (THB)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('เหตุผลในการหักเครดิต')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('check')
        .setDescription('ตรวจสอบยอดเครดิตคงเหลือของลูกค้า')
        .addStringOption(opt =>
          opt
            .setName('target')
            .setDescription('แท็กผู้ใช้ (@User) หรือพิมพ์ Discord ID (18-19 หลัก)')
            .setRequired(true)
        )
    );

  // 2. /remove credit (Alias สำหรับคนที่พิมพ์ /remove credit)
  const removeCommand = new SlashCommandBuilder()
    .setName('remove')
    .setDescription('คำสั่งหักข้อมูล/เครดิต')
    .addSubcommand(sub =>
      sub
        .setName('credit')
        .setDescription('หักเครดิตเงินบาทของลูกค้า')
        .addStringOption(opt =>
          opt
            .setName('target')
            .setDescription('แท็กผู้ใช้ (@User) หรือพิมพ์ Discord ID (18-19 หลัก)')
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt
            .setName('amount')
            .setDescription('จำนวนเงินบาทที่ต้องการหัก (THB)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('เหตุผลในการหักเครดิต')
            .setRequired(false)
        )
    );

  // 3. /credit-add (Standalone shorthand)
  const creditAddCommand = new SlashCommandBuilder()
    .setName('credit-add')
    .setDescription('เพิ่มเครดิตเงินบาทให้ลูกค้า (Admin Only)')
    .addStringOption(opt =>
      opt
        .setName('target')
        .setDescription('แท็กผู้ใช้ (@User) หรือพิมพ์ Discord ID (18-19 หลัก)')
        .setRequired(true)
    )
    .addNumberOption(opt =>
      opt
        .setName('amount')
        .setDescription('จำนวนเงินบาทที่ต้องการเพิ่ม (THB)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('เหตุผลในการเพิ่มเครดิต')
        .setRequired(false)
    );

  // 4. /credit-remove (Standalone shorthand)
  const creditRemoveCommand = new SlashCommandBuilder()
    .setName('credit-remove')
    .setDescription('หักเครดิตเงินบาทของลูกค้า (Admin Only)')
    .addStringOption(opt =>
      opt
        .setName('target')
        .setDescription('แท็กผู้ใช้ (@User) หรือพิมพ์ Discord ID (18-19 หลัก)')
        .setRequired(true)
    )
    .addNumberOption(opt =>
      opt
        .setName('amount')
        .setDescription('จำนวนเงินบาทที่ต้องการหัก (THB)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('เหตุผลในการหักเครดิต')
        .setRequired(false)
    );

  // 5. /remove-credit (Standalone alias)
  const removeCreditCommand = new SlashCommandBuilder()
    .setName('remove-credit')
    .setDescription('หักเครดิตเงินบาทของลูกค้า (Admin Only)')
    .addStringOption(opt =>
      opt
        .setName('target')
        .setDescription('แท็กผู้ใช้ (@User) หรือพิมพ์ Discord ID (18-19 หลัก)')
        .setRequired(true)
    )
    .addNumberOption(opt =>
      opt
        .setName('amount')
        .setDescription('จำนวนเงินบาทที่ต้องการหัก (THB)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('เหตุผลในการหักเครดิต')
        .setRequired(false)
    );

  // 6. /check-credit (Standalone shorthand)
  const checkCreditCommand = new SlashCommandBuilder()
    .setName('check-credit')
    .setDescription('ตรวจสอบยอดเครดิตคงเหลือของลูกค้า')
    .addStringOption(opt =>
      opt
        .setName('target')
        .setDescription('แท็กผู้ใช้ (@User) หรือพิมพ์ Discord ID (18-19 หลัก)')
        .setRequired(true)
    );

  // 7. /slip (แนบรูปสลิป)
  const slipCommand = new SlashCommandBuilder()
    .setName('slip')
    .setDescription('แนบรูปสลิปธนาคารเพื่อตรวจสอบและเติมเครดิตอัตโนมัติ')
    .addAttachmentOption(opt =>
      opt
        .setName('image')
        .setDescription('ไฟล์รูปภาพสลิปโอนเงิน (PNG, JPG, JPEG, WEBP)')
        .setRequired(true)
    );

  return [
    creditCommand.toJSON(),
    creditAddCommand.toJSON(),
    creditRemoveCommand.toJSON(),
    slipCommand.toJSON()
  ];
}

export async function deploySlashCommands(client: Client): Promise<void> {
  const commands = getSlashCommands();

  try {
    // 1. Clear global commands to avoid duplicate/stale client cache collisions
    if (client.application) {
      await client.application.commands.set([]);
      console.log('[SlashCommands] Cleared global application commands to prevent stale cache collisions.');
    }

    // 2. Deploy directly to the Guild for 0-second instant activation
    if (config.discord.guildId) {
      try {
        const guild = await client.guilds.fetch(config.discord.guildId);
        if (guild) {
          await guild.commands.set(commands);
          console.log(`[SlashCommands] Deployed ${commands.length} clean slash commands to Guild: ${guild.name} (${guild.id})`);
        }
      } catch (gErr: any) {
        console.warn('[SlashCommands] Could not deploy to Guild directly:', gErr.message);
      }
    }
  } catch (err: any) {
    console.error('[SlashCommands] Failed to deploy slash commands:', err.message);
  }
}
