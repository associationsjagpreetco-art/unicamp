const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { createClient } = require('@libsql/client');

const JWT_SECRET = process.env.JWT_SECRET || 'unicampus_admin_jwt_secret_2025_very_long_and_secure';

// ─── TURSO DB CLIENT ────────────────────────────────────────────
const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN,
});

// ─── HELPER: run a single statement ────────────────────────────
async function run(sql, args = []) {
  return db.execute({ sql, args });
}
async function get(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows[0] || null;
}
async function all(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows;
}

// ─── SCHEMA + SEED (idempotent) ─────────────────────────────────
async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      items TEXT NOT NULL,
      amount REAL NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      discount_code TEXT,
      discount_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'percentage',
      value REAL NOT NULL,
      min_order REAL DEFAULT 0,
      max_uses INTEGER DEFAULT NULL,
      uses INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      starts_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      label TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      priority TEXT DEFAULT 'Normal',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed admin
  const existingAdmin = await get('SELECT id FROM admin_users WHERE id=1');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('unicampus@26', 12);
    await run('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', ['admin', hash]);
  }

  // Seed demo orders
  const { rows: [{ c: orderCount }] } = await db.execute('SELECT COUNT(*) as c FROM orders');
  if (Number(orderCount) === 0) {
    const demoOrders = [
      { id:'ORD-1001', name:'Ravi Kumar',   email:'ravi@example.com',   phone:'9876543210', items:'[{"name":"Practical Notebook 200pg","qty":2,"price":110}]', amount:220, cost:140, status:'Completed',  dc:null,        da:0,     daysAgo:0  },
      { id:'ORD-1002', name:'Priya Sharma', email:'priya@example.com',  phone:'9876543211', items:'[{"name":"Gym Shaker","qty":1,"price":349}]',               amount:349, cost:200, status:'Processing', dc:'WELCOME10', da:34.9,  daysAgo:1  },
      { id:'ORD-1003', name:'Amit Verma',   email:'amit@example.com',   phone:'9876543212', items:'[{"name":"A4 Assignment Sheets","qty":3,"price":90}]',       amount:270, cost:160, status:'Pending',    dc:null,        da:0,     daysAgo:1  },
      { id:'ORD-1004', name:'Neha Singh',   email:'neha@example.com',   phone:'9876543213', items:'[{"name":"Gym Gloves","qty":1,"price":299}]',               amount:299, cost:180, status:'Cancelled',  dc:null,        da:0,     daysAgo:2  },
      { id:'ORD-1005', name:'Arjun Patel',  email:'arjun@example.com',  phone:'9876543214', items:'[{"name":"Duffel Bag","qty":1,"price":699}]',               amount:699, cost:400, status:'Completed',  dc:'SAVE20',    da:139.8, daysAgo:3  },
      { id:'ORD-1006', name:'Kavya Reddy',  email:'kavya@example.com',  phone:'9876543215', items:'[{"name":"Wrist Band","qty":2,"price":199}]',               amount:398, cost:220, status:'Completed',  dc:null,        da:0,     daysAgo:5  },
      { id:'ORD-1007', name:'Rohan Mehta',  email:'rohan@example.com',  phone:'9876543216', items:'[{"name":"Pen Set","qty":2,"price":60}]',                   amount:120, cost:70,  status:'Pending',    dc:'WELCOME10', da:12,    daysAgo:7  },
      { id:'ORD-1008', name:'Sunita Joshi', email:'sunita@example.com', phone:'9876543217', items:'[{"name":"Practical Notebook 144pg","qty":1,"price":70}]',   amount:70,  cost:40,  status:'Completed',  dc:null,        da:0,     daysAgo:10 },
      { id:'ORD-1009', name:'Deepak Nair',  email:'deepak@example.com', phone:'9876543218', items:'[{"name":"Gym Shaker + Gloves Bundle","qty":1,"price":600}]',amount:600, cost:360, status:'Completed',  dc:null,        da:0,     daysAgo:12 },
      { id:'ORD-1010', name:'Meera Gupta',  email:'meera@example.com',  phone:'9876543219', items:'[{"name":"Notebook Cover","qty":1,"price":149}]',            amount:149, cost:80,  status:'Processing', dc:null,        da:0,     daysAgo:14 },
      { id:'ORD-1011', name:'Ravi Kumar',   email:'ravi@example.com',   phone:'9876543210', items:'[{"name":"Pen Set","qty":1,"price":60}]',                   amount:60,  cost:35,  status:'Completed',  dc:null,        da:0,     daysAgo:18 },
      { id:'ORD-1012', name:'Priya Sharma', email:'priya@example.com',  phone:'9876543211', items:'[{"name":"A4 Sheets Bundle","qty":2,"price":90}]',           amount:180, cost:100, status:'Completed',  dc:'SAVE20',    da:36,    daysAgo:20 },
      { id:'ORD-1013', name:'Kiran Rao',    email:'kiran@example.com',  phone:'9876543220', items:'[{"name":"Gym Duffel Bag","qty":1,"price":699}]',            amount:699, cost:400, status:'Completed',  dc:null,        da:0,     daysAgo:25 },
      { id:'ORD-1014', name:'Ananya Das',   email:'ananya@example.com', phone:'9876543221', items:'[{"name":"Practical Notebook 200pg","qty":3,"price":110}]',  amount:330, cost:210, status:'Pending',    dc:null,        da:0,     daysAgo:28 },
      { id:'ORD-1015', name:'Vijay Kumar',  email:'vijay@example.com',  phone:'9876543222', items:'[{"name":"Gym Gloves","qty":2,"price":299}]',               amount:598, cost:360, status:'Completed',  dc:'WELCOME10', da:59.8,  daysAgo:30 },
    ];
    for (const o of demoOrders) {
      const d = `-${o.daysAgo} days`;
      await run(
        `INSERT INTO orders (id,customer_name,customer_email,customer_phone,items,amount,cost,status,discount_code,discount_amount,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now',?),datetime('now',?))`,
        [o.id,o.name,o.email,o.phone,o.items,o.amount,o.cost,o.status,o.dc,o.da,d,d]
      );
    }
  }

  // Seed demo discounts
  const { rows: [{ c: discountCount }] } = await db.execute('SELECT COUNT(*) as c FROM discounts');
  if (Number(discountCount) === 0) {
    await run(`INSERT INTO discounts (code,type,value,min_order,max_uses,uses,active,starts_at,expires_at) VALUES (?,?,?,?,?,?,?,datetime('now'),?)`, ['WELCOME10','percentage',10,100,100,38,1,'2026-12-31']);
    await run(`INSERT INTO discounts (code,type,value,min_order,max_uses,uses,active,starts_at,expires_at) VALUES (?,?,?,?,?,?,?,datetime('now'),?)`, ['SAVE20','percentage',20,300,50,12,1,'2026-06-30']);
    await run(`INSERT INTO discounts (code,type,value,min_order,max_uses,uses,active,starts_at,expires_at) VALUES (?,?,?,?,?,?,?,datetime('now'),?)`, ['FLAT50','fixed',50,200,200,5,1,null]);
  }

  // Seed demo support tickets
  const { rows: [{ c: ticketCount }] } = await db.execute('SELECT COUNT(*) as c FROM support_tickets');
  if (Number(ticketCount) === 0) {
    const tickets = [
      { name:'Ravi Kumar',   email:'ravi@example.com',   phone:'9876543210', subject:'Order Delay',           message:"My order ORD-1001 hasn't arrived.", status:'Resolved',    priority:'High',   daysAgo:1 },
      { name:'Priya Sharma', email:'priya@example.com',  phone:'9876543211', subject:'Discount Not Applied',  message:'WELCOME10 not applied on ORD-1002.',status:'In Progress', priority:'Normal', daysAgo:2 },
      { name:'Ananya Das',   email:'ananya@example.com', phone:'9876543221', subject:'Wrong Item Received',   message:'Got 144pg instead of 200pg.',        status:'Open',        priority:'High',   daysAgo:0 },
      { name:'Kiran Rao',    email:'kiran@example.com',  phone:'9876543220', subject:'Cancellation Request',  message:'Cancel ORD-1013 and refund please.',  status:'Resolved',    priority:'Normal', daysAgo:5 },
      { name:'Deepak Nair',  email:'deepak@example.com', phone:'9876543218', subject:'Product Quality Issue', message:'Gym shaker lid is cracked.',           status:'Open',        priority:'High',   daysAgo:0 },
    ];
    for (const t of tickets) {
      const d = `-${t.daysAgo} days`;
      await run(
        `INSERT INTO support_tickets (customer_name,customer_email,customer_phone,subject,message,status,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now',?),datetime('now',?))`,
        [t.name,t.email,t.phone,t.subject,t.message,t.status,t.priority,d,d]
      );
    }
  }
}

