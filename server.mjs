// ===================================================================
//  server.mjs - انباریار | Anbariyar Server
//  ساخته شده با ❤️ توسط آرین
//  نسخه: 3.0 (ادغام انباریار + اسکنر)
// ===================================================================

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 2999);
const ROOT = __dirname;
const PUBLIC_DIR = ROOT;
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const DB_FILE = path.join(DATA_DIR, 'db.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const OPEN_INVOICES_FILE = path.join(DATA_DIR, 'open-invoices.json');

// ===================================================================
//  ساخت پوشه‌ها
// ===================================================================
[PUBLIC_DIR, DATA_DIR, BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ===================================================================
//  ساختار پیش‌فرض دیتابیس
// ===================================================================
const DEFAULT_DB = {
  categories: [
    { id: 1, name: 'عمومی', icon: '📦', color: '#6366f1' },
    { id: 2, name: 'خوراکی', icon: '🍎', color: '#10b981' },
    { id: 3, name: 'نوشیدنی', icon: '🥤', color: '#0891b2' },
    { id: 4, name: 'لبنیات', icon: '🥛', color: '#f59e0b' }
  ],
  brands: [
    { id: 1, name: 'متفرقه', icon: '🏷️' },
    { id: 2, name: 'میهن', icon: '⭐' },
    { id: 3, name: 'کاله', icon: '👑' }
  ],
  products: [],
  purchases: [],
  sales: [],
  invoices: [],
  counters: { category: 4, brand: 3, product: 0, purchase: 0, sale: 0, invoice: 0 }
};

const DEFAULT_SETTINGS = {
  shopName: 'فروشگاه من',
  shopPhone: '',
  shopAddress: '',
  adminPassword: '1234',
  lowStockThreshold: 3,
  autoBackupHours: 6,
  footerNote: 'متشکریم از خرید شما 🌹',
  currency: 'تومان',
  theme: 'light'
};

const DEFAULT_USERS = [
  { id: 'u1', name: 'آقای کیانی', role: 'manager', active: true, color: '#6366f1' },
  { id: 'u2', name: 'بابک', role: 'worker', active: true, color: '#10b981' },
  { id: 'u3', name: 'سیامک', role: 'worker', active: true, color: '#0891b2' },
  { id: 'u4', name: 'مصطفی', role: 'worker', active: true, color: '#f59e0b' }
];

// ===================================================================
//  لود و ذخیره
// ===================================================================
function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let db = loadJSON(DB_FILE, DEFAULT_DB);
let settings = loadJSON(SETTINGS_FILE, DEFAULT_SETTINGS);
let users = loadJSON(USERS_FILE, DEFAULT_USERS);
let openInvoices = loadJSON(OPEN_INVOICES_FILE, {});

// اطمینان از ساختار
if (!db.counters) db.counters = { category: 0, brand: 0, product: 0, purchase: 0, sale: 0, invoice: 0 };
if (!db.categories) db.categories = [];
if (!db.brands) db.brands = [];
if (!db.products) db.products = [];
if (!db.purchases) db.purchases = [];
if (!db.sales) db.sales = [];
if (!db.invoices) db.invoices = [];

// ===================================================================
//  پشتیبان‌گیری خودکار
// ===================================================================
function autoBackup() {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = {
      exportedAt: new Date().toISOString(),
      version: '3.0',
      signature: 'Created by Arian ✨',
      db, settings, users, openInvoices
    };
    fs.writeFileSync(
      path.join(BACKUP_DIR, `backup-${stamp}.json`),
      JSON.stringify(backup, null, 2)
    );
    // حذف بکاپ‌های قدیمی‌تر از ۷ روز
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-'));
    const now = Date.now();
    files.forEach(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      if (now - stat.mtimeMs > 7 * 24 * 3600 * 1000) fs.unlinkSync(path.join(BACKUP_DIR, f));
    });
  } catch (e) { console.error('Backup error:', e); }
}
setInterval(autoBackup, (settings.autoBackupHours || 6) * 3600 * 1000);
autoBackup();

// ===================================================================
//  ابزارها
// ===================================================================
function sendJSON(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pass',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json; charset=utf-8'
  };
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  } catch {
    sendJSON(res, 404, { ok: false, error: 'not found' });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 10_000_000) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  const pass = req.headers['x-admin-pass'] || '';
  return pass === settings.adminPassword;
}

