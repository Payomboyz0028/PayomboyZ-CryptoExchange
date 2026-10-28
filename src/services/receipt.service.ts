import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register high-quality Windows Thai fonts (Leelawadee UI & Tahoma)
try {
  if (fs.existsSync('C:/Windows/Fonts/LeelawUI.ttf')) {
    GlobalFonts.registerFromPath('C:/Windows/Fonts/LeelawUI.ttf', 'Leelawadee UI');
  }
  if (fs.existsSync('C:/Windows/Fonts/LeelaUIb.ttf')) {
    GlobalFonts.registerFromPath('C:/Windows/Fonts/LeelaUIb.ttf', 'Leelawadee UI Bold');
  }
  if (fs.existsSync('C:/Windows/Fonts/tahoma.ttf')) {
    GlobalFonts.registerFromPath('C:/Windows/Fonts/tahoma.ttf', 'Tahoma');
  }
  if (fs.existsSync('C:/Windows/Fonts/tahomabd.ttf')) {
    GlobalFonts.registerFromPath('C:/Windows/Fonts/tahomabd.ttf', 'Tahoma Bold');
  }
} catch (_) {}

export interface ReceiptData {
  orderId: string;
  discordUserId: string;
  discordUsername?: string;
  asset: string;
  network: string;
  recipientAddress: string;
  thbAmountDebit: number;
  netThbAmount: number;
  networkFeeThb: number;
  effectiveRate: number;
  cryptoAmountOut: number;
  txHash: string;
  explorerUrl: string;
  createdAt?: Date;
}

export class ReceiptService {
  public static async generateReceipt(data: ReceiptData): Promise<Buffer> {
    const width = 760;
    const height = 1040;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Luxury Black & Crimson Ruby Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0a0305');
    bgGrad.addColorStop(0.35, '#140509');
    bgGrad.addColorStop(0.7, '#18070d');
    bgGrad.addColorStop(1, '#060203');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Radial Crimson Glow
    const radialGlow = ctx.createRadialGradient(width / 2, 170, 20, width / 2, 170, 360);
    radialGlow.addColorStop(0, 'rgba(220, 38, 38, 0.22)');
    radialGlow.addColorStop(0.5, 'rgba(180, 83, 9, 0.08)');
    radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radialGlow;
    ctx.fillRect(0, 0, width, height);

    // Outer Gold Border (Burnished Gold)
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Inner subtle border
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(26, 26, width - 52, height - 52);

    // Corner Gold Accents (Polished Bright Gold)
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3.5;
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(20, 56); ctx.lineTo(20, 20); ctx.lineTo(56, 20);
    ctx.stroke();
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(width - 56, 20); ctx.lineTo(width - 20, 20); ctx.lineTo(width - 20, 56);
    ctx.stroke();
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(20, height - 56); ctx.lineTo(20, height - 20); ctx.lineTo(56, height - 20);
    ctx.stroke();
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(width - 56, height - 20); ctx.lineTo(width - 20, height - 20); ctx.lineTo(width - 20, height - 56);
    ctx.stroke();

    // 2. Header & Brand Logo
    const possibleLogoPaths = [
      path.resolve(__dirname, '../../assets/logo.png'),
      path.resolve(process.cwd(), 'assets/logo.png'),
      'd:/Deobfuscate/CryptoPayment/assets/logo.png'
    ];
    const logoPath = possibleLogoPaths.find(p => fs.existsSync(p));

    let hasLogo = false;
    const logoX = 45;
    const logoY = 40;
    const logoSize = 50;

    if (logoPath) {
      try {
        const logoImg = await loadImage(logoPath);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(logoX, logoY, logoSize, logoSize, 10);
        ctx.clip();
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();

        // Burnished Gold Border around Logo
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(logoX, logoY, logoSize, logoSize, 10);
        ctx.stroke();

        hasLogo = true;
      } catch (_) {}
    }

    const titleX = hasLogo ? logoX + logoSize + 14 : 45;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px "Leelawadee UI Bold", Tahoma, sans-serif';
    ctx.fillText('PAYOMBØYZ CRYPTO VAULT', titleX, 64);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px "Leelawadee UI", Tahoma, sans-serif';
    ctx.fillText('OFFICIAL EXECUTIVE TRANSACTION RECEIPT (ใบเสร็จรับเงินอย่างเป็นทางการ)', titleX, 84);

    // Verified Badge (Crimson & Gold with Vector Checkmark)
    const badgeX = width - 245;
    const badgeY = 46;
    ctx.fillStyle = 'rgba(185, 28, 28, 0.25)';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, 200, 34, 17);
    ctx.fill();
    ctx.stroke();

