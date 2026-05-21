/* תקשורת נחף — שרת ניהול החנות
   שרת קטן שמגיש את האתר ומספק API לקריאה/כתיבה אל data/db.json */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4750;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- שכבת בסיס הנתונים (קובץ JSON) ---
const EMPTY_DB = {
  customers: [], repairs: [], inventory: [],
  invoices: [], products: [], suppliers: [], employees: [],
  meta: { invoiceCounter: 1000 }
};

function ensureDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
}
function readDB() {
  ensureDB();
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return Object.assign({}, EMPTY_DB, db);
  } catch (e) {
    console.error('שגיאת קריאת בסיס נתונים:', e.message);
    return JSON.parse(JSON.stringify(EMPTY_DB));
  }
}
function writeDB(db) {
  ensureDB();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}
function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const COLLECTIONS = ['customers', 'repairs', 'inventory', 'invoices', 'products', 'suppliers', 'employees'];
const valid = c => COLLECTIONS.includes(c);

// --- נתיבי API ---

// כל בסיס הנתונים
app.get('/api/db', (req, res) => res.json(readDB()));

// שחזור בסיס הנתונים כולו מקובץ גיבוי
app.put('/api/db', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.customers))
    return res.status(400).json({ error: 'קובץ גיבוי לא תקין' });
  writeDB(Object.assign({}, EMPTY_DB, req.body));
  res.json({ ok: true });
});

// אוסף שלם
app.get('/api/:collection', (req, res) => {
  if (!valid(req.params.collection)) return res.status(404).json({ error: 'אוסף לא קיים' });
  res.json(readDB()[req.params.collection] || []);
});

// הוספת רשומה
app.post('/api/:collection', (req, res) => {
  const col = req.params.collection;
  if (!valid(col)) return res.status(404).json({ error: 'אוסף לא קיים' });
  const db = readDB();
  if (!db[col]) db[col] = [];
  const item = Object.assign({}, req.body, {
    id: req.body.id || genId(col.slice(0, 3)),
    createdAt: new Date().toISOString()
  });
  // מספר חשבונית רץ
  if (col === 'invoices' && !item.number) {
    db.meta.invoiceCounter = (db.meta.invoiceCounter || 1000) + 1;
    item.number = db.meta.invoiceCounter;
  }
  db[col].push(item);
  writeDB(db);
  res.json(item);
});

// עדכון רשומה
app.put('/api/:collection/:id', (req, res) => {
  const col = req.params.collection;
  if (!valid(col)) return res.status(404).json({ error: 'אוסף לא קיים' });
  const db = readDB();
  const arr = db[col] || [];
  const idx = arr.findIndex(x => String(x.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'רשומה לא נמצאה' });
  arr[idx] = Object.assign({}, arr[idx], req.body, {
    id: arr[idx].id,
    createdAt: arr[idx].createdAt,
    updatedAt: new Date().toISOString()
  });
  writeDB(db);
  res.json(arr[idx]);
});

// מחיקת רשומה
app.delete('/api/:collection/:id', (req, res) => {
  const col = req.params.collection;
  if (!valid(col)) return res.status(404).json({ error: 'אוסף לא קיים' });
  const db = readDB();
  db[col] = (db[col] || []).filter(x => String(x.id) !== String(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});

function start(port, attempt) {
  ensureDB();
  const server = app.listen(port, () => {
    console.log('───────────────────────────────────────');
    console.log('  תקשורת נחף — מערכת ניהול החנות');
    console.log('  השרת פעיל:  http://localhost:' + port);
    console.log('───────────────────────────────────────');
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE' && attempt < 12) {
      console.log('  פורט ' + port + ' תפוס — מנסה פורט ' + (port + 1) + '...');
      start(port + 1, attempt + 1);
    } else {
      console.error('שגיאת הפעלת השרת:', err.message);
      process.exit(1);
    }
  });
}
start(PORT, 0);