function findProduct(barcode) {
  return db.products.find(p => String(p.barcode || '') === String(barcode));
}

function nextId(key) {
  db.counters[key] = (db.counters[key] || 0) + 1;
  return db.counters[key];
}

// ===================================================================
//  روتر اصلی
// ===================================================================
async function handle(req, res) {
  if (req.method === 'OPTIONS') return sendJSON(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    // ============ احراز هویت ============
    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readBody(req);
      if (String(body.password || '') === settings.adminPassword) {
        return sendJSON(res, 200, { ok: true });
      }
      return sendJSON(res, 401, { ok: false, error: 'رمز اشتباه' });
    }

    // ============ APIهای عمومی ============
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJSON(res, 200, {
        ok: true,
        app: 'انباریار',
        version: '3.0',
        signature: 'Created by Arian ✨',
        products: db.products.length,
        invoices: db.invoices.length,
        open: Object.keys(openInvoices).length,
        users: users.length
      });
    }

    if (req.method === 'GET' && pathname === '/api/config') {
      return sendJSON(res, 200, {
        ok: true,
        shopName: settings.shopName,
        shopPhone: settings.shopPhone,
        shopAddress: settings.shopAddress,
        currency: settings.currency,
        lowStockThreshold: settings.lowStockThreshold,
        footerNote: settings.footerNote,
        categories: db.categories,
        brands: db.brands
      });
    }

    // ============ کاربران ============
    if (req.method === 'GET' && pathname === '/api/users') {
      return sendJSON(res, 200, { ok: true, users });
    }
    if (req.method === 'POST' && pathname === '/api/users/add') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return sendJSON(res, 400, { ok: false, error: 'نام الزامی است' });
      const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#0891b2', '#3b82f6'];
      const newUser = {
        id: 'u' + Date.now(),
        name,
        role: String(body.role || 'worker'),
        active: true,
        color: colors[users.length % colors.length]
      };
      users.push(newUser);
      saveJSON(USERS_FILE, users);
      return sendJSON(res, 200, { ok: true, user: newUser });
    }
    if (req.method === 'POST' && pathname === '/api/users/delete') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      users = users.filter(u => u.id !== body.id);
      saveJSON(USERS_FILE, users);
      return sendJSON(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/users/toggle') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      const u = users.find(x => x.id === body.id);
      if (u) { u.active = !u.active; saveJSON(USERS_FILE, users); }
      return sendJSON(res, 200, { ok: true, user: u });
    }

    // ============ دسته‌بندی ============
    if (req.method === 'GET' && pathname === '/api/categories') {
      return sendJSON(res, 200, { ok: true, categories: db.categories });
    }
    if (req.method === 'POST' && pathname === '/api/categories/add') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      const cat = {
        id: nextId('category'),
        name: String(body.name || '').trim(),
        icon: String(body.icon || '📦'),
        color: String(body.color || '#6366f1')
      };
      if (!cat.name) return sendJSON(res, 400, { ok: false, error: 'نام الزامی است' });
      db.categories.push(cat);
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true, category: cat });
    }
    if (req.method === 'POST' && pathname === '/api/categories/update') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      const cat = db.categories.find(c => c.id === body.id);
      if (!cat) return sendJSON(res, 404, { ok: false, error: 'not found' });
      if (body.name !== undefined) cat.name = String(body.name);
      if (body.icon !== undefined) cat.icon = String(body.icon);
      if (body.color !== undefined) cat.color = String(body.color);
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true, category: cat });
    }
    if (req.method === 'POST' && pathname === '/api/categories/delete') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      db.categories = db.categories.filter(c => c.id !== body.id);
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true });
    }

    // ============ برندها ============
    if (req.method === 'GET' && pathname === '/api/brands') {
      return sendJSON(res, 200, { ok: true, brands: db.brands });
    }
    if (req.method === 'POST' && pathname === '/api/brands/add') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      const b = { id: nextId('brand'), name: String(body.name || '').trim(), icon: String(body.icon || '🏷️') };
      if (!b.name) return sendJSON(res, 400, { ok: false, error: 'نام الزامی است' });
      db.brands.push(b);
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true, brand: b });
    }
    if (req.method === 'POST' && pathname === '/api/brands/delete') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      db.brands = db.brands.filter(b => b.id !== body.id);
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true });
    }

    // ============ محصولات ============
    if (req.method === 'GET' && pathname === '/api/products') {
      return sendJSON(res, 200, { ok: true, products: db.products, count: db.products.length });
    }
    if (req.method === 'GET' && pathname === '/api/products/lookup') {
      const barcode = url.searchParams.get('barcode') || '';
      const p = findProduct(barcode);
      return sendJSON(res, 200, { ok: true, product: p || null });
    }
    if (req.method === 'GET' && pathname === '/api/products/search') {
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      if (!q) return sendJSON(res, 200, { ok: true, products: [] });
      const found = db.products.filter(p => p.name.toLowerCase().includes(q) || String(p.barcode || '').includes(q)).slice(0, 20);
      return sendJSON(res, 200, { ok: true, products: found });
    }
    if (req.method === 'GET' && pathname === '/api/products/low-stock') {
      const threshold = Number(url.searchParams.get('threshold') || settings.lowStockThreshold || 3);
      const low = db.products.filter(p => Number(p.stock || 0) <= threshold);
      return sendJSON(res, 200, { ok: true, products: low, threshold });
    }
    if (req.method === 'POST' && pathname === '/api/products/add') {
      const body = await readBody(req);
      const barcode = String(body.barcode || '').trim();
      const name = String(body.name || '').trim();
      if (!name) return sendJSON(res, 400, { ok: false, error: 'نام الزامی است' });
      if (barcode && db.products.some(p => String(p.barcode) === barcode)) {
        return sendJSON(res, 409, { ok: false, error: 'بارکد تکراری است' });
      }
      const p = {
        id: nextId('product'),
        barcode,
        name,
        sku: String(body.sku || ''),
        unit: String(body.unit || 'عدد'),
        categoryId: Number(body.categoryId) || null,
        brandId: Number(body.brandId) || null,
        costPrice: Number(body.costPrice) || 0,
        sellPrice: Number(body.sellPrice) || 0,
        stock: Number(body.stock) || 0,
        minStock: Number(body.minStock) || 3,
        note: String(body.note || ''),
        createdAt: new Date().toISOString(),
        createdBy: String(body.createdBy || 'admin')
      };
      db.products.push(p);
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true, product: p });
    }
    if (req.method === 'POST' && pathname === '/api/products/update') {
      const body = await readBody(req);
      const p = db.products.find(x => x.id === body.id);
      if (!p) return sendJSON(res, 404, { ok: false, error: 'not found' });
      ['name', 'sku', 'unit', 'barcode', 'note'].forEach(k => {
        if (body[k] !== undefined) p[k] = String(body[k]);
      });
      ['categoryId', 'brandId', 'costPrice', 'sellPrice', 'stock', 'minStock'].forEach(k => {
        if (body[k] !== undefined) p[k] = Number(body[k]);
      });
      p.updatedAt = new Date().toISOString();
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true, product: p });
    }
    if (req.method === 'POST' && pathname === '/api/products/delete') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      db.products = db.products.filter(p => p.id !== body.id);
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true });
    }

    // ============ خرید ============
    if (req.method === 'GET' && pathname === '/api/purchases') {
      return sendJSON(res, 200, { ok: true, purchases: db.purchases });
    }
    if (req.method === 'POST' && pathname === '/api/purchases/add') {
      const body = await readBody(req);
      const productId = Number(body.productId);
      const quantity = Number(body.quantity) || 1;
      const costPrice = Number(body.costPrice) || 0;
      const p = db.products.find(x => x.id === productId);
      if (!p) return sendJSON(res, 404, { ok: false, error: 'product not found' });
      const purchase = {
        id: nextId('purchase'),
        productId,
        quantity,
        costPrice,
        total: quantity * costPrice,
        supplier: String(body.supplier || ''),
        note: String(body.note || ''),
        date: String(body.date || new Date().toISOString()),
        createdBy: String(body.createdBy || 'admin')
      };
      db.purchases.push(purchase);
      p.stock = Number(p.stock || 0) + quantity;
      if (costPrice > 0) p.costPrice = costPrice;
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true, purchase });
    }

    // ============ فروش (مستقیم) ============
    if (req.method === 'GET' && pathname === '/api/sales') {
      return sendJSON(res, 200, { ok: true, sales: db.sales });
    }
    if (req.method === 'POST' && pathname === '/api/sales/add') {
      const body = await readBody(req);
      const productId = Number(body.productId);
      const quantity = Number(body.quantity) || 1;
      const sellPrice = Number(body.sellPrice) || 0;
      const p = db.products.find(x => x.id === productId);
      if (!p) return sendJSON(res, 404, { ok: false, error: 'product not found' });
      if (Number(p.stock) < quantity) return sendJSON(res, 400, { ok: false, error: 'موجودی کافی نیست' });
      const sale = {
        id: nextId('sale'),
        productId,
        quantity,
        sellPrice,
        total: quantity * sellPrice,
        customer: String(body.customer || ''),
        note: String(body.note || ''),
        date: String(body.date || new Date().toISOString()),
        createdBy: String(body.createdBy || 'admin')
      };
      db.sales.push(sale);
      p.stock = Number(p.stock) - quantity;
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true, sale });
    }

    // ============ فاکتور باز ============
    if (req.method === 'GET' && pathname === '/api/invoice/open') {
      const worker = url.searchParams.get('worker') || '';
      return sendJSON(res, 200, { ok: true, invoice: openInvoices[worker] || null });
    }
    if (req.method === 'POST' && pathname === '/api/invoice/start') {
      const body = await readBody(req);
      const worker = String(body.worker || '').trim();
      if (!worker) return sendJSON(res, 400, { ok: false, error: 'worker required' });
      if (openInvoices[worker]) return sendJSON(res, 200, { ok: true, invoice: openInvoices[worker] });
      openInvoices[worker] = { worker, items: [], startedAt: new Date().toISOString() };
      saveJSON(OPEN_INVOICES_FILE, openInvoices);
      return sendJSON(res, 200, { ok: true, invoice: openInvoices[worker] });
    }
    if (req.method === 'POST' && pathname === '/api/invoice/add') {
      const body = await readBody(req);
      const worker = String(body.worker || '').trim();
      const barcode = String(body.barcode || '').trim();
      const qty = Math.max(1, Number(body.qty) || 1);
      const p = body.product || findProduct(barcode);
      if (!worker) return sendJSON(res, 400, { ok: false, error: 'worker required' });
      if (!openInvoices[worker]) openInvoices[worker] = { worker, items: [], startedAt: new Date().toISOString() };
      const inv = openInvoices[worker];
      const idx = inv.items.findIndex(it => String(it.barcode) === barcode);
      const available = Number(p?.stock || 0);
      if (idx >= 0) {
        if (available > 0 && inv.items[idx].qty + qty > available) {
          return sendJSON(res, 200, { ok: true, invoice: inv, warning: `موجودی کافی نیست! موجودی: ${available}` });
        }
        inv.items[idx].qty += qty;
      } else {
        inv.items.push({
          id: 'it_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          barcode,
          name: p?.name || 'کالای نامشخص',
          sellPrice: Number(p?.sellPrice || 0),
          buyPrice: Number(p?.costPrice || 0),
          qty,
          available
        });
      }
      saveJSON(OPEN_INVOICES_FILE, openInvoices);
      return sendJSON(res, 200, { ok: true, invoice: inv });
    }
    if (req.method === 'POST' && pathname === '/api/invoice/remove') {
      const body = await readBody(req);
      const worker = String(body.worker || '').trim();
      const itemId = String(body.itemId || '').trim();
      if (!worker || !openInvoices[worker]) return sendJSON(res, 400, { ok: false, error: 'no open invoice' });
      openInvoices[worker].items = openInvoices[worker].items.filter(it => it.id !== itemId);
      saveJSON(OPEN_INVOICES_FILE, openInvoices);
      return sendJSON(res, 200, { ok: true, invoice: openInvoices[worker] });
    }
    if (req.method === 'POST' && pathname === '/api/invoice/changeQty') {
      const body = await readBody(req);
      const worker = String(body.worker || '').trim();
      const itemId = String(body.itemId || '').trim();
      const delta = Number(body.delta || 0);
      if (!worker || !openInvoices[worker]) return sendJSON(res, 400, { ok: false, error: 'no open invoice' });
      const it = openInvoices[worker].items.find(x => x.id === itemId);
      if (it) it.qty = Math.max(1, it.qty + delta);
      saveJSON(OPEN_INVOICES_FILE, openInvoices);
      return sendJSON(res, 200, { ok: true, invoice: openInvoices[worker] });
    }
    if (req.method === 'POST' && pathname === '/api/invoice/clear') {
      const body = await readBody(req);
      const worker = String(body.worker || '').trim();
      if (!worker || !openInvoices[worker]) return sendJSON(res, 400, { ok: false, error: 'no open invoice' });
      openInvoices[worker].items = [];
      saveJSON(OPEN_INVOICES_FILE, openInvoices);
      return sendJSON(res, 200, { ok: true, invoice: openInvoices[worker] });
    }
    if (req.method === 'POST' && pathname === '/api/invoice/close') {
      const body = await readBody(req);
      const worker = String(body.worker || '').trim();
      if (!worker || !openInvoices[worker]) return sendJSON(res, 400, { ok: false, error: 'no open invoice' });
      const inv = openInvoices[worker];
      if (!inv.items.length) return sendJSON(res, 400, { ok: false, error: 'فاکتور خالی است' });
      const subtotal = inv.items.reduce((s, it) => s + it.qty * it.sellPrice, 0);
      const discount = Number(body.discount) || 0;
      const finalPayable = Math.max(0, subtotal - discount);
      const invoiceNumber = 'INV-' + String(db.invoices.length + 1001);
      const finalInvoice = {
        id: 'inv_' + Date.now(),
        invoiceNumber,
        worker,
        customerName: String(body.customerName || '').trim() || 'مشتری آزاد',
        customerPhone: String(body.customerPhone || '').trim(),
        paymentMethod: String(body.paymentMethod || 'نقدی'),
        items: inv.items.map(it => ({ ...it })),
        subtotal,
        discount,
        finalPayable,
        date: new Date().toISOString(),
        startedAt: inv.startedAt
      };
      // کم کردن موجودی
      inv.items.forEach(it => {
        const p = db.products.find(x => String(x.barcode) === String(it.barcode));
        if (p) p.stock = Math.max(0, Number(p.stock || 0) - it.qty);
      });
      // ثبت در sales
      inv.items.forEach(it => {
        db.sales.push({
          id: nextId('sale'),
          productId: db.products.find(x => String(x.barcode) === String(it.barcode))?.id,
          quantity: it.qty,
          sellPrice: it.sellPrice,
          total: it.qty * it.sellPrice,
          customer: finalInvoice.customerName,
          date: finalInvoice.date,
          invoiceNumber,
          createdBy: worker
        });
      });
      db.invoices.unshift(finalInvoice);
      saveJSON(DB_FILE, db);
      delete openInvoices[worker];
      saveJSON(OPEN_INVOICES_FILE, openInvoices);
      return sendJSON(res, 200, { ok: true, invoice: finalInvoice });
    }
    if (req.method === 'GET' && pathname === '/api/invoices') {
      return sendJSON(res, 200, { ok: true, invoices: db.invoices });
    }
    if (req.method === 'POST' && pathname === '/api/invoices/delete') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      db.invoices = db.invoices.filter(i => i.id !== body.id);
      saveJSON(DB_FILE, db);
      return sendJSON(res, 200, { ok: true });
    }

    // ============ گزارش‌ها ============
    if (req.method === 'GET' && pathname === '/api/reports/workers') {
      const stats = {};
      users.forEach(u => stats[u.name] = { name: u.name, count: 0, total: 0, today: 0, todayCount: 0 });
      const today = new Date().toDateString();
      db.invoices.forEach(inv => {
        if (!stats[inv.worker]) stats[inv.worker] = { name: inv.worker, count: 0, total: 0, today: 0, todayCount: 0 };
        stats[inv.worker].count++;
        stats[inv.worker].total += inv.finalPayable;
        if (new Date(inv.date).toDateString() === today) {
          stats[inv.worker].todayCount++;
          stats[inv.worker].today += inv.finalPayable;
        }
      });
      return sendJSON(res, 200, { ok: true, stats: Object.values(stats) });
    }
    if (req.method === 'GET' && pathname === '/api/reports/sales') {
      const days = Number(url.searchParams.get('days') || 30);
      const result = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayStr = d.toDateString();
        const dayInv = db.invoices.filter(inv => new Date(inv.date).toDateString() === dayStr);
        result.push({
          date: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }),
          count: dayInv.length,
          total: dayInv.reduce((s, inv) => s + inv.finalPayable, 0)
        });
      }
      return sendJSON(res, 200, { ok: true, sales: result });
    }
    if (req.method === 'GET' && pathname === '/api/reports/summary') {
      const today = new Date().toDateString();
      const todayInv = db.invoices.filter(inv => new Date(inv.date).toDateString() === today);
      const todaySales = todayInv.reduce((s, inv) => s + inv.finalPayable, 0);
      const totalSales = db.invoices.reduce((s, inv) => s + inv.finalPayable, 0);
      const totalProfit = db.invoices.reduce((s, inv) => {
        return s + inv.items.reduce((ss, it) => ss + (it.sellPrice - (it.buyPrice || 0)) * it.qty, 0);
      }, 0);
      const stockValue = db.products.reduce((s, p) => s + Number(p.stock || 0) * Number(p.costPrice || 0), 0);
      return sendJSON(res, 200, {
        ok: true,
        todaySales,
        todayCount: todayInv.length,
        totalSales,
        totalProfit,
        totalInvoices: db.invoices.length,
        totalProducts: db.products.length,
        totalStock: db.products.reduce((s, p) => s + Number(p.stock || 0), 0),
        stockValue,
        lowStock: db.products.filter(p => Number(p.stock || 0) <= settings.lowStockThreshold).length
      });
    }

    // ============ تنظیمات ============
    if (req.method === 'GET' && pathname === '/api/settings') {
      const s = { ...settings };
      delete s.adminPassword;
      return sendJSON(res, 200, { ok: true, settings: s });
    }
    if (req.method === 'POST' && pathname === '/api/settings') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      const body = await readBody(req);
      ['shopName', 'shopPhone', 'shopAddress', 'footerNote', 'currency'].forEach(k => {
        if (body[k] !== undefined) settings[k] = String(body[k]);
      });
      ['lowStockThreshold', 'autoBackupHours'].forEach(k => {
        if (body[k] !== undefined) settings[k] = Number(body[k]);
      });
      if (body.adminPassword && String(body.adminPassword).length >= 4) {
        settings.adminPassword = String(body.adminPassword);
      }
      saveJSON(SETTINGS_FILE, settings);
      return sendJSON(res, 200, { ok: true, message: 'ذخیره شد' });
    }
    if (req.method === 'POST' && pathname === '/api/backup') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      autoBackup();
      return sendJSON(res, 200, { ok: true, message: 'بکاپ گرفته شد' });
    }

    // ============ فایل‌های استاتیک ============
    if (req.method === 'GET') {
      let filePath;
      if (pathname === '/' || pathname === '/worker' || pathname === '/worker.html') {
        filePath = path.join(PUBLIC_DIR, 'worker.html');
      } else if (pathname === '/admin' || pathname === '/admin.html') {
        filePath = path.join(PUBLIC_DIR, 'admin.html');
      } else {
        filePath = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
      }
      if (!filePath.startsWith(PUBLIC_DIR)) {
        return sendJSON(res, 403, { ok: false, error: 'forbidden' });
      }
      if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        return sendFile(res, filePath);
      }
      return sendJSON(res, 404, { ok: false, error: 'not found' });
    }

    return sendJSON(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    console.error('Error:', e);
    sendJSON(res, 500, { ok: false, error: e.message });
  }
}

