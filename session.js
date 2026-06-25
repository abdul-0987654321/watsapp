// ====== SESSION MANAGER ======
// Har customer ka alag state track karta hai

const sessions = {};

const STEPS = {
  IDLE:          'idle',
  BROWSING:      'browsing',
  CONFIRM_MORE:  'confirm_more',
  ASK_NAME:      'ask_name',
  ASK_ADDRESS:   'ask_address',
  ASK_PHONE:     'ask_phone',
  FINAL_CONFIRM: 'final_confirm',
};

function getSession(id) {
  if (!sessions[id]) {
    sessions[id] = {
      step: STEPS.IDLE,
      cart: [],
      name: null,
      address: null,
      phone: null,
    };
  }
  return sessions[id];
}

function resetSession(id) {
  sessions[id] = {
    step: STEPS.IDLE,
    cart: [],
    name: null,
    address: null,
    phone: null,
  };
}

function calculateCart(cart) {
  let total = 0;
  let text = '🛒 *Aapka Cart:*\n';
  text += '─────────────────\n';
  cart.forEach(item => {
    const subtotal = item.qty * item.price;
    text += `• ${item.qty}x ${item.name}\n`;
    text += `  PKR ${item.price} × ${item.qty} = *PKR ${subtotal}*\n`;
    total += subtotal;
  });
  text += '─────────────────\n';
  text += `💰 *Total: PKR ${total}*`;
  return { text, total };
}

module.exports = { STEPS, getSession, resetSession, calculateCart };
