const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal'); // npm install qrcode-terminal
const fs = require('fs');
const path = require('path');

// ====== SETTINGS ======
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const OWNER_NUMBER = '923488186229@s.whatsapp.net'; // Baileys format

// ====== SESSION CLEANUP ======
// Memory leak fix: 30 min baad purane sessions delete kar do
const sessions = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.lastSeen < cutoff) sessions.delete(id);
  }
}, 5 * 60 * 1000);

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { step: 'idle', cart: [], name: null, address: null, lastSeen: Date.now() });
  }
  const s = sessions.get(id);
  s.lastSeen = Date.now();
  return s;
}

function resetSession(id) {
  sessions.set(id, { step: 'idle', cart: [], name: null, address: null, lastSeen: Date.now() });
}

// ====== MENU ======
const MENU = [
  { id: '1', name: 'Single Without Kabab', price: 470 },
  { id: '2', name: 'Special',              price: 740 },
  { id: '3', name: 'Special Without Kabab',price: 640 },
  { id: '4', name: 'Pulao Kabab',          price: 390 },
  { id: '5', name: 'Pulao',                price: 290 },
  { id: '6', name: 'Single',               price: 570 },
  { id: '7', name: 'Zarda',                price: 200 },
  { id: '8', name: 'Shami Kabab 12 Pcs',   price: 600 },
];

function formatMenu() {
  let text = '🍽️ *Hamara Menu*\n─────────────────\n';
  MENU.forEach(item => {
    text += `*${item.id}.* ${item.name} — PKR ${item.price}\n`;
  });
  return text + '─────────────────\nItem number bhejein (jaise *1* ya *1,3*)\n❌ Cancel: *cancel*';
}

function calculateCart(cart) {
  let total = 0;
  let text = '🛒 *Aapka Cart:*\n─────────────────\n';
  cart.forEach(item => {
    const sub = item.qty * item.price;
    text += `• ${item.qty}x ${item.name} = *PKR ${sub}*\n`;
    total += sub;
  });
  return { text: text + `─────────────────\n💰 *Total: PKR ${total}*`, total };
}