// ===================================================================
//  شروع سرور (HTTPS اگر گواهی موجود باشد)
// ===================================================================
let server;
try {
  const certPath = path.join(ROOT, 'cert.pem');
  const keyPath = path.join(ROOT, 'key.pem');
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    server = https.createServer({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    }, handle);
  } else {
    throw new Error('no cert');
  }
} catch {
  server = http.createServer(handle);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  📦  انباریار | Anbariyar');
  console.log('  ✨  ساخته شده با ❤️  توسط آرین');
  console.log('  📌  نسخه: 3.0');
  console.log('═══════════════════════════════════════════════');
  console.log('  🌐 پورت: ' + PORT);
  console.log('  🔐 HTTPS: ' + (fs.existsSync(path.join(ROOT, 'cert.pem')) ? 'بله' : 'خیر'));
  console.log('  📊 آمار:');
  console.log('     - کالاها: ' + db.products.length);
  console.log('     - فاکتورها: ' + db.invoices.length);
  console.log('     - کارگرا: ' + users.length);
  console.log('  🔗 آدرس‌ها:');
  console.log('     - صندوق: /worker.html');
  console.log('     - مدیر:  /admin.html');
  console.log('  🔑 رمز مدیر پیش‌فرض: ' + settings.adminPassword);
  console.log('═══════════════════════════════════════════════');
  console.log('');
});
