import { QueueService } from './services/queue.service.js';
import { initDatabase } from './services/db.service.js';

async function main() {
  console.log('[Worker] Starting PayomboyZ Hot Wallet Payout Worker...');
  await initDatabase();
  await QueueService.init();

  // Periodic polling for pending SQLite queue jobs
  setInterval(() => {
    QueueService.triggerSqliteQueue().catch((err) => {
      console.error('[Worker Loop Error]:', err);
    });
  }, 3000);

  console.log('[Worker] Payout Worker is ACTIVE and listening for orders.');
}

main().catch((err) => {
  console.error('[Worker Fatal Error]:', err);
  process.exit(1);
});
