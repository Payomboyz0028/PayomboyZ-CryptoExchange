import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const prisma = new PrismaClient({
  log: ['warn', 'error']
});

export async function initDatabase() {
  try {
    await prisma.$connect();
    console.log('[DB] Connected to SQLite database successfully.');
  } catch (err) {
    console.error('[DB] Connection failed:', err);
    process.exit(1);
  }
}
