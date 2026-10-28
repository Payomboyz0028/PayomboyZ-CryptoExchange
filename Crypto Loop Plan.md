# Crypto Loop Plan: สรุปลูปการทำงานระบบแลกเงิน ThaiBank to Binance / Crypto

เอกสารฉบับนี้สรุปโฟลว์การทำงานใน 1 รอบบิล (1 Complete Transaction Loop), การเชื่อมโยง 3 แกนหลักของระบบ, ตาราง Tech Stack Checklist ทั้งหมด และข้อมูลกระเป๋าเงิน (Wallet Addresses & API Keys) ที่จำเป็นต้องใช้ในการดำเนินงาน

---

## 1. สรุปโฟลว์การทำงานใน 1 ลูป (1 Complete Transaction Loop)

ลูปนี้เริ่มตั้งแต่ลูกค้ากดสั่งซื้อ จนถึงวินาทีที่เหรียญวิ่งเข้ากระเป๋าลูกค้า และบอทส่งสลิปพร้อมลิงก์ Block Explorer ปิดงานอัตโนมัติ:

```text
[1. เปิดบิล & ล็อกเรท]
  ลูกค้าเลือกเหรียญ (USDT BEP-20, TRC-20, Polygon หรือ LTC) + ระบุยอดเงินบาท + วาง Address ปลายทาง
  └──> Backend ตรวจสอบ Format ของ Address ว่าถูกต้องตามเชนไหม (EVM / TRON / LTC Validator)
  └──> ดึงเรทราคาตลาดแบบสด (Binance/Bitkub API) + บวกส่วนต่างกำไร (Spread Margin)
  └──> เจน Dynamic PromptPay QR Code ระบุยอดเงินบาทเป๊ะๆ (ล็อกเรท 5 นาที) บันทึกสถานะ PENDING_PAYMENT

[2. โอนเงิน & ตรวจสลิป]
  ลูกค้าสแกนจ่ายเงินผ่านแอปธนาคาร แล้วส่งรูปสลิปเข้าห้องแชท Discord
  └──> บอทส่งรูปไปให้ EasySlip API ถอดข้อมูล QR และถอดรหัสข้อมูลสลิป
  └──> Backend ตรวจสอบเงื่อนไขเหล็ก 4 ข้อ:
       1. transRef นี้เคยใช้หรือยัง? (ตรวจสอบในฐานข้อมูล ป้องกันการนำสลิปเก่ามาใช้ซ้ำ)
       2. เลขบัญชีผู้รับในสลิป ตรงกับบัญชีร้านไหม? (ป้องกันการส่งสลิปโอนไปหาบุคคลอื่น)
       3. ยอดเงินในสลิป ตรงกับยอดในบิลเป๊ะไหม? (ป้องกันการโอนเงินขาด)
       4. เวลาโอนในสลิป เกิดขึ้นหลังเวลาเปิดบิลไหม? (ป้องกันสลิปเก่าที่โอนไว้นานแล้ว)

[3. ส่งคำสั่งเข้าคิว (Queueing)]
  เมื่อสลิปผ่านการตรวจสอบ 100%
  └──> Backend บันทึก transRef ลงฐานข้อมูล (Database Unique Index) และเปลี่ยนสถานะบิลเป็น QUEUED_FOR_PAYOUT
  └──> โยนข้อมูลงาน (Order ID, Network, Address ลูกค้า, จำนวนเหรียญ) เข้า Redis Queue (BullMQ)

[4. ดึงคิว & เซ็นธุรกรรม (Signing & Broadcasting)]
  Hot Wallet Worker ดึงงานออกจากคิวทีละ 1 รายการตามลำดับก่อน-หลัง (Strict FIFO, Concurrency: 1)
  └──> Worker ดึง Private Key จากระบบ Key Management มาสร้าง Raw Transaction ในหน่วยความจำ (Memory)
  └──> กรณี USDT (EVM / TRON): สร้างคำสั่งเรียก Smart Contract ฟังก์ชัน transfer(recipient, amount)
  └──> กรณี LTC (UTXO): ดึงรายการ Unspent Outputs มารวมยอด หักค่า Mining Fee (Sat/vByte) และสร้าง PSBT Transaction
  └──> เซ็นกำกับธุรกรรม (Sign Transaction) ภายในเครื่องเซิร์ฟเวอร์ แล้วส่งผ่าน Web3 RPC Node ขึ้นสู่บล็อกเชน

[5. ยืนยันผล & ปิดงาน]
  บล็อกเชนรับคำสั่งและส่งกลับ Transaction Hash (TxID)
  └──> Worker บันทึก TxID ลงฐานข้อมูล และรอ 1-2 Block Confirmations
  └──> อัปเดตสถานะบิลเป็น COMPLETED
  └──> บอทส่ง Embed แจ้งโอนสำเร็จ พร้อมแนบปุ่มลิงก์เช็คธุรกรรมบนบล็อกเชน (BscScan / TronScan / Blockchair) ให้ลูกค้าทันที
```