    // Vector Checkmark
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(badgeX + 18, badgeY + 17);
    ctx.lineTo(badgeX + 23, badgeY + 22);
    ctx.lineTo(badgeX + 32, badgeY + 12);
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 12px "Leelawadee UI Bold", Tahoma, sans-serif';
    ctx.fillText('BINANCE VAULT VERIFIED', badgeX + 40, badgeY + 22);

    // Divider Line (Gold Gradient)
    const divGrad = ctx.createLinearGradient(45, 0, width - 45, 0);
    divGrad.addColorStop(0, 'rgba(217, 119, 6, 0.1)');
    divGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.8)');
    divGrad.addColorStop(1, 'rgba(217, 119, 6, 0.1)');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(45, 106);
    ctx.lineTo(width - 45, 106);
    ctx.stroke();

    // 3. Hero Section (Delivered Crypto)
    ctx.fillStyle = '#fca5a5';
    ctx.font = '12px "Leelawadee UI", Tahoma, sans-serif';
    ctx.fillText('TOTAL CRYPTO TRANSFERRED (ยอดเหรียญสุทธิที่ได้รับ)', 45, 138);

    const coinSymbol = data.asset.split('_')[0];
    const amountText = `+ ${data.cryptoAmountOut} ${coinSymbol}`;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px "Leelawadee UI Bold", Tahoma, sans-serif';
    ctx.fillText(amountText, 45, 186);

    // Network Pill (Red & Gold)
    const netPillText = `NETWORK: ${data.network} (${data.asset}) • BINANCE SAPI`;
    ctx.font = 'bold 11px "Leelawadee UI Bold", Tahoma, sans-serif';
    const pillWidth = ctx.measureText(netPillText).width + 24;
    ctx.fillStyle = 'rgba(153, 27, 27, 0.35)';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(45, 204, pillWidth, 26, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fcd34d';
    ctx.fillText(netPillText, 57, 221);

    // Divider Line
    ctx.strokeStyle = divGrad;
    ctx.beginPath();
    ctx.moveTo(45, 246);
    ctx.lineTo(width - 45, 246);
    ctx.stroke();

    // 4. Two-Column Metadata Grid
    const col1X = 45;
    const col2X = width / 2 + 10;
    let gridY = 278;
    const lineSpacing = 36;

    const drawGridRow = (lLabel: string, lVal: string, lColor: string, rLabel: string, rVal: string, rColor: string) => {
      ctx.font = '12px "Leelawadee UI", Tahoma, sans-serif';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(lLabel, col1X, gridY);
      ctx.fillText(rLabel, col2X, gridY);

      ctx.font = 'bold 13px "Leelawadee UI Bold", Tahoma, sans-serif';
      ctx.fillStyle = lColor;
      ctx.fillText(lVal, col1X, gridY + 18);
      ctx.fillStyle = rColor;
      ctx.fillText(rVal, col2X, gridY + 18);

      gridY += lineSpacing + 14;
    };

    const dateStr = (data.createdAt || new Date()).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    drawGridRow(
      'ORDER REFERENCE (รหัสออเดอร์)',
      `#${data.orderId.slice(0, 12).toUpperCase()}`,
      '#e2e8f0',
      'DATE & TIME (วัน-เวลาทำรายการ)',
      dateStr,
      '#e2e8f0'
    );

    drawGridRow(
      'THB AMOUNT DEBITED (ยอดเงินที่หัก)',
      `${data.thbAmountDebit.toFixed(2)} บาท (THB)`,
      '#f87171',
      'EFFECTIVE RATE (อัตราแลกเปลี่ยนสุทธิ)',
      `${data.effectiveRate.toFixed(2)} THB / 1 ${coinSymbol}`,
      '#fde047'
    );

    drawGridRow(
      'NETWORK GAS FEE (ค่าธรรมเนียมบล็อกเชน)',
      `${data.networkFeeThb.toFixed(2)} บาท`,
      '#fca5a5',
      'NET EXCHANGE VALUE (ยอดแปลงเหรียญสุทธิ)',
      `${data.netThbAmount.toFixed(2)} บาท`,
      '#fbbf24'
    );

    // Divider Line
    ctx.strokeStyle = divGrad;
    ctx.beginPath();
    ctx.moveTo(45, gridY);
    ctx.lineTo(width - 45, gridY);
    ctx.stroke();
    gridY += 24;

    // 5. Destination Address Box (Dark Ruby Box with Gold Accent)
    ctx.font = '12px "Leelawadee UI", Tahoma, sans-serif';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('RECIPIENT WALLET ADDRESS (กระเป๋าปลายทางผู้รับ)', 45, gridY);
    gridY += 10;

    ctx.fillStyle = '#100407';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(45, gridY, width - 90, 48, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '14px Consolas, monospace';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText(data.recipientAddress, 60, gridY + 30);
    gridY += 66;

    // 6. Transaction Hash (TxID) Box (Gold Border & Text)
    ctx.font = '12px "Leelawadee UI", Tahoma, sans-serif';
    ctx.fillStyle = '#fde047';
    ctx.fillText('TRANSACTION HASH (รหัสอ้างอิงบล็อกเชน TxID)', 45, gridY);
    gridY += 10;

    ctx.fillStyle = '#100407';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(45, gridY, width - 90, 48, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '14px Consolas, monospace';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(data.txHash, 60, gridY + 30);
    gridY += 66;

    // 7. On-Chain Verification QR Code Box (Black-Crimson Glassmorphism & Gold Border)
    const qrBoxY = gridY;
    const qrBoxHeight = 148;
    ctx.fillStyle = 'rgba(24, 7, 12, 0.85)';
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(45, qrBoxY, width - 90, qrBoxHeight, 10);
    ctx.fill();
    ctx.stroke();

    // Generate & draw QR code (Gold & Black)
    try {
      const qrBuffer = await QRCode.toBuffer(data.explorerUrl, {
        width: 124,
        margin: 1,
        color: {
          dark: '#ffd700',
          light: '#0a0305'
        }
      });
      const qrImg = await loadImage(qrBuffer);
      ctx.drawImage(qrImg, width - 182, qrBoxY + 12, 124, 124);
    } catch (_) {}

    // QR Explanatory Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px "Leelawadee UI Bold", Tahoma, sans-serif';
    ctx.fillText('สแกน QR Code เพื่อตรวจสอบสถานะสดบนบล็อกเชน', 65, qrBoxY + 38);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px "Leelawadee UI", Tahoma, sans-serif';
    ctx.fillText('ใช้กล้องสมาร์ทโฟนสแกน QR Code ด้านขวาเพื่อเปิดดูบันทึกธุรกรรมแบบ Raw Tx', 65, qrBoxY + 64);
    ctx.fillText('บน Public Block Explorer (BscScan / TronScan / PolygonScan) ได้ทันที', 65, qrBoxY + 84);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px "Leelawadee UI Bold", Tahoma, sans-serif';
    ctx.fillText('IMMUTABLE • BINANCE MASTER SAPI • INSTANT CONFIRMED', 65, qrBoxY + 116);

    // 8. Footer
    ctx.fillStyle = '#b45309';
    ctx.font = '11px "Leelawadee UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAYOMBØYZ EXECUTIVE AUTOMATED ENGINE • SECURED BY BINANCE MASTER LIQUIDITY', width / 2, height - 34);

    return canvas.toBuffer('image/png');
  }
}
