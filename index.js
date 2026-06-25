'use strict';

// ============================================================
//  WhatsApp Order Bot  —  Production Ready
//  QR: visit your Railway domain to scan
// ============================================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode               = require('qrcode');
const http                 = require('http');
const fs                   = require('fs');
const path                 = require('path');

// ─── CONFIG ─────────────────────────────────────────────────
const OWNER_NUMBER  = '923488186229@c.us';
const ORDERS_FILE   = path.join(__dirname, 'orders.json');
const PORT          = process.env.PORT || 3000;
const SESSION_TTL   = 30 * 60 * 1000;  // 30 min idle → session clear
const RECONNECT_MS  = 5_000;

// Delay between bot replies (prevents WhatsApp ban)
const REPLY_DELAY_MIN = 1500;  // ms
const REPLY_DELAY_MAX = 3000;  // ms
// ────────────────────────────────────────────────────────────

// ─── MENU (from restaurant image) ───────────────────────────
const MENU = [
  { id: '1',  name: 'Chicken Roast (Full)',  price: 1350, desc: 'One Roasted Chicken with Ketchup & Fresh Lemons' },
  { id: '2',  name: 'Chicken Roast (Half)',  price: 700,  desc: 'One Roasted Chicken with Ketchup & Fresh Lemons' },
  { id: '3',  name: 'Shami Kabab (12 Pcs)', price: 600,  desc: 'Served with fresh Salad and traditional Raita' },
  { id: '4',  name: 'Chicken Piece',        price: 180,  desc: 'Steam Piece 1/8 — Chest, Leg, Thigh or Wing' },
  { id: '5',  name: 'Salad',                price: 20,   desc: '' },
  { id: '6',  name: 'Raita',                price: 20,   desc: '' },
  { id: '7',  name: 'Kheer',                price: 180,  desc: '' },
  { id: '8',  name: 'Zarda',                price: 180,  desc: 'Traditional Colourful Rice Sweet Dish with Chamcham & Raisins' },
];
// ────────────────────────────────────────────────────────────

// ─── HELPERS ────────────────────────────────────────────────
function randomDelay() {
  const ms = Math.floor(Math.random() * (REPLY_DELAY_MAX - REPLY_DELAY_MIN + 1)) + REPLY_DELAY_MIN;
  return new Promise(r => setTimeout(r, ms));
}

function formatMenu() {
  let t = '🍽️ *Menu*\n━━━━━━━━━━━━━━━━━\n';
  for (const item of MENU) {
    t += `*${item.id}.* ${item.name} — *Rs. ${item.price}*`;
    if (item.desc) t += `\n    _${item.desc}_`;
    t += '\n';
  }
  t += '━━━━━━━━━━━━━━━━━\n';
  t += '📌 Item number bhejein — jaise *1* ya *2,4*\n';
  t += '❌ Cancel: *cancel*';
  return t;
}

function buildCart(cart) {
  let total = 0;
  let t = '🛒 *Aapka Cart:*\n━━━━━━━━━━━━━━━━━\n';
  for (const item of cart) {
    const sub = item.qty * item.price;
    t += `• ${item.qty}x ${item.name}\n`;
    t += `  Rs. ${item.price} × ${item.qty} = *Rs. ${sub}*\n`;
    total += sub;
  }
  t += `━━━━━━━━━━━━━━━━━\n💰 *Total: Rs. ${total}*`;
  return { text: t, total };
}
// ────────────────────────────────────────────────────────────

// ─── SESSION MANAGER ────────────────────────────────────────
const sessions = new Map();

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL;
  for (const [id, s] of sessions) {
    if (s.lastSeen < cutoff) sessions.delete(id);
  }
}, 5 * 60 * 1000);

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      step: 'idle', cart: [],
      name: null, address: null, phone: null,
      lastSeen: Date.now(),
    });
  }
  const s = sessions.get(id);
  s.lastSeen = Date.now();
  return s;
}

function resetSession(id) {
  sessions.set(id, {
    step: 'idle', cart: [],
    name: null, address: null, phone: null,
    lastSeen: Date.now(),
  });
}
// ────────────────────────────────────────────────────────────

// ─── ORDER SAVE ─────────────────────────────────────────────
async function saveOrder(order) {
  let orders = [];
  try {
    orders = JSON.parse(await fs.promises.readFile(ORDERS_FILE, 'utf-8'));
  } catch { /* first run */ }
  orders.push(order);
  await fs.promises.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2));
}
// ────────────────────────────────────────────────────────────

// ─── QR WEB SERVER ──────────────────────────────────────────
let currentQR = null;
let botReady  = false;

