// ====== MESSAGE HANDLER ======
// Saari conversation logic yahan hai

const { MENU, formatMenu }                      = require('./menu');
const { STEPS, getSession, resetSession, calculateCart } = require('./session');
const { saveOrder, generateOrderId }            = require('./orders');

const OWNER_NUMBER = process.env.OWNER_NUMBER || '923488186229@c.us';
const MIN_DELAY_MS = 1200;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---- Greet triggers ----
const GREET_REGEX   = /^(hi|hello|salam|assalam|start|menu|order|haan|ji\s*haan)$/i;
const CANCEL_REGEX  = /^cancel$/i;
const DONE_REGEX    = /^done$/i;
const YES_REGEX     = /^(yes|haan|ji|confirm|ok|okay|ha)$/i;

async function handleMessage(client, msg) {
  const chat = await msg.getChat();
  if (chat.isGroup) return;           // Groups ignore

  const from    = msg.from;
  const body    = msg.body.trim();
  const session = getSession(from);

  await delay(MIN_DELAY_MS);

  // ── GREET / RESET ──────────────────────────────────────────
  if (GREET_REGEX.test(body)) {
    resetSession(from);
    getSession(from).step = STEPS.BROWSING;
    await msg.reply(`Assalam-o-Alaikum! 👋\nKhush Amdeed!\n\n${formatMenu()}`);
    return;
  }

  // ── CANCEL (anywhere in flow) ───────────────────────────────
  if (CANCEL_REGEX.test(body)) {
    resetSession(from);
    await msg.reply('❌ *Order cancel ho gaya.*\n\nDobara order ke liye *menu* likhein. 😊');
    return;
  }

  // ── BROWSING: parse item numbers ────────────────────────────
  if (session.step === STEPS.BROWSING) {
    return await handleItemSelection(msg, session, body);
  }

  // ── CONFIRM MORE: add items or say done ─────────────────────
  if (session.step === STEPS.CONFIRM_MORE) {
    if (DONE_REGEX.test(body)) {
      if (session.cart.length === 0) {
        session.step = STEPS.BROWSING;
        await msg.reply(`Cart khali hai.\n\n${formatMenu()}`);
        return;
      }
      session.step = STEPS.ASK_NAME;
      await msg.reply('👤 Apna *naam* bhejein:');
      return;
    }
    return await handleItemSelection(msg, session, body);
  }

  // ── ASK NAME ────────────────────────────────────────────────
  if (session.step === STEPS.ASK_NAME) {
    if (body.length < 2) {
      await msg.reply('⚠️ Sahi naam likhein please.');
      return;
    }
    session.name = body;
    session.step = STEPS.ASK_ADDRESS;
    await msg.reply('📍 Delivery *address* bhejein\n(Gali, Muhalla, City):');
    return;
  }

  // ── ASK ADDRESS ─────────────────────────────────────────────
  if (session.step === STEPS.ASK_ADDRESS) {
    if (body.length < 5) {
      await msg.reply('⚠️ Thoda detail mein address likhein please.');
      return;
    }
    session.address = body;
    session.step    = STEPS.ASK_PHONE;
    await msg.reply('📞 Apna *contact number* bhejein:');
    return;
  }

  // ── ASK PHONE ───────────────────────────────────────────────
  if (session.step === STEPS.ASK_PHONE) {
    if (!/^[0-9+\s\-]{10,15}$/.test(body)) {
      await msg.reply('⚠️ Sahi phone number bhejein\n(jaise: 03001234567)');
      return;
    }
    session.phone = body;
    session.step  = STEPS.FINAL_CONFIRM;

    const { text, total } = calculateCart(session.cart);
    await msg.reply(
      `📋 *Order Summary:*\n\n` +
      `${text}\n\n` +
      `👤 Naam: *${session.name}*\n` +
      `📍 Address: *${session.address}*\n` +
      `📞 Phone: *${session.phone}*\n\n` +
      `─────────────────\n` +
      `✅ Confirm → *yes* likhein\n` +
      `❌ Cancel  → *cancel* likhein`
    );
    return;
  }

  // ── FINAL CONFIRM ────────────────────────────────────────────
  if (session.step === STEPS.FINAL_CONFIRM) {
    if (YES_REGEX.test(body)) {
      await placeOrder(client, msg, from, session);
    } else {
      await msg.reply('Confirm → *yes*\nCancel  → *cancel*');
    }
    return;
  }

  // ── DEFAULT / IDLE ──────────────────────────────────────────
  await msg.reply('Assalam-o-Alaikum! 👋\n\nOrder ke liye *menu* likhein. 😊');
}

// ── HELPERS ───────────────────────────────────────────────────

async function handleItemSelection(msg, session, body) {
  const ids        = body.split(',').map(s => s.trim());
  const valid      = ids.filter(id => MENU.find(m => m.id === id));
  const invalid    = ids.filter(id => !MENU.find(m => m.id === id));

  if (valid.length === 0) {
    await msg.reply('❓ Yeh number menu mein nahi hai.\n\nMenu ke liye *menu* likhein.');
    return;
  }

  valid.forEach(id => {
    const item     = MENU.find(m => m.id === id);
    const existing = session.cart.find(c => c.id === id);
    if (existing) existing.qty += 1;
    else session.cart.push({ ...item, qty: 1 });
  });

  session.step = STEPS.CONFIRM_MORE;
  const { text } = calculateCart(session.cart);

  let reply = text;
  if (invalid.length) reply += `\n\n⚠️ Yeh number menu mein nahi: *${invalid.join(', ')}*`;
  reply += '\n\n➕ Aur items → number bhejein\n✅ Order confirm → *done* likhein';

  await msg.reply(reply);
}

async function placeOrder(client, msg, from, session) {
  const { total } = calculateCart(session.cart);

  const order = {
    orderId:       generateOrderId(),
    customerPhone: from,
    name:          session.name,
    address:       session.address,
    phone:         session.phone,
    items:         session.cart,
    total,
    timestamp:     new Date().toISOString(),
    status:        'pending',
  };

  saveOrder(order);

  // Customer confirmation
  await msg.reply(
    `🎉 *Order Confirm Ho Gaya!*\n\n` +
    `🆔 Order ID: *${order.orderId}*\n` +
    `💰 Total: *PKR ${total}*\n\n` +
    `⏳ Aapka order jald deliver ho ga.\n` +
    `Shukriya! 🙏`
  );

  // Owner notification
  await delay(800);
  const ownerMsg =
    `🔔 *Naya Order!*\n\n` +
    `🆔 *${order.orderId}*\n` +
    `─────────────────\n` +
    `👤 ${order.name}\n` +
    `📞 ${order.phone}\n` +
    `📍 ${order.address}\n` +
    `─────────────────\n` +
    `🛒 *Items:*\n` +
    order.items.map(i => `• ${i.qty}x ${i.name} = PKR ${i.qty * i.price}`).join('\n') +
    `\n─────────────────\n` +
    `💰 *Total: PKR ${total}*\n` +
    `🕐 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`;

  try {
    await client.sendMessage(OWNER_NUMBER, ownerMsg);
    console.log(`✅ Owner notify — ${order.orderId}`);
  } catch (err) {
    console.error('❌ Owner notify fail:', err.message);
  }

  resetSession(from);
}

module.exports = { handleMessage };
