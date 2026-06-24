const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ====== SETTINGS ======
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const MIN_DELAY_MS = 1500;

// Owner ka number — jab order complete ho tab yahan message jayega
const OWNER_NUMBER = '923488186229@c.us'; // +92 format, @c.us zaroori hai

// ====== UPDATED MENU (screenshot se) ======
const MENU = [
  { id: '1', name: 'Single Without Kabab', price: 470 },
  { id: '2', name: 'Special',              price: 740 },
  { id: '3', name: 'Special Without Kabab',price: 640 },
  { id: '4', name: 'Pulao Kabab',          price: 390 },
  { id: '5', name: 'Pulao',                price: 290 },
  { id: '6', name: 'Single',               price: 570 },
  { id: '7', name: 'Zarda',               price: 200 },
  { id: '8', name: 'Shami Kabab 12 Pcs',  price: 600 },
];

// ====== Session store ======
const sessions = {};

function getSession(id) {
  if (!sessions[id]) {
    sessions[id] = { step: 'idle', cart: [], name: null, address: null };
  }
  return sessions[id];
}

function resetSession(id) {
  sessions[id] = { step: 'idle', cart: [], name: null, address: null };
}

// ====== Helper: Menu text ======
function formatMenu() {
  let text = '🍽️ *Hamara Menu*\n';
  text += '─────────────────\n';
  MENU.forEach(item => {
    text += `*${item.id}.* ${item.name} — PKR ${item.price}\n`;
  });
  text += '─────────────────\n';
  text += '📌 *Order karne ka tarika:*\n';
  text += 'Sirf item number bhejein\n';
  text += 'Jaise: *1* ya *1,3,5*\n\n';
  text += '❌ Cancel karne ke liye: *cancel*';
  return text;
}

// ====== Helper: Cart summary ======
function calculateCart(cart) {
  let total = 0;
  let text = '🛒 *Aapka Cart:*\n';
  text += '─────────────────\n';
  cart.forEach(item => {
    text += `• ${item.qty}x ${item.name}\n`;
    text += `  PKR ${item.price} × ${item.qty} = *PKR ${item.qty * item.price}*\n`;
    total += item.qty * item.price;
  });
  text += '─────────────────\n';
  text += `💰 *Total: PKR ${total}*`;
  return { text, total };
}

// ====== Helper: Save order to file ======
function saveOrder(order) {
  let orders = [];
  if (fs.existsSync(ORDERS_FILE)) {
    try {
      orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
    } catch {
      orders = [];
    }
  }
  orders.push(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// ====== Helper: Delay ======
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ====== WhatsApp Client ======
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'session') }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
    ],
  },
  webVersionCache: {
    type: 'remote',
    remotePath:
      'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1015901620-alpha.html',
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 QR code scan karein WhatsApp > Linked Devices se:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('✅ Bot ready hai!');
  console.log('Bot number:', client.info.wid._serialized);
  
  // Test message owner ko
 
});

client.on('disconnected', (reason) => {
  console.log('❌ Disconnect ho gaya:', reason);
  // Auto reconnect
  setTimeout(() => {
    console.log('🔄 Reconnect ho raha hai...');
    client.initialize();
  }, 5000);
});

