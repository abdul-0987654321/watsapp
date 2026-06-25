// ====== ORDER STORAGE ======
const fs   = require('fs');
const path = require('path');

const ORDERS_FILE = path.join(__dirname, '..', 'data', 'orders.json');

// Ensure data folder exists
if (!fs.existsSync(path.dirname(ORDERS_FILE))) {
  fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
}

function saveOrder(order) {
  let orders = [];
  if (fs.existsSync(ORDERS_FILE)) {
    try { orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8')); }
    catch { orders = []; }
  }
  orders.push(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function getAllOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8')); }
  catch { return []; }
}

function generateOrderId() {
  return 'ORD' + Date.now();
}

module.exports = { saveOrder, getAllOrders, generateOrderId };
