'use strict';

// ============================================================
//  WhatsApp Order Bot  —  Single-file, production ready
//  QR: visit your Railway domain to scan
// ============================================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode               = require('qrcode');
const http                 = require('http');
const fs                   = require('fs');
const path                 = require('path');

// ─── CONFIG ─────────────────────────────────────────────────
const OWNER_NUMBER = '923488186229@c.us';
const ORDERS_FILE  = path.join(__dirname, 'orders.json');
const PORT         = process.env.PORT || 3000;
const SESSION_TTL  = 30 * 60 * 1000;   // 30 min idle = session clear
const RECONNECT_MS = 5_000;
// ────────────────────────────────────────────────────────────

// ─── MENU ───────────────────────────────────────────────────
const MENU = [
  { id: '1', name: 'Single Without Kabab',  price: 470 },
  { id: '2', name: 'Special',               price: 740 },
  { id: '3', name: 'Special Without Kabab', price: 640 },
  { id: '4', name: 'Pulao Kabab',           price: 390 },
  { id: '5', name: 'Pulao',                 price: 290 },
  { id: '6', name: 'Single',                price: 570 },
  { id: '7', name: 'Zarda',                 price: 200 },
  { id: '8', name: 'Shami Kabab 12 Pcs',    price: 600 },
];
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

// ─── TEXT HELPERS ────────────────────────────────────────────
function formatMenu() {
  let t = '🍽️ *Hamara Menu*\n━━━━━━━━━━━━━━━━━\n';
  for (const item of MENU) {
    t += `*${item.id}.* ${item.name} — *PKR ${item.price}*\n`;
  }
  t += '━━━━━━━━━━━━━━━━━\n';
  t += '📌 Item number bhejein — jaise *1* ya *2,5*\n';
  t += '❌ Cancel karne ke liye: *cancel*';
  return t;
}

function buildCart(cart) {
  let total = 0;
  let t = '🛒 *Aapka Cart:*\n━━━━━━━━━━━━━━━━━\n';
  for (const item of cart) {
    const sub = item.qty * item.price;
    t += `• ${item.qty}x ${item.name}\n`;
    t += `  PKR ${item.price} × ${item.qty} = *PKR ${sub}*\n`;
    total += sub;
  }
  t += `━━━━━━━━━━━━━━━━━\n💰 *Total: PKR ${total}*`;
  return { text: t, total };
}
// ────────────────────────────────────────────────────────────