---

## 2. การเชื่อมโยงระหว่าง 3 แกนหลักของระบบ

เพื่อให้ระบบทำงานอัตโนมัติ 100% โดยที่เงินไม่รั่ว บอทไม่ค้าง และไม่มีการชนกันของ Nonce ระบบแบ่งหน้าที่ออกเป็น 3 แกนหลัก:

```text
+-----------------------+       +-----------------------+       +-----------------------+
|   1. BACKEND ENGINE   |       |   2. KEY MANAGEMENT   |       |  3. WEB3 RPC / NODE   |
| (Node.js + BullMQ/DB) |       |  (Env AES / KMS Vault)|       | (QuickNode / Tatum)   |
+-----------+-----------+       +-----------+-----------+       +-----------+-----------+
            |                               |                               |
            |--- (1) ขอ Private Key / Sign ->|                               |
            |<-- (2) คืนค่า Signed Raw Tx ----|                               |
            |                                                               |
            |--- (3) ส่ง Signed Raw Tx (Broadcast) ผ่าน HTTPS/WSS ----------->|
            |<-- (4) คืนค่า Transaction Hash (TxID) & Block Receipt ----------|
```

### 2.1 Backend Engine (สมองกลและตัวคุมจังหวะ)
* **บทบาท:** เป็นตัวกลางสื่อสารกับ Discord Bot, เรียก API ของ EasySlip, บันทึกข้อมูลลงฐานข้อมูล และควบคุมจังหวะการจ่ายเงิน
* **วิธีเชื่อมกับส่วนอื่น:**
  * Backend จะ **ไม่ยิงบล็อกเชนตรงๆ จาก Event Handler ของ Discord** เพราะหากเครือข่ายบล็อกเชนหน่วง จะทำให้ Discord Bot ค้างและ Timeout (Discord กำหนดให้ตอบกลับภายใน 3 วินาที)
  * Backend จะส่งคำสั่งเข้าคิว **Redis (BullMQ)** แล้วให้ Payout Worker ที่ทำงานอยู่เบื้องหลังเป็นผู้ดึงงานไปประมวลผลทีละคำสั่ง (`concurrency: 1`) เพื่อป้องกันปัญหา Nonce Collision เมื่อมีผู้ใช้หลายคนส่งสลิปเข้ามาพร้อมกันในวินาทีเดียวกัน

### 2.2 Key Management (ตู้เซฟเก็บกุญแจ)
* **บทบาท:** เก็บรักษา Private Key ของกระเป๋าเงิน Hot Wallet อย่างปลอดภัย และทำหน้าที่เซ็นกำกับธุรกรรม (Cryptographic Signing) โดยไม่ให้ Key รั่วไหลออกสู่ภายนอก
* **วิธีเชื่อมกับ Backend & RPC:**
  * **กฎเหล็กด้านความปลอดภัย:** ระบบจะ **ไม่ส่ง Private Key ไปให้ RPC Node ภายนอกโดยเด็ดขาด**
  * Payout Worker จะดึงข้อมูลแวดล้อมจาก RPC มาก่อน (เช่น ค่า Gas ปัจจุบัน, Nonce ล่าสุด, หรือรายการ UTXO)
  * จากนั้นนำข้อมูลแวดล้อมมารวมกับ Private Key ใน Memory ฝั่ง Key Management เพื่อคำนวณสมการคณิตศาสตร์ (ECDSA / Schnorr) ออกมาเป็น **Signed Raw Transaction (ข้อความ Hex ยาวๆ ที่เซ็นแล้ว)** แล้วส่งเฉพาะข้อความ Hex นี้ไปยัง RPC Node

### 2.3 Blockchain Node / Web3 RPC (ประตูเชื่อมสู่โลกบล็อกเชน)
* **บทบาท:** เกตเวย์ในการอ่านสถานะบล็อกเชน และป่าวประกาศ (Broadcast) ธุรกรรมที่เซ็นแล้วขึ้นสู่เครือข่าย
* **วิธีเชื่อมกับ Backend:**
  * เชื่อมต่อผ่าน HTTPS หรือ WebSocket RPC URL โดยใช้ไลบรารีอย่าง `ethers.js` (สำหรับ BSC/Polygon/ETH), `TronWeb` (สำหรับ TRON) หรือ REST Indexer (สำหรับ LTC)
  * หน้าที่ของ RPC ในลูปนี้มีเพียง 3 ประการ:
    1. อ่านยอดคงเหลือและค่าธรรมเนียม Gas ปัจจุบัน (`eth_getBalance`, `eth_gasPrice`, `eth_getTransactionCount`)
    2. รับ Signed Raw Transaction ไปกระจายในเครือข่าย (`eth_sendRawTransaction` หรือ `trx/sendrawtransaction`)
    3. ส่งคืนสถานะยืนยันว่าธุรกรรมถูกบรรจุลงบล็อกเรียบร้อยแล้ว (`eth_getTransactionReceipt`)

