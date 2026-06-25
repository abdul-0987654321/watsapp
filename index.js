// ====== INDEX.JS — Entry Point ======
// Sirf setup aur event listeners yahan hain

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode                = require('qrcode-terminal');
const QRCode                = require('qrcode');
const express               = require('express');
const path                  = require('path');

const { handleMessage } = require('./src/handler');

// ── QR Web Viewer (Railway ke liye) ──────────────────────────
let currentQR = null;
const app     = express();
const PORT    = process.env.PORT || 3000;

app.get('/', (req, res) => res.redirect('/qr'));

app.get('/qr', async (req, res) => {
  if (!currentQR) {
    return res.send(`
      <html><body style="text-align:center;font-family:sans-serif;padding:40px">
        <h2>✅ Bot Connected hai</h2>
        <p>QR ki zaroorat nahi — bot chal raha hai.</p>
        <p style="color:gray">Agar disconnected ho gaya toh page refresh karein.</p>
        <script>setTimeout(()=>location.reload(), 15000)</script>
      </body></html>
    `);
  }
  const qrImage = await QRCode.toDataURL(currentQR);
  res.send(`
    <html><body style="text-align:center;font-family:sans-serif;padding:40px">
      <h2>📱 WhatsApp QR Scan Karein</h2>
      <p>WhatsApp > Linked Devices > Link a Device</p>
      <img src="${qrImage}" style="max-width:300px" />
      <p style="color:gray">10 second baad auto-refresh hoga</p>
      <script>setTimeout(()=>location.reload(), 10000)</script>
    </body></html>
  `);
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.listen(PORT, () => console.log(`🌐 QR page: http://localhost:${PORT}/qr`));

// ── WhatsApp Client ───────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, 'session'),
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',          // Railway par memory bachata hai
      '--no-zygote',
    ],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 QR scan karein (/qr URL kholen):\n');
  qrcode.generate(qr, { small: true });
  currentQR = qr;
});

client.on('ready', () => {
  console.log('✅ Bot ready! Number:', client.info.wid._serialized);
  currentQR = null;
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth fail:', msg);
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Disconnect:', reason);
  console.log('🔄 5 second baad reconnect...');
  setTimeout(() => client.initialize(), 5000);
});

// ── Message event ─────────────────────────────────────────────
client.on('message', async (msg) => {
  try {
    await handleMessage(client, msg);
  } catch (err) {
    console.error('❌ Message handler error:', err.message);
  }
});

client.initialize();