// ─── ORDER PERSISTENCE ──────────────────────────────────────
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
let currentQR  = null;
let botReady   = false;

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
    p{color:#555;font-size:.95rem;line-height:1.5;margin-bottom:20px}
    img{border-radius:12px;border:3px solid #25D366;width:260px}
    .badge{display:inline-block;background:#25D366;color:#fff;
           border-radius:999px;padding:6px 18px;font-size:.85rem;margin-top:16px}
    .warn{color:#e67e22}
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
      <span class="badge">🟢 Connected</span>
    `));
    return;
  }

  if (!currentQR) {
    res.end(HTML(`
      <h1>⏳ Starting Up…</h1>
      <p>QR code generate ho raha hai.<br/>
         <strong>10-15 seconds</strong> baad page refresh karein.</p>
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
      <span class="badge">Scan karein — 60 sec valid hai</span>
      <p style="margin-top:16px;font-size:.8rem;color:#999">
        Auto-refresh in 30s
      </p>
      <script>setTimeout(()=>location.reload(),30000)</script>
    `));
  } catch (err) {
    res.end(HTML(`<h1 class="warn">QR Error</h1><p>${err.message}</p>`));
  }
});

server.listen(PORT, () => {
  console.log(`🌐 QR server running on port ${PORT}`);
});
// ────────────────────────────────────────────────────────────

// ─── WHATSAPP CLIENT ────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  },
});

client.on('qr', (qr) => {
  currentQR = qr;
  botReady  = false;
  console.log('📱 QR ready — open your Railway domain to scan');
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
  // Ignore groups & status broadcasts
  const chat = await msg.getChat();
  if (chat.isGroup) return;
  if (msg.from === 'status@broadcast') return;

  const from    = msg.from;
  const body    = (msg.body || '').trim();
  const session = getSession(from);

  if (!body) return;

  try {

    // ── GLOBAL: reset triggers ──────────────────────────────
    if (/^(hi|hello|salam|assalam|start|menu|order)$/i.test(body)) {
      resetSession(from);
      getSession(from).step = 'browsing';
      await msg.reply(`Assalam-o-Alaikum! 👋\nKhush Amdeed!\n\n${formatMenu()}`);
      return;
    }

    // ── GLOBAL: cancel ──────────────────────────────────────
    if (/^cancel$/i.test(body)) {
      resetSession(from);
      await msg.reply(
        '❌ *Order cancel ho gaya.*\n\nDobara order karne ke liye *menu* likhein. 😊'
      );
      return;
    }

    // ── STEP: browsing ──────────────────────────────────────
    if (session.step === 'browsing' || session.step === 'confirm_more') {

      // "done" — proceed to checkout
      if (session.step === 'confirm_more' && /^done$/i.test(body)) {
        if (!session.cart.length) {
          session.step = 'browsing';
          await msg.reply(`Cart khali hai!\n\n${formatMenu()}`);
          return;
        }
        session.step = 'ask_name';
        await msg.reply('👤 Apna *naam* bhejein:');
        return;
      }

      // parse item numbers
      const ids     = body.split(',').map(s => s.trim()).filter(Boolean);
      const valid   = ids.map(id => MENU.find(m => m.id === id)).filter(Boolean);
      const invalid = ids.filter(id => !MENU.find(m => m.id === id));

      if (!valid.length) {
        await msg.reply(
          '❓ Yeh number menu mein nahi hai.\n\nSahi number bhejein ya *menu* likhein.'
        );
        return;
      }

      for (const item of valid) {
        const ex = session.cart.find(c => c.id === item.id);
        if (ex) ex.qty++;
        else session.cart.push({ ...item, qty: 1 });
      }

      session.step = 'confirm_more';
      const { text } = buildCart(session.cart);

      let reply = text;
      if (invalid.length) reply += `\n\n⚠️ Yeh number menu mein nahi: *${invalid.join(', ')}*`;
      reply += '\n\n➕ Aur items add karein\n✅ Order aage badhane ke liye: *done*';

      await msg.reply(reply);
      return;
    }

    // ── STEP: ask_name ──────────────────────────────────────
    if (session.step === 'ask_name') {
      if (body.length < 2) {
        await msg.reply('⚠️ Kripya apna sahi *naam* likhein.');
        return;
      }
      session.name = body;
      session.step = 'ask_address';
      await msg.reply('📍 Delivery *address* bhejein:\n(Gali, Muhalla, City)');
      return;
    }

    // ── STEP: ask_address ───────────────────────────────────
    if (session.step === 'ask_address') {
      if (body.length < 5) {
        await msg.reply('⚠️ Thoda detail mein *address* likhein please.');
        return;
      }
      session.address = body;
      session.step    = 'ask_phone';
      await msg.reply('📞 Apna *contact number* bhejein:');
      return;
    }

    // ── STEP: ask_phone ─────────────────────────────────────
    if (session.step === 'ask_phone') {
      if (!/^[0-9+\s\-]{10,15}$/.test(body)) {
        await msg.reply('⚠️ Sahi *phone number* bhejein\n(Jaise: 03001234567)');
        return;
      }
      session.phone = body;
      session.step  = 'final_confirm';

      const { text, total } = buildCart(session.cart);
      await msg.reply(
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
        await msg.reply('Confirm karne ke liye *yes* likhein\nCancel ke liye *cancel* likhein.');
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

      // Confirm to customer
      await msg.reply(
        `🎉 *Order Confirm Ho Gaya!*\n\n` +
        `🆔 Order ID: *${order.orderId}*\n` +
        `💰 Total: *PKR ${total}*\n\n` +
        `⏳ Aapka order jald deliver ho ga.\n` +
        `Shukriya! 🙏`
      );

      // Notify owner
      const ownerMsg =
        `🔔 *Naya Order Aya!*\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `🆔 ${order.orderId}\n` +
        `👤 ${order.name}\n` +
        `📞 ${order.phone}\n` +
        `📍 ${order.address}\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        order.items.map(i => `• ${i.qty}x ${i.name} = PKR ${i.qty * i.price}`).join('\n') +
        `\n━━━━━━━━━━━━━━━━━\n` +
        `💰 *Total: PKR ${total}*\n` +
        `🕐 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`;

      try {
        await client.sendMessage(OWNER_NUMBER, ownerMsg);
        console.log(`✅ Owner notified — ${order.orderId}`);
      } catch (err) {
        console.error('❌ Owner notification failed:', err.message);
      }

      resetSession(from);
      return;
    }

    // ── DEFAULT (idle) ──────────────────────────────────────
    await msg.reply(
      'Assalam-o-Alaikum! 👋\n\nOrder karne ke liye *menu* likhein. 😊'
    );

  } catch (err) {
    console.error('Message handler error:', err);
  }
});
// ────────────────────────────────────────────────────────────

client.initialize();