// ====== Message Handler ======
client.on('message', async (msg) => {
  // Sirf personal chats handle karo
  const chat = await msg.getChat();
  if (chat.isGroup) return;

  const from = msg.from;
  const body = msg.body.trim();
  const session = getSession(from);

  try {
    await delay(MIN_DELAY_MS);

    // ---- RESET / START commands ----
    if (/^(hi|hello|salam|assalam|start|menu|order|haan|ji\s*haan)$/i.test(body)) {
      resetSession(from);
      const s = getSession(from);
      s.step = 'browsing';
      await msg.reply(
        `Assalam-o-Alaikum! 👋\nKhush Amdeed!\n\n${formatMenu()}`
      );
      return;
    }

    if (/^cancel$/i.test(body)) {
      resetSession(from);
      await msg.reply(
        '❌ *Order cancel ho gaya.*\n\nDobara order karne ke liye *menu* likhein. 😊'
      );
      return;
    }

    // ---- BROWSING: item numbers ----
    if (session.step === 'browsing') {
      const ids = body.split(',').map(s => s.trim());
      const validItems = [];
      const invalidIds = [];

      ids.forEach(id => {
        const item = MENU.find(m => m.id === id);
        if (item) validItems.push(item);
        else invalidIds.push(id);
      });

      if (validItems.length === 0) {
        await msg.reply(
          `❓ Yeh number menu mein nahi hai.\n\nMenu dekhne ke liye *menu* likhein.`
        );
        return;
      }

      validItems.forEach(item => {
        const existing = session.cart.find(c => c.id === item.id);
        if (existing) existing.qty += 1;
        else session.cart.push({ ...item, qty: 1 });
      });

      session.step = 'confirm_more';
      const { text } = calculateCart(session.cart);

      let reply = text;
      if (invalidIds.length > 0) {
        reply += `\n\n⚠️ Yeh number menu mein nahi: *${invalidIds.join(', ')}*`;
      }
      reply += '\n\n➕ Aur items add karne ke liye number bhejein\n✅ Order confirm karne ke liye *done* likhein';

      await msg.reply(reply);
      return;
    }

    // ---- CONFIRM MORE: "done" ya aur items ----
    if (session.step === 'confirm_more') {
      if (/^done$/i.test(body)) {
        if (session.cart.length === 0) {
          session.step = 'browsing';
          await msg.reply(`Cart khali hai.\n\n${formatMenu()}`);
          return;
        }
        session.step = 'ask_name';
        await msg.reply(
          '👤 Apna *naam* bhejein:'
        );
        return;
      }

      // Aur items add karo
      const ids = body.split(',').map(s => s.trim());
      const validItems = [];
      ids.forEach(id => {
        const item = MENU.find(m => m.id === id);
        if (item) validItems.push(item);
      });

      if (validItems.length === 0) {
        await msg.reply(
          '❓ Number samajh nahi aaya.\n\nItems add karne ke liye number bhejein, ya *done* likhein.'
        );
        return;
      }

      validItems.forEach(item => {
        const existing = session.cart.find(c => c.id === item.id);
        if (existing) existing.qty += 1;
        else session.cart.push({ ...item, qty: 1 });
      });

      const { text } = calculateCart(session.cart);
      await msg.reply(`${text}\n\n➕ Aur add karein ya *done* likhein.`);
      return;
    }

    // ---- ASK NAME ----
    if (session.step === 'ask_name') {
      if (body.length < 2) {
        await msg.reply('⚠️ Sahi naam likhein please.');
        return;
      }
      session.name = body;
      session.step = 'ask_address';
      await msg.reply('📍 Delivery *address* bhejein\n(Gali, Muhalla, City):');
      return;
    }

    // ---- ASK ADDRESS ----
    if (session.step === 'ask_address') {
      if (body.length < 5) {
        await msg.reply('⚠️ Thoda detail mein address likhein please.');
        return;
      }
      session.address = body;
      session.step = 'ask_phone';
      await msg.reply('📞 Apna *contact number* bhejein:');
      return;
    }

    // ---- ASK PHONE ----
    if (session.step === 'ask_phone') {
      if (!/^[0-9+\s\-]{10,15}$/.test(body)) {
        await msg.reply('⚠️ Sahi phone number bhejein (jaise: 03001234567)');
        return;
      }
      session.phone = body;
      session.step = 'final_confirm';

      const { text, total } = calculateCart(session.cart);
      await msg.reply(
        `📋 *Order Summary:*\n\n` +
        `${text}\n\n` +
        `👤 Naam: *${session.name}*\n` +
        `📍 Address: *${session.address}*\n` +
        `📞 Phone: *${session.phone}*\n\n` +
        `─────────────────\n` +
        `✅ Confirm karne ke liye *yes* likhein\n` +
        `❌ Cancel karne ke liye *cancel* likhein`
      );
      return;
    }

    // ---- FINAL CONFIRMATION ----
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
        saveOrder(order);

        // Customer ko confirmation
        await msg.reply(
          `🎉 *Order Confirm Ho Gaya!*\n\n` +
          `🆔 Order ID: *${order.orderId}*\n` +
          `💰 Total: *PKR ${total}*\n\n` +
          `⏳ Aapka order jald deliver ho ga.\n` +
          `Shukriya! 🙏`
        );

        // ---- Owner ko notification ----
        await delay(1000);
        const ownerMsg =
          `🔔 *Naya Order Aya!*\n\n` +
          `🆔 *${order.orderId}*\n` +
          `─────────────────\n` +
          `👤 Naam: ${order.name}\n` +
          `📞 Phone: ${order.phone}\n` +
          `📍 Address: ${order.address}\n` +
          `─────────────────\n` +
          `🛒 *Items:*\n` +
          order.items.map(i => `• ${i.qty}x ${i.name} = PKR ${i.qty * i.price}`).join('\n') +
          `\n─────────────────\n` +
          `💰 *Total: PKR ${total}*\n` +
          `🕐 Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`;

        try {
          await client.sendMessage(OWNER_NUMBER, ownerMsg);
          console.log(`✅ Owner ko notify kar diya — ${order.orderId}`);
        } catch (err) {
          console.error('❌ Owner notification fail:', err.message);
        }

        resetSession(from);
      } else {
        await msg.reply(
          'Confirm karne ke liye *yes* likhein\nCancel karne ke liye *cancel* likhein'
        );
      }
      return;
    }

    // ---- DEFAULT / IDLE ----
    await msg.reply(
      `Assalam-o-Alaikum! 👋\n\nOrder karne ke liye *menu* likhein. 😊`
    );

  } catch (err) {
    console.error('Error handling message:', err);
  }
});

client.initialize();