// ─── EXPRESS APP ────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cookieParser());

let dbReady = false;
app.use(async (req, res, next) => {
  if (!dbReady) { await initDB(); dbReady = true; }
  next();
});

function requireAuth(req, res, next) {
  const token = req.cookies?.admin_token || req.headers?.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}

// PUBLIC: product variants for storefront (no auth), grouped by product_id
app.get('/api/variants', async (req, res) => {
  const rows = await all('SELECT id, product_id, label, price, stock FROM product_variants WHERE active = 1 ORDER BY price ASC');
  const grouped = {};
  for (const r of rows) {
    (grouped[r.product_id] = grouped[r.product_id] || []).push({ id: r.id, label: r.label, price: r.price, stock: r.stock });
  }
  res.json(grouped);
});

// AUTH
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const admin = await get('SELECT * FROM admin_users WHERE email = ?', [email]);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('admin_token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
  res.json({ success: true, email: admin.email, token });
});

app.post('/api/admin/logout', requireAuth, (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

app.put('/api/admin/profile', requireAuth, async (req, res) => {
  const { email, current_password, new_password } = req.body;
  const admin = await get('SELECT * FROM admin_users WHERE id = ?', [req.admin.id]);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  if (!bcrypt.compareSync(current_password, admin.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' });
  const updates = []; const params = [];
  if (email && email !== admin.email) {
    if (await get('SELECT id FROM admin_users WHERE email = ? AND id != ?', [email, admin.id])) return res.status(400).json({ error: 'Email already in use' });
    updates.push('email = ?'); params.push(email);
  }
  if (new_password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(new_password, 12)); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  updates.push("updated_at = datetime('now')"); params.push(admin.id);
  await run(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`, params);
  const newEmail = email || admin.email;
  const token = jwt.sign({ id: admin.id, email: newEmail }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('admin_token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
  res.json({ success: true, email: newEmail, token });
});

app.get('/api/admin/me', requireAuth, async (req, res) => {
  res.json({ id: req.admin.id, email: req.admin.email });
});

// OVERVIEW
app.get('/api/admin/overview', requireAuth, async (req, res) => {
  const totalRevenue     = (await get("SELECT COALESCE(SUM(amount),0) as v FROM orders WHERE status != 'Cancelled'")).v;
  const totalCost        = (await get("SELECT COALESCE(SUM(cost),0) as v FROM orders WHERE status != 'Cancelled'")).v;
  const totalOrders      = (await get("SELECT COUNT(*) as v FROM orders")).v;
  const ordersDone       = (await get("SELECT COUNT(*) as v FROM orders WHERE status='Completed'")).v;
  const ordersPending    = (await get("SELECT COUNT(*) as v FROM orders WHERE status='Pending'")).v;
  const ordersProcessing = (await get("SELECT COUNT(*) as v FROM orders WHERE status='Processing'")).v;
  const ordersCancelled  = (await get("SELECT COUNT(*) as v FROM orders WHERE status='Cancelled'")).v;
  const discountsUsed    = (await get("SELECT COALESCE(SUM(discount_amount),0) as v FROM orders WHERE discount_amount > 0")).v;
  const repeatedClients  = (await get("SELECT COUNT(*) as v FROM (SELECT customer_email FROM orders GROUP BY customer_email HAVING COUNT(*) > 1)")).v;
  const recentOrders     = await all("SELECT id, customer_name, amount, status, created_at FROM orders ORDER BY created_at DESC LIMIT 5");
  const monthlyRevenue   = (await all("SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(amount),0) as revenue, COALESCE(SUM(cost),0) as cost FROM orders WHERE status != 'Cancelled' GROUP BY month ORDER BY month DESC LIMIT 6")).reverse();
  const dailyRevenue     = await all("SELECT strftime('%d %b', created_at) as day, COALESCE(SUM(amount),0) as revenue FROM orders WHERE status != 'Cancelled' AND created_at >= datetime('now','-30 days') GROUP BY strftime('%Y-%m-%d', created_at) ORDER BY created_at");
  res.json({ totalRevenue, totalCost, totalProfit: totalRevenue - totalCost, totalOrders, ordersDone, ordersPending, ordersProcessing, ordersCancelled, repeatedClients, discountsUsed, recentOrders, monthlyRevenue, dailyRevenue });
});

// ORDERS
app.get('/api/admin/orders', requireAuth, async (req, res) => {
  const { search, status, from, to, page=1, limit=20 } = req.query;
  let where = '1=1'; const params = [];
  if (search) { where += " AND (customer_name LIKE ? OR customer_email LIKE ? OR id LIKE ?)"; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  if (status) { where += " AND status = ?"; params.push(status); }
  if (from)   { where += " AND DATE(created_at) >= ?"; params.push(from); }
  if (to)     { where += " AND DATE(created_at) <= ?"; params.push(to); }
  const offset = (parseInt(page)-1)*parseInt(limit);
  const total  = Number((await get(`SELECT COUNT(*) as c FROM orders WHERE ${where}`, params)).c);
  const orders = await all(`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
  res.json({ orders, total, page: parseInt(page), limit: parseInt(limit) });
});

app.get('/api/admin/orders/:id', requireAuth, async (req, res) => {
  const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.post('/api/admin/orders', requireAuth, async (req, res) => {
  const { customer_name, customer_email, customer_phone, items, amount, cost, status, discount_code, discount_amount } = req.body;
  if (!customer_name || !customer_email || !items || !amount) return res.status(400).json({ error: 'Missing required fields' });
  const id = 'ORD-' + Math.floor(1000+Math.random()*9000);
  await run(
    `INSERT INTO orders (id,customer_name,customer_email,customer_phone,items,amount,cost,status,discount_code,discount_amount) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id,customer_name,customer_email,customer_phone||null,typeof items==='string'?items:JSON.stringify(items),amount,cost||0,status||'Pending',discount_code||null,discount_amount||0]
  );
  res.json({ success: true, id });
});

app.put('/api/admin/orders/:id', requireAuth, async (req, res) => {
  const { status, customer_name, customer_email, customer_phone, amount, cost } = req.body;
  if (!await get('SELECT id FROM orders WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Order not found' });
  const updates = ["updated_at = datetime('now')"]; const params = [];
  if (status)         { updates.push('status = ?'); params.push(status); }
  if (customer_name)  { updates.push('customer_name = ?'); params.push(customer_name); }
  if (customer_email) { updates.push('customer_email = ?'); params.push(customer_email); }
  if (customer_phone !== undefined) { updates.push('customer_phone = ?'); params.push(customer_phone); }
  if (amount !== undefined) { updates.push('amount = ?'); params.push(amount); }
  if (cost !== undefined)   { updates.push('cost = ?'); params.push(cost); }
  params.push(req.params.id);
  await run(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ success: true });
});

app.delete('/api/admin/orders/:id', requireAuth, async (req, res) => {
  await run('DELETE FROM orders WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// REVENUE
app.get('/api/admin/revenue', requireAuth, async (req, res) => {
  const { period='monthly', from, to } = req.query;
  let where = "status != 'Cancelled'"; const params = [];
  if (from) { where += " AND DATE(created_at) >= ?"; params.push(from); }
  if (to)   { where += " AND DATE(created_at) <= ?"; params.push(to); }
  const fmt = period==='daily'?'%d %b %Y':period==='yearly'?'%Y':'%b %Y';
  const grp = period==='daily'?'%Y-%m-%d':period==='yearly'?'%Y':'%Y-%m';
  const data       = await all(`SELECT strftime('${fmt}', created_at) as label, COALESCE(SUM(amount),0) as revenue, COUNT(*) as orders FROM orders WHERE ${where} GROUP BY strftime('${grp}', created_at) ORDER BY strftime('${grp}', created_at)`, params);
  const total      = (await get(`SELECT COALESCE(SUM(amount),0) as v FROM orders WHERE ${where}`, params)).v;
  const avgOrder   = (await get(`SELECT COALESCE(AVG(amount),0) as v FROM orders WHERE ${where}`, params)).v;
  const orderCount = (await get(`SELECT COUNT(*) as v FROM orders WHERE ${where}`, params)).v;
  res.json({ data, total, avgOrder, orderCount });
});

// PROFIT
app.get('/api/admin/profit', requireAuth, async (req, res) => {
  const { period='monthly', from, to } = req.query;
  let where = "status != 'Cancelled'"; const params = [];
  if (from) { where += " AND DATE(created_at) >= ?"; params.push(from); }
  if (to)   { where += " AND DATE(created_at) <= ?"; params.push(to); }
  const fmt = period==='daily'?'%d %b %Y':period==='yearly'?'%Y':'%b %Y';
  const grp = period==='daily'?'%Y-%m-%d':period==='yearly'?'%Y':'%Y-%m';
  const data    = await all(`SELECT strftime('${fmt}', created_at) as label, COALESCE(SUM(amount),0) as revenue, COALESCE(SUM(cost),0) as cost, COALESCE(SUM(amount)-SUM(cost),0) as profit FROM orders WHERE ${where} GROUP BY strftime('${grp}', created_at) ORDER BY strftime('${grp}', created_at)`, params);
  const summary = await get(`SELECT COALESCE(SUM(amount),0) as revenue, COALESCE(SUM(cost),0) as cost, COALESCE(SUM(amount)-SUM(cost),0) as profit, COALESCE(AVG((amount-cost)/NULLIF(amount,0)*100),0) as margin FROM orders WHERE ${where}`, params);
  res.json({ data, ...summary });
});

// DISCOUNTS
app.get('/api/admin/discounts', requireAuth, async (req, res) => res.json(await all('SELECT * FROM discounts ORDER BY created_at DESC')));

app.post('/api/admin/discounts', requireAuth, async (req, res) => {
  const { code, type, value, min_order, max_uses, active, starts_at, expires_at } = req.body;
  if (!code||!type||value==null) return res.status(400).json({ error: 'Missing required fields' });
  if (!['percentage','fixed'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  try {
    await run(`INSERT INTO discounts (code,type,value,min_order,max_uses,active,starts_at,expires_at) VALUES (?,?,?,?,?,?,?,?)`, [code.toUpperCase(),type,value,min_order||0,max_uses||null,active?1:0,starts_at||new Date().toISOString(),expires_at||null]);
    res.json({ success: true });
  } catch(e) { if(e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Code already exists' }); throw e; }
});

app.put('/api/admin/discounts/:id', requireAuth, async (req, res) => {
  const { code, type, value, min_order, max_uses, active, starts_at, expires_at } = req.body;
  if (!await get('SELECT id FROM discounts WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Discount not found' });
  try {
    await run(`UPDATE discounts SET code=?,type=?,value=?,min_order=?,max_uses=?,active=?,starts_at=?,expires_at=? WHERE id=?`, [code.toUpperCase(),type,value,min_order||0,max_uses||null,active?1:0,starts_at,expires_at||null,req.params.id]);
    res.json({ success: true });
  } catch(e) { if(e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Code already exists' }); throw e; }
});

app.delete('/api/admin/discounts/:id', requireAuth, async (req, res) => {
  await run('DELETE FROM discounts WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// PRODUCT VARIANTS (admin)
app.get('/api/admin/variants', requireAuth, async (req, res) => {
  const { product_id } = req.query;
  if (product_id) return res.json(await all('SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at DESC', [product_id]));
  res.json(await all('SELECT * FROM product_variants ORDER BY product_name ASC, price ASC'));
});

app.post('/api/admin/variants', requireAuth, async (req, res) => {
  const { product_id, product_name, label, price, stock, active } = req.body;
  if (!product_id || !product_name || !label || price == null) return res.status(400).json({ error: 'Missing required fields' });
  await run(`INSERT INTO product_variants (product_id,product_name,label,price,stock,active) VALUES (?,?,?,?,?,?)`,
    [product_id, product_name, label, price, stock || 0, active === false ? 0 : 1]);
  res.json({ success: true });
});

app.put('/api/admin/variants/:id', requireAuth, async (req, res) => {
  const { product_id, product_name, label, price, stock, active } = req.body;
  if (!await get('SELECT id FROM product_variants WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Variant not found' });
  await run(`UPDATE product_variants SET product_id=?,product_name=?,label=?,price=?,stock=?,active=?,updated_at=datetime('now') WHERE id=?`,
    [product_id, product_name, label, price, stock || 0, active === false ? 0 : 1, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/admin/variants/:id', requireAuth, async (req, res) => {
  await run('DELETE FROM product_variants WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// SUPPORT
app.get('/api/admin/support', requireAuth, async (req, res) => {
  const { search, status, priority, page=1, limit=20 } = req.query;
  let where = '1=1'; const params = [];
  if (search)   { where += " AND (customer_name LIKE ? OR customer_email LIKE ? OR subject LIKE ? OR message LIKE ?)"; params.push(`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`); }
  if (status)   { where += " AND status = ?"; params.push(status); }
  if (priority) { where += " AND priority = ?"; params.push(priority); }
  const offset  = (parseInt(page)-1)*parseInt(limit);
  const total   = Number((await get(`SELECT COUNT(*) as c FROM support_tickets WHERE ${where}`, params)).c);
  const tickets = await all(`SELECT * FROM support_tickets WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
  res.json({ tickets, total });
});

app.post('/api/admin/support', requireAuth, async (req, res) => {
  const { customer_name, customer_email, customer_phone, subject, message, status, priority } = req.body;
  if (!customer_name||!message) return res.status(400).json({ error: 'Missing required fields' });
  const r = await run(`INSERT INTO support_tickets (customer_name,customer_email,customer_phone,subject,message,status,priority) VALUES (?,?,?,?,?,?,?)`, [customer_name,customer_email||'',customer_phone||null,subject||'',message,status||'Open',priority||'Normal']);
  res.json({ success: true, id: r.lastInsertRowid });
});

app.put('/api/admin/support/:id', requireAuth, async (req, res) => {
  const { status, notes, priority } = req.body;
  if (!await get('SELECT id FROM support_tickets WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Ticket not found' });
  const updates = ["updated_at = datetime('now')"]; const params = [];
  if (status)             { updates.push('status = ?'); params.push(status); }
  if (notes !== undefined){ updates.push('notes = ?'); params.push(notes); }
  if (priority)           { updates.push('priority = ?'); params.push(priority); }
  params.push(req.params.id);
  await run(`UPDATE support_tickets SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ success: true });
});

app.delete('/api/admin/support/:id', requireAuth, async (req, res) => {
  await run('DELETE FROM support_tickets WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = app;