---

## 3. สรุประบบและเครื่องมือทั้งหมดที่ต้องใช้ (Tech Stack Checklist)

| หมวดหมู่ระบบ | เครื่องมือ / บริการที่ใช้ | หน้าที่ในระบบบอท |
|---|---|---|
| **Frontend / UI** | `Discord.js (v14)` หรือ Web Storefront | หน้าต่างรับคำสั่งซื้อ, เมนู Dropdown เลือกเหรียญ, Modal รับที่อยู่กระเป๋า, แสดง QR Code และรับรูปสลิป |
| **Fiat Payment & Slip** | `promptpay-qr` + `EasySlip API (v2)` | เจน PromptPay QR Code ตามยอดบิลเป๊ะๆ และตรวจความถูกต้องของสลิปโอนเงิน |
| **Price Feed API** | `Binance Public API` หรือ `Bitkub API` | ดึงราคาเหรียญสดแบบ Real-time (USDT/THB, LTC/THB) มาคำนวณเรทที่บวกกำไรแล้ว |
| **Backend & Database** | `Node.js (TypeScript)` + `Prisma` + `PostgreSQL / SQLite` | ประมวลผลลอจิก, บริหารยอดเครดิตผู้ใช้, และล็อกค่า `transRef` กันสลิปซ้ำระดับฐานข้อมูล |
| **Queue System** | `Redis` + `BullMQ` | เรียงคิวคำสั่งโอนเหรียญทีละรายการ (`concurrency: 1`) ป้องกัน Nonce ชนกันและการจ่ายเหรียญซ้ำ |
| **Web3 Libraries** | `ethers.js (v6)` + `TronWeb` + `bitcoinjs-lib` | สร้างคำสั่งโอนเหรียญ, คำนวณค่าแก๊ส, และ Sign ธุรกรรมด้วย Private Key ในเครื่องเซิร์ฟเวอร์ |
| **RPC Node Providers** | `QuickNode` / `Ankr` / `Alchemy` (BSC/EVM), `TronGrid` (TRON), `BlockCypher` / `Tatum` (LTC) | โหนดตัวกลางสำหรับส่งคำสั่งโอนที่เซ็นเสร็จแล้วขึ้นสู่เครือข่ายบล็อกเชนจริง |
| **Key Security** | `AES-256-GCM Encrypted .env` หรือ `Cloud KMS` | เข้ารหัสป้องกัน Private Key ของกระเป๋า Hot Wallet บนเซิร์ฟเวอร์ ไม่เก็บเป็น Plaintext |

---

## 4. ข้อมูลกระเป๋าเงินและบัญชีที่ต้องเตรียม (Required Addresses & Credentials)

ในการเชื่อมต่อระบบรับเงินไทยเข้ากระเป๋า Binance / Crypto ข้อมูลที่ dj ต้องเตรียมแบ่งออกเป็น 3 ส่วนหลักดังนี้:

### 4.1 ฝั่งรับเงินบาท (Thai Baht / PromptPay)
ใช้สำหรับสร้าง Dynamic PromptPay QR Code และให้ EasySlip ตรวจสอบความถูกต้อง:
1. **หมายเลขพร้อมเพย์ (PromptPay ID):** เบอร์โทรศัพท์ หรือ เลขบัตรประชาชน หรือ เลขประจำตัวผู้เสียภาษี ที่ผูกกับพร้อมเพย์บัญชีร้านของ dj
2. **เลขที่บัญชีธนาคาร (Bank Account Number):** เลขที่บัญชีธนาคารของ dj (เช่น ธนาคารไทยพาณิชย์ SCB, กสิกรไทย KBANK)
3. **ชื่อบัญชีผู้รับเงิน (Account Name):** ชื่อ-นามสกุล ทั้งภาษาไทยและภาษาอังกฤษ ตามที่ปรากฏในสลิปโอนเงิน
4. **EasySlip API Token:** กุญแจ API จาก `developer.easyslip.com`

---

