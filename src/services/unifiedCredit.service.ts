import axios from 'axios';
import { prisma } from './db.service.js';
import { config } from '../config/index.js';

const PRIMARY_SYNC_URL = process.env.CLOUD_WEB_URL || 'https://payomboyz.shop';
const BACKUP_SYNC_URL = process.env.FLOWAUTH_URL || 'https://payomboyzcreative.online';
const SYNC_PIN = process.env.CLOUD_SYNC_KEY || '280342';
const MASTER_API_KEY = process.env.API_ADMIN_SECRET || 'd23c5d8d0eeaeb08b49048c566f42daee80a924f50e882c2';

export class UnifiedCreditService {
  /**
   * Fetch authoritative user credit balance.
   * Priority: Local SQLite authoritative balance -> Initial import from payomboyz.shop -> Backup FlowAuth
   */
  public static async getBalance(discordUserId: string, username?: string): Promise<number> {
    const cleanId = String(discordUserId || '').trim();
    if (!cleanId) return 0;

    // 1. Authoritative: Local SQLite Database
    try {
      const local = await prisma.userCredit.findUnique({
        where: { discordUserId: cleanId }
      });
      if (local) {
        return local.balanceThb;
      }
    } catch (_) {}

    // 2. Initial Onboarding: Import balance from Primary payomboyz.shop for new users
    try {
      const resp = await axios.get(`${PRIMARY_SYNC_URL}/api/sync`, {
        params: {
          action: 'balance',
          userId: cleanId,
          key: SYNC_PIN
        },
        headers: {
          'x-admin-sync-key': SYNC_PIN,
          'x-admin-pin': SYNC_PIN,
          'User-Agent': 'PayomboyZ-CryptoExchange/2.0'
        },
        timeout: 4000
      });

      if (resp.status === 200 && typeof resp.data?.balance === 'number') {
        const cloudBal = Number(resp.data.balance);
        await this.syncLocalCache(cleanId, cloudBal, username);
        return cloudBal;
      }
    } catch (_) {}

    // 3. Backup: payomboyzcreative.online /api/v1/customers
    try {
      const backupResp = await axios.get(`${BACKUP_SYNC_URL}/api/v1/customers`, {
        params: {
          action: 'get_balance',
          discord_id: cleanId
        },
        headers: {
          'x-api-key': MASTER_API_KEY,
          'x-admin-sync-key': SYNC_PIN,
          'User-Agent': 'PayomboyZ-CryptoExchange/2.0'
        },
        timeout: 4000
      });

      if (backupResp.status === 200 && typeof backupResp.data?.balance === 'number') {
        const cloudBal = Number(backupResp.data.balance);
        await this.syncLocalCache(cleanId, cloudBal, username);
        return cloudBal;
      }
    } catch (_) {}

    return 0;
  }

  /**
   * Adjust balance atomically on local SQLite Single Source of Truth.
   * Synchronizes out to cloud web shop in background.
   */
  public static async adjustBalance(
    discordUserId: string,
    delta: number,
    reason: string,
    ref?: string,
    username?: string
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    const cleanId = String(discordUserId || '').trim();
    const numDelta = Number(delta) || 0;
    if (!cleanId) return { success: false, newBalance: 0, error: 'Missing discordUserId' };

    // 1. Atomic Transaction on Local SQLite
    let localResult: { success: boolean; newBalance: number; error?: string };
    try {
      localResult = await prisma.$transaction(async (tx) => {
        const user = await tx.userCredit.findUnique({ where: { discordUserId: cleanId } });
        const curBal = user?.balanceThb || 0;
        if (numDelta < 0 && curBal < Math.abs(numDelta)) {
          return { success: false, newBalance: curBal, error: 'Insufficient funds' };
        }
        const updatedBal = Math.max(0, curBal + numDelta);
        await tx.userCredit.upsert({
          where: { discordUserId: cleanId },
          create: {
            discordUserId: cleanId,
            discordUsername: username || cleanId,
            balanceThb: updatedBal,
            totalTopupThb: numDelta > 0 ? numDelta : 0,
            totalSpentThb: numDelta < 0 ? Math.abs(numDelta) : 0
          },
          update: {
            discordUsername: username || cleanId,
            balanceThb: updatedBal,
            ...(numDelta > 0 ? { totalTopupThb: { increment: numDelta } } : {}),
            ...(numDelta < 0 ? { totalSpentThb: { increment: Math.abs(numDelta) } } : {})
          }
        });

        await tx.creditTransaction.create({
          data: {
            discordUserId: cleanId,
            type: numDelta >= 0 ? (reason.includes('REFUND') ? 'TOPUP_SYNC' : 'ADMIN_ADJUST') : 'EXCHANGE_DEBIT',
            amountThb: Math.abs(numDelta),
            balanceBefore: curBal,
            balanceAfter: updatedBal,
            referenceId: ref || `TX_${Date.now()}`,
            note: reason
          }
        });

        return { success: true, newBalance: updatedBal };
      });
    } catch (dbErr: any) {
      console.error('[UnifiedCredit DB Error]:', dbErr.message);
      return { success: false, newBalance: 0, error: dbErr.message };
    }

    if (!localResult.success) {
      return localResult;
    }

    // 2. Background Sync to Cloud Web Shop (payomboyz.shop)
    try {
      axios.post(
        `${PRIMARY_SYNC_URL}/api/sync`,
        {
          key: SYNC_PIN,
          action: 'adjust_balance',
          userId: cleanId,
          amount: numDelta,
          reason: reason || 'CRYPTO_BOT_SYNC',
          ref: ref || `REF_${Date.now()}`
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-admin-sync-key': SYNC_PIN,
            'User-Agent': 'PayomboyZ-CryptoExchange/2.0'
          },
          timeout: 4000
        }
      ).catch(() => {});
    } catch (_) {}

    return localResult;
  }

  private static async syncLocalCache(discordUserId: string, balance: number, username?: string) {
    try {
      const existing = await prisma.userCredit.findUnique({ where: { discordUserId } });
      if (!existing) {
        await prisma.userCredit.create({
          data: {
            discordUserId,
            discordUsername: username || discordUserId,
            balanceThb: balance,
            totalTopupThb: balance
          }
        });
      }
    } catch (_) {}
  }
}