// Async file save (blocking nahi karega)
async function saveOrder(order) {
  let orders = [];
  try {
    const raw = await fs.promises.readFile(ORDERS_FILE, 'utf-8');
    orders = JSON.parse(raw);
  } catch {}
  orders.push(order);
  await fs.promises.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// ====== MAIN BOT ======
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');

  const sock = makeWASocket({
  auth: state,
  // printQRInTerminal: true  <-- yeh hata do
  browser: ['MyBot', 'Chrome', '120.0.0'],  // Ubuntu ki jagah generic name
  connectTimeoutMs: 60000,
  defaultQueryTimeoutMs: 60000,
});

  sock.ev.on('creds.update', saveCreds);

 sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
  // QR aaye to print karo
  if (qr) {
    console.log('\n📱 QR scan karein:\n');
    qrcode.generate(qr, { small: true });
  }

  if (connection === 'close') {
    const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
    const shouldReconnect = code !== DisconnectReason.loggedOut;
    console.log('Disconnected, code:', code, '| Reconnect:', shouldReconnect);
    if (shouldReconnect) setTimeout(startBot, 5000);
  } else if (connection === 'open') {
    console.log('✅ Bot connected!');
  }
});

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      if (from.endsWith('@g.us')) continue; // Groups skip

      const body = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text || ''
      ).trim();

      if (!body) continue;

      const session = getSession(from);

      const reply = async (text) => {
        await sock.sendMessage(from, { text });
      };

      try {
        // ---- RESET ----
        if (/^(hi|hello|salam|assalam|start|menu|order|haan|ji\s*haan)$/i.test(body)) {
          resetSession(from);
          getSession(from).step = 'browsing';
          await reply(`Assalam-o-Alaikum! 👋\n\n${formatMenu()}`);
          continue;
        }

        if (/^cancel$/i.test(body)) {
          resetSession(from);
          await reply('❌ *Order cancel ho gaya.*\nDobara order ke liye *menu* likhein.');
          continue;
        }

        // ---- BROWSING ----
        if (session.step === 'browsing' || session.step === 'confirm_more') {
          if (session.step === 'confirm_more' && /^done$/i.test(body)) {
            if (!session.cart.length) {
              session.step = 'browsing';
              await reply(`Cart khali hai.\n\n${formatMenu()}`);
              continue;
            }
            session.step = 'ask_name';
            await reply('👤 Apna *naam* bhejein:');
            continue;
          }
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
      '--single-process',        // RAM bahut kam ho jati hai
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--safebrowsing-disable-auto-update',
    ],
  },
});
          const ids = body.split(',').map(s => s.trim());
          const valid = ids.map(id => MENU.find(m => m.id === id)).filter(Boolean);
          const invalid = ids.filter(id => !MENU.find(m => m.id === id));

          if (!valid.length) {
            await reply('❓ Yeh number menu mein nahi hai.\nMenu ke liye *menu* likhein.');
            continue;
          }

          valid.forEach(item => {
            const ex = session.cart.find(c => c.id === item.id);
            if (ex) ex.qty++;
            else session.cart.push({ ...item, qty: 1 });
          });

          session.step = 'confirm_more';
          const { text } = calculateCart(session.cart);
          let r = text;
          if (invalid.length) r += `\n\n⚠️ Menu mein nahi: *${invalid.join(', ')}*`;
          r += '\n\n➕ Aur add karein ya *done* likhein';
          await reply(r);
          continue;
        }

        // ---- ASK NAME ----
        if (session.step === 'ask_name') {
          if (body.length < 2) { await reply('⚠️ Sahi naam likhein.'); continue; }
          session.name = body;
          session.step = 'ask_address';
          await reply('📍 Delivery *address* bhejein (Gali, Muhalla, City):');
          continue;
        }

        // ---- ASK ADDRESS ----
        if (session.step === 'ask_address') {
          if (body.length < 5) { await reply('⚠️ Thoda detail mein address likhein.'); continue; }
          session.address = body;
          session.step = 'ask_phone';
          await reply('📞 *Contact number* bhejein:');
          continue;
        }

        // ---- ASK PHONE ----
        if (session.step === 'ask_phone') {
          if (!/^[0-9+\s\-]{10,15}$/.test(body)) {
            await reply('⚠️ Sahi number bhejein (jaise: 03001234567)');
            continue;
          }
          session.phone = body;
          session.step = 'final_confirm';
          const { text, total } = calculateCart(session.cart);
          await reply(
            `📋 *Order Summary:*\n\n${text}\n\n` +
            `👤 Naam: *${session.name}*\n📍 Address: *${session.address}*\n📞 Phone: *${session.phone}*\n\n` +
            `✅ *yes* likhein confirm ke liye\n❌ *cancel* likhein`
          );
          continue;
        }

        // ---- FINAL CONFIRM ----
        if (session.step === 'final_confirm') {
          if (/^(yes|haan|ji|confirm|ok|okay|ha)$/i.test(body)) {
            const { total } = calculateCart(session.cart);
            const order = {
              orderId: 'ORD' + Date.now(),
              customerPhone: from,
              name: session.name,
              address: session.address,
              phone: session.phone,
              items: session.cart,
              total,
              timestamp: new Date().toISOString(),
              status: 'pending',
            };
            await saveOrder(order);

            await reply(
              `🎉 *Order Confirm!*\n🆔 ${order.orderId}\n💰 PKR ${total}\n\n⏳ Jald deliver ho ga. Shukriya! 🙏`
            );

            const ownerMsg =
              `🔔 *Naya Order!*\n🆔 ${order.orderId}\n` +
              `👤 ${order.name} | 📞 ${order.phone}\n📍 ${order.address}\n` +
              order.items.map(i => `• ${i.qty}x ${i.name} = PKR ${i.qty * i.price}`).join('\n') +
              `\n💰 *Total: PKR ${total}*\n🕐 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`;

            await sock.sendMessage(OWNER_NUMBER, { text: ownerMsg });
            resetSession(from);
          } else {
            await reply('*yes* likhein confirm ke liye ya *cancel* likhein.');
          }
          continue;
        }

        // ---- DEFAULT ----
        await reply('Assalam-o-Alaikum! 👋\nOrder ke liye *menu* likhein. 😊');

      } catch (err) {
        console.error('Message handling error:', err);
      }
    }
  });
}

startBot();