### 4.2 ฝั่งกระเป๋า Binance ของ dj (สำหรับรับเงินกำไร / สต็อกเหรียญ)
ใช้เป็น **Deposit Address (กระเป๋าปลายทาง)** เพื่อรับกำไร หรือกรณีให้บอทโยกเหรียญส่วนเกินจากระบบเข้า Binance (Cold Storage Sweep):
1. **Binance USDT Deposit Address (BNB Smart Chain / BEP-20):**  
   - ที่อยู่กระเป๋า USDT บนเครือข่าย BSC (ขึ้นต้นด้วย `0x...`) ดึงได้จากแอป Binance: `Deposit` -> `Deposit Crypto` -> เลือก `USDT` -> เลือกเครือข่าย `BNB Smart Chain (BEP20)`
2. **Binance USDT Deposit Address (TRON / TRC-20):**  
   - ที่อยู่กระเป๋า USDT บนเครือข่าย TRON (ขึ้นต้นด้วย `T...`) ดึงจาก Binance: เลือกเครือข่าย `TRON (TRC20)`
3. **Binance LTC Deposit Address (Litecoin):**  
   - ที่อยู่กระเป๋า LTC (ขึ้นต้นด้วย `ltc1...` หรือ `L...`) ดึงจาก Binance: เลือก `LTC` -> เครือข่าย `Litecoin`

*(หมายเหตุ: หาก dj ต้องการใช้ฟังก์ชันให้บอท **สั่งถอนเหรียญออกจาก Binance อัตโนมัติด้วย API** จะต้องใช้ **Binance API Key** และ **API Secret** ที่เปิดสิทธิ์ "Enable Withdrawals" ร่วมกับ IP Whitelist ของเซิร์ฟเวอร์)*

---

### 4.3 ฝั่งกระเป๋า Hot Wallet บนเซิร์ฟเวอร์ (บอทสร้างขึ้นมาเพื่อโอนเหรียญให้ลูกค้าแบบอัตโนมัติ)
บอทจะทำการสร้าง Keypair บนเครื่องเซิร์ฟเวอร์สำหรับกระจายเหรียญให้ลูกค้าอย่างรวดเร็ว (ไม่ต้องรอ Exchange อนุมัติ):
1. **กระเป๋า EVM Hot Wallet (สำหรับ BSC BEP-20, Polygon, Arbitrum):**
   - Address ขึ้นต้นด้วย `0x...`
   - **สิ่งที่ต้องเติมเข้ากระเป๋านี้:** เหรียญ **BNB** เล็กน้อย (ประมาณ `0.05 - 0.1 BNB` ~ 500-1,000 บาท) ไว้เป็นค่า Gas ในการโอน และเหรียญ **USDT (BEP-20)** ตามยอดที่ต้องการเปิดรับแลก
2. **กระเป๋า TRON Hot Wallet (สำหรับ TRON TRC-20):**
   - Address ขึ้นต้นด้วย `T...`
   - **สิ่งที่ต้องเติมเข้ากระเป๋านี้:** เหรียญ **TRX** (ประมาณ `50 - 100 TRX`) ไว้เป็นค่า Gas ในการโอนเหรียญ TRC-20 และเหรียญ **USDT (TRC-20)**
3. **กระเป๋า Litecoin Hot Wallet (สำหรับ LTC Native SegWit):**
   - Address ขึ้นต้นด้วย `ltc1...`
   - **สิ่งที่ต้องเติมเข้ากระเป๋านี้:** เหรียญ **LTC** (ประมาณ `0.5 - 2 LTC`) ซึ่งใช้เป็นทั้งเงินที่โอนและค่า Mining Fee ในตัว

---

## 5. ขอบเขตการพัฒนาในโฟลเดอร์ `@CryptoPayment`

โค้ดโปรแกรมทั้งหมดของระบบบอทรับแลกเงินนี้จะถูกสร้างและจัดเก็บไว้ภายในไดเรกทอรี:
`d:\Deobfuscate\CryptoPayment\` เท่านั้น

```text
d:\Deobfuscate\CryptoPayment/
├── Crypto Loop Plan.md           # เอกสารสรุปลูปและสถาปัตยกรรม (ไฟล์นี้)
├── package.json                  # Dependencies ของระบบ
├── tsconfig.json                 # TypeScript Configuration
├── .env.example                  # Template ตัวแปรแวดล้อม
├── prisma/
│   └── schema.prisma             # โครงสร้างฐานข้อมูล ออเดอร์ เครดิต และสลิป
├── src/
│   ├── index.ts                  # Entry point ของ Discord Bot
│   ├── worker.ts                 # Entry point ของ Hot Wallet Payout Worker
│   ├── bot/                      # Panels, Modals, Handlers
│   ├── services/                 # EasySlip, Rate Engine, Queue Service
│   └── wallets/                  # EVM, TRON, LTC Signers
└── tests/                        # สคริปต์ทดสอบบน Testnet
```
