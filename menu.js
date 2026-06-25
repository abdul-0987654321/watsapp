// ====== MENU DATA ======
const MENU = [
  // Rice Plates
  { id: '1',  category: 'Rice Plates',    name: 'Single',                 desc: '1 Pc Chicken, 2 Pcs Shami Kabab, Salad & Raita',      price: 570  },
  { id: '2',  category: 'Rice Plates',    name: 'Single Choice',          desc: '1 Pc Chicken of Choice, 2 Pcs Kabab, Salad & Raita',  price: 580  },
  { id: '3',  category: 'Rice Plates',    name: 'Single Without Kabab',   desc: '1 Pc Chicken, Salad & Raita',                         price: 470  },
  { id: '4',  category: 'Rice Plates',    name: 'Special',                desc: '2 Pcs Chicken, 2 Pcs Shami Kabab, Salad & Raita',     price: 740  },
  { id: '5',  category: 'Rice Plates',    name: 'Special Choice',         desc: '2 Pcs Chicken of Choice, 2 Pcs Kabab, Salad & Raita', price: 750  },
  { id: '6',  category: 'Rice Plates',    name: 'Special Without Kabab',  desc: '2 Pcs Chicken, Salad & Raita',                        price: 640  },
  { id: '7',  category: 'Rice Plates',    name: 'Pulao Kabab',            desc: '2 Pcs Shami Kabab, Salad & Raita',                    price: 390  },
  { id: '8',  category: 'Rice Plates',    name: 'Pulao',                  desc: 'Plain Rice with Salad & Raita',                       price: 290  },

  // Chicken Roast
  { id: '9',  category: 'Chicken Roast',  name: 'Chicken Roast (Full)',   desc: '1 Roasted Chicken with Ketchup & Lemon',              price: 1350 },
  { id: '10', category: 'Chicken Roast',  name: 'Chicken Roast (Half)',   desc: '1/2 Roasted Chicken with Ketchup & Lemon',            price: 700  },

  // Kabab & Extras
  { id: '11', category: 'Kabab & Extras', name: 'Shami Kabab (12 Pcs)',   desc: 'Served with Fresh Salad & Raita',                     price: 600  },
  { id: '12', category: 'Kabab & Extras', name: 'Chicken Piece',          desc: 'Chest / Leg / Thigh / Wing (Choose 1)',               price: 180  },
  { id: '13', category: 'Kabab & Extras', name: 'Extra Salad',            desc: null,                                                  price: 20   },
  { id: '14', category: 'Kabab & Extras', name: 'Extra Raita',            desc: null,                                                  price: 20   },

  // Desserts
  { id: '15', category: 'Desserts',       name: 'Kheer',                  desc: 'Traditional Rice Pudding',                            price: 180  },
  { id: '16', category: 'Desserts',       name: 'Zarda',                  desc: 'Colourful Sweet Rice with Chamcham & Raisins',        price: 180  },
];

function formatMenu() {
  let text = '🍽️ *HAMARA MENU* 🍽️\n';
  text += '═══════════════════\n\n';

  const categories = [...new Set(MENU.map(m => m.category))];
  categories.forEach(cat => {
    text += `🔸 *${cat.toUpperCase()}*\n`;
    text += '───────────────────\n';
    MENU.filter(m => m.category === cat).forEach(item => {
      text += `*${item.id}.* ${item.name} — *PKR ${item.price}*\n`;
      if (item.desc) text += `     _${item.desc}_\n`;
    });
    text += '\n';
  });

  text += '═══════════════════\n';
  text += '📌 *Order karne ka tarika:*\n';
  text += 'Item number bhejein — jaise *1* ya *1,3,5*\n\n';
  text += '❌ Cancel: *cancel*';
  return text;
}

module.exports = { MENU, formatMenu };