const HTML = (body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>WhatsApp Bot — QR Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#f0f2f5;display:flex;
         align-items:center;justify-content:center;min-height:100vh}
    .card{background:#fff;border-radius:16px;padding:40px;text-align:center;
          box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;width:90%}
    h1{font-size:1.4rem;color:#111;margin-bottom:8px}
    p{color:#555;font-size:.95rem;line-height:1.6;margin-bottom:20px}
    img{border-radius:12px;border:3px solid #25D366;width:260px}
    .badge-green{display:inline-block;background:#25D366;color:#fff;
           border-radius:999px;padding:6px 18px;font-size:.85rem;margin-top:16px}
    .badge-orange{display:inline-block;background:#f39c12;color:#fff;
           border-radius:999px;padding:6px 18px;font-size:.85rem;margin-top:16px}
  </style>
</head>
<body><div class="card">${body}</div></body>
</html>`;

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (botReady) {
    res.end(HTML(`
      <h1>✅ Bot Online</h1>
      <p>WhatsApp bot successfully connected.<br/>No action needed.</p>
      <span class="badge-green">🟢 Connected</span>
    `));
    return;
  }

  if (!currentQR) {
    res.end(HTML(`
      <h1>⏳ Starting Up…</h1>
      <p>QR code generate ho raha hai.<br/>
         <strong>10–15 seconds</strong> mein page refresh karein.</p>
      <span class="badge-orange">🟡 Initializing</span>
      <script>setTimeout(()=>location.reload(),10000)</script>
    `));
    return;
  }

  try {
    const imgSrc = await qrcode.toDataURL(currentQR, { scale: 6 });
    res.end(HTML(`
      <h1>📱 Scan to Connect</h1>
      <p>WhatsApp → <strong>Linked Devices</strong> → Link a Device</p>
      <img src="${imgSrc}" alt="WhatsApp QR Code"/>
      <br/>
      <span class="badge-green">Scan karein — 60 sec valid</span>
      <p style="margin-top:14px;font-size:.8rem;color:#aaa">Auto-refresh in 30s</p>
      <script>setTimeout(()=>location.reload(),30000)</script>
    `));
  } catch (err) {
    res.end(HTML(`<h1>QR Error</h1><p>${err.message}</p>`));
  }
});

server.listen(PORT, () => console.log(`🌐 QR server running on port ${PORT}`));
// ────────────────────────────────────────────────────────────

// ─── WHATSAPP CLIENT ────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas',
      '--disable-gpu', '--no-first-run', '--no-zygote',
      '--single-process', '--disable-extensions',
      '--disable-background-networking', '--disable-default-apps',
      '--disable-sync', '--hide-scrollbars', '--mute-audio',
    ],
  },
});

client.on('qr', (qr) => {
  currentQR = qr;
  botReady  = false;
  console.log('📱 QR ready — open Railway domain to scan');
});

client.on('ready', () => {
  currentQR = null;
  botReady  = true;
  console.log('✅ Bot connected and ready!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failed:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️  Disconnected:', reason);
  botReady  = false;
  currentQR = null;
  setTimeout(() => client.initialize(), RECONNECT_MS);
});
// ────────────────────────────────────────────────────────────

// ─── MESSAGE HANDLER ────────────────────────────────────────
client.on('message', async (msg) => {
  const chat = await msg.getChat();
  if (chat.isGroup) return;
  if (msg.from === 'status@broadcast') return;

  const from    = msg.from;
  const body    = (msg.body || '').trim();
  const session = getSession(from);

  if (!body) return;

  // Helper: delay then reply (prevents ban)
  const reply = async (text) => {
    await randomDelay();
    await msg.reply(text);
  };

  try {

    // ── GLOBAL: start / menu ────────────────────────────────
    if (/^(hi|hello|salam|assalam|start|menu|order)$/i.test(body)) {
      resetSession(from);
      getSession(from).step = 'browsing';
      await reply(`Assalam-o-Alaikum! 👋 Khush Amdeed!\n\n${formatMenu()}`);
      return;
    }

    // ── GLOBAL: cancel ──────────────────────────────────────
    if (/^cancel$/i.test(body)) {
      resetSession(from);
      await reply('❌ *Order cancel ho gaya.*\n\nDobara order ke liye *menu* likhein. 😊');
      return;
    }

    // ── STEP: browsing / confirm_more ───────────────────────
    if (session.step === 'browsing' || session.step === 'confirm_more') {

      if (session.step === 'confirm_more' && /^done$/i.test(body)) {
        if (!session.cart.length) {
          session.step = 'browsing';
          await reply(`Cart khali hai!\n\n${formatMenu()}`);
          return;
        }
        session.step = 'ask_name';
        await reply('👤 Apna *naam* bhejein:');
        return;
      }

      const ids   = body.split(',').map(s => s.trim()).filter(Boolean);
      const valid = ids.map(id => MENU.find(m => m.id === id)).filter(Boolean);
      const bad   = ids.filter(id => !MENU.find(m => m.id === id));

      if (!valid.length) {
        await reply('❓ Yeh number menu mein nahi hai.\nSahi number bhejein ya *menu* likhein.');
        return;
      }

      for (const item of valid) {
        const ex = session.cart.find(c => c.id === item.id);
        if (ex) ex.qty++;
        else session.cart.push({ ...item, qty: 1 });
      }

      session.step = 'confirm_more';
      const { text } = buildCart(session.cart);
      let r = text;
      if (bad.length) r += `\n\n⚠️ Menu mein nahi: *${bad.join(', ')}*`;
      r += '\n\n➕ Aur items add karein\n✅ Checkout ke liye: *done*';
      await reply(r);
      return;
    }

    // ── STEP: ask_name ──────────────────────────────────────
    if (session.step === 'ask_name') {
      if (body.length < 2) { await reply('⚠️ Sahi *naam* likhein please.'); return; }
      session.name = body;
      session.step = 'ask_address';
      await reply('📍 Delivery *address* bhejein:\n(Gali, Muhalla, City)');
      return;
    }

    // ── STEP: ask_address ───────────────────────────────────
    if (session.step === 'ask_address') {
      if (body.length < 5) { await reply('⚠️ Thoda detail mein *address* likhein.'); return; }
      session.address = body;
      session.step    = 'ask_phone';
      await reply('📞 Apna *contact number* bhejein:');
      return;
    }

    // ── STEP: ask_phone ─────────────────────────────────────
    if (session.step === 'ask_phone') {
      if (!/^[0-9+\s\-]{10,15}$/.test(body)) {
        await reply('⚠️ Sahi *phone number* bhejein\n(Jaise: 03001234567)');
        return;
      }
      session.phone = body;
      session.step  = 'final_confirm';
      const { text, total } = buildCart(session.cart);
      await reply(
        `📋 *Order Summary*\n\n${text}\n\n` +
        `👤 Naam:    *${session.name}*\n` +
        `📍 Address: *${session.address}*\n` +
        `📞 Phone:   *${session.phone}*\n\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `✅ Confirm: *yes*\n❌ Cancel:  *cancel*`
      );
      return;
    }

    // ── STEP: final_confirm ─────────────────────────────────
    if (session.step === 'final_confirm') {
      if (!/^(yes|haan|ji|confirm|ok|okay|ha)$/i.test(body)) {
        await reply('Confirm ke liye *yes* likhein\nCancel ke liye *cancel* likhein.');
        return;
      }

      const { total } = buildCart(session.cart);
      const order = {
        orderId:       'ORD' + Date.now(),
        customerPhone: from,
        name:          session.name,
        address:       session.address,
        phone:         session.phone,
        items:         session.cart,
        total,
        timestamp:     new Date().toISOString(),
        status:        'pending',
      };

      await saveOrder(order);

      await reply(
        `🎉 *Order Confirm Ho Gaya!*\n\n` +
        `🆔 Order ID: *${order.orderId}*\n` +
        `💰 Total: *Rs. ${total}*\n\n` +
        `⏳ Aapka order jald deliver ho ga.\n` +
        `Shukriya! 🙏`
      );

      // Notify owner
      const ownerMsg =
        `🔔 *Naya Order!*\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `🆔 ${order.orderId}\n` +
        `👤 ${order.name}\n` +
        `📞 ${order.phone}\n` +
        `📍 ${order.address}\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        order.items.map(i => `• ${i.qty}x ${i.name} = Rs. ${i.qty * i.price}`).join('\n') +
        `\n━━━━━━━━━━━━━━━━━\n` +
        `💰 *Total: Rs. ${total}*\n` +
        `🕐 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`;

      try {
        await randomDelay();
        await client.sendMessage(OWNER_NUMBER, ownerMsg);
        console.log(`✅ Owner notified — ${order.orderId}`);
      } catch (err) {
        console.error('❌ Owner notify fail:', err.message);
      }

      resetSession(from);
      return;
    }

    // ── DEFAULT ─────────────────────────────────────────────
    await reply('Assalam-o-Alaikum! 👋\nOrder ke liye *menu* likhein. 😊');

  } catch (err) {
    console.error('Message handler error:', err);
  }
});
// ────────────────────────────────────────────────────────────

client.initialize();
