/* ===== תקשורת נחף — לוגיקת המערכת ===== */

const API = '/api';
const state = { db: {}, view: 'dashboard' };

/* ---------- עזרי תצוגה ---------- */
const ILS = n => '₪' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('he-IL');
const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL') : '—';
const fmtDateTime = d => d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = sel => document.querySelector(sel);

/* ---------- קבועים ---------- */
const STATUS = {
  received:   { label: 'התקבל',         cls: 'st-received' },
  in_progress:{ label: 'בתיקון',         cls: 'st-progress' },
  ready:      { label: 'מוכן לאיסוף',    cls: 'st-ready' },
  delivered:  { label: 'נמסר ללקוח',     cls: 'st-delivered' }
};
const STATUS_ORDER = ['received', 'in_progress', 'ready', 'delivered'];
const CATEGORIES = ['מסך', 'סוללה', 'מצלמה', 'שקע טעינה', 'רמקול', 'גב / כיסוי', 'כבל / מטען', 'אחר'];
const PAYMENT = ['מזומן', 'אשראי', 'העברה בנקאית', 'ביט / פייבוקס', 'לא שולם'];

const NAV = [
  { id: 'dashboard', label: 'לוח בקרה',     ico: '📊' },
  { id: 'customers', label: 'לקוחות',       ico: '👥' },
  { id: 'repairs',   label: 'תיקונים',      ico: '🔧' },
  { id: 'inventory', label: 'מלאי וחלקים',  ico: '📦' },
  { id: 'invoices',  label: 'חשבוניות',     ico: '🧾' },
  { id: 'products',  label: 'חנות מוצרים',  ico: '🛒' },
  { id: 'suppliers', label: 'ספקים',        ico: '🚚' },
  { id: 'employees', label: 'עובדים',       ico: '🧑‍🔧' },
  { id: 'search',    label: 'חיפוש חכם',    ico: '🔍' }
];

/* ---------- שכבת אחסון: שרת מקומי או אחסון הדפדפן (Vercel) ----------
   server  = רץ עם npm start, הנתונים נשמרים בקובץ data/db.json
   local   = רץ ב-Vercel / ללא שרת, הנתונים נשמרים בדפדפן (localStorage) */
let MODE = 'server';
const LOCAL_KEY = 'tikshoret_nahef_db_v1';

function newId(name) {
  return name.slice(0, 3) + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function saveLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state.db)); } catch (e) {}
}

async function api(method, path, body) {
  if (MODE === 'server') {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error('שגיאת שרת');
    return res.json();
  }
  return localApi(method, path, body);
}

// אותו ממשק כמו השרת — אך מול אחסון הדפדפן
function localApi(method, path, body) {
  const parts = path.split('/').filter(Boolean);
  const name = parts[0], id = parts[1];

  if (name === 'db') {
    if (method === 'PUT') { state.db = body || state.db; saveLocal(); return { ok: true }; }
    return JSON.parse(JSON.stringify(state.db));
  }
  state.db[name] = state.db[name] || [];

  if (method === 'GET') return state.db[name];
  if (method === 'POST') {
    const item = Object.assign({}, body, { id: body.id || newId(name), createdAt: new Date().toISOString() });
    if (name === 'invoices' && !item.number) {
      state.db.meta = state.db.meta || { invoiceCounter: 1000 };
      state.db.meta.invoiceCounter = (state.db.meta.invoiceCounter || 1000) + 1;
      item.number = state.db.meta.invoiceCounter;
    }
    state.db[name].push(item);
    saveLocal();
    return item;
  }
  if (method === 'PUT') {
    const arr = state.db[name];
    const idx = arr.findIndex(x => String(x.id) === String(id));
    if (idx === -1) throw new Error('רשומה לא נמצאה');
    arr[idx] = Object.assign({}, arr[idx], body, { id: arr[idx].id, updatedAt: new Date().toISOString() });
    saveLocal();
    return arr[idx];
  }
  if (method === 'DELETE') {
    state.db[name] = state.db[name].filter(x => String(x.id) !== String(id));
    saveLocal();
    return { ok: true };
  }
}

async function loadDB() {
  if (MODE === 'server') state.db = await api('GET', '/db');
  // במצב מקומי — state.db כבר מעודכן בזיכרון ובדפדפן
}

/* ---------- עזרי נתונים ---------- */
const col = name => state.db[name] || [];
const byId = (name, id) => col(name).find(x => String(x.id) === String(id));
const custName = id => (byId('customers', id) || {}).name || '—';
const empName  = id => (byId('employees', id) || {}).name || '—';
const supName  = id => (byId('suppliers', id) || {}).name || '—';

function repairPartsCost(r) {
  return (r.partsUsed || []).reduce((s, p) => s + (Number(p.cost) || 0) * (Number(p.qty) || 1), 0);
}
function repairProfit(r) {
  return (Number(r.totalPrice) || 0) - repairPartsCost(r);
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, type = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

/* ===========================================================
   ניווט ורינדור ראשי
   =========================================================== */
function renderNav() {
  const lowStock = col('inventory').filter(i => Number(i.quantity) <= Number(i.minQuantity)).length;
  const openRepairs = col('repairs').filter(r => r.status !== 'delivered').length;
  $('#nav').innerHTML = NAV.map(n => {
    let badge = '';
    if (n.id === 'inventory' && lowStock) badge = `<span class="nav-badge">${lowStock}</span>`;
    if (n.id === 'repairs' && openRepairs) badge = `<span class="nav-badge">${openRepairs}</span>`;
    return `<button class="nav-item ${state.view === n.id ? 'active' : ''}" data-view="${n.id}">
      <span class="nav-ico">${n.ico}</span><span>${n.label}</span>${badge}</button>`;
  }).join('');
  $('#nav').querySelectorAll('.nav-item').forEach(b =>
    b.onclick = () => { state.view = b.dataset.view; render(); });
}

function render() {
  renderNav();
  const views = {
    dashboard: renderDashboard,
    customers: renderCustomers,
    repairs:   renderRepairs,
    inventory: renderInventory,
    invoices:  renderInvoices,
    products:  renderProducts,
    suppliers: renderSuppliers,
    employees: renderEmployees,
    search:    renderSearch
  };
  (views[state.view] || renderDashboard)();
  window.scrollTo(0, 0);
}

/* ===========================================================
   לוח בקרה
   =========================================================== */
function renderDashboard() {
  const repairs = col('repairs'), inv = col('inventory'), invoices = col('invoices');
  const open = repairs.filter(r => r.status !== 'delivered');
  const ready = repairs.filter(r => r.status === 'ready');
  const lowStock = inv.filter(i => Number(i.quantity) <= Number(i.minQuantity));
  const revenue = invoices.filter(i => i.paid).reduce((s, i) => s + (Number(i.total) || 0), 0);
  const profit = repairs.reduce((s, r) => s + repairProfit(r), 0);
  const stockValue = inv.reduce((s, i) => s + (Number(i.costPrice) || 0) * (Number(i.quantity) || 0), 0);

  const counts = STATUS_ORDER.map(s => repairs.filter(r => r.status === s).length);
  const maxC = Math.max(1, ...counts);
  const barColors = { received: '#d98a00', in_progress: '#2563eb', ready: '#15a060', delivered: '#8a93a6' };

  const recent = [...repairs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

  $('#main').innerHTML = `
    <div class="page-head">
      <div><h1>שלום, נחף 👋</h1><div class="sub">${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
      <button class="btn" id="quickRepair">＋ תיקון חדש</button>
    </div>

    ${lowStock.length ? `<div class="alert-stock">⚠️ ${lowStock.length} פריטים במלאי נמוך או אזל — ${lowStock.slice(0,3).map(i=>esc(i.name)).join(', ')}${lowStock.length>3?' ועוד...':''}</div>` : ''}

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-top"><div class="stat-ico">🔧</div></div>
        <div class="stat-val">${open.length}</div><div class="stat-label">תיקונים פתוחים</div>
      </div>
      <div class="stat-card s-ok">
        <div class="stat-top"><div class="stat-ico">✅</div></div>
        <div class="stat-val">${ready.length}</div><div class="stat-label">מוכנים לאיסוף</div>
      </div>
      <div class="stat-card s-warn">
        <div class="stat-top"><div class="stat-ico">📦</div></div>
        <div class="stat-val">${lowStock.length}</div><div class="stat-label">פריטים במלאי נמוך</div>
      </div>
      <div class="stat-card s-ink">
        <div class="stat-top"><div class="stat-ico">👥</div></div>
        <div class="stat-val">${col('customers').length}</div><div class="stat-label">לקוחות רשומים</div>
      </div>
      <div class="stat-card s-ok">
        <div class="stat-top"><div class="stat-ico">💰</div></div>
        <div class="stat-val">${ILS(revenue)}</div><div class="stat-label">הכנסות שנגבו</div>
      </div>
      <div class="stat-card">
        <div class="stat-top"><div class="stat-ico">📈</div></div>
        <div class="stat-val">${ILS(profit)}</div><div class="stat-label">רווח מצטבר מתיקונים</div>
      </div>
      <div class="stat-card s-ink">
        <div class="stat-top"><div class="stat-ico">🏷️</div></div>
        <div class="stat-val">${ILS(stockValue)}</div><div class="stat-label">שווי המלאי (עלות)</div>
      </div>
      <div class="stat-card">
        <div class="stat-top"><div class="stat-ico">🧾</div></div>
        <div class="stat-val">${invoices.length}</div><div class="stat-label">חשבוניות שהופקו</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>תיקונים אחרונים</h2>
          <button class="btn-sm btn btn-sec" data-goto="repairs">לכל התיקונים</button></div>
        <div class="tbl-wrap">
          <table class="tbl"><thead><tr>
            <th>לקוח</th><th>מכשיר</th><th>סטטוס</th><th>מחיר</th><th>תאריך</th>
          </tr></thead><tbody>
          ${recent.length ? recent.map(r => `<tr class="row-click" data-rep="${r.id}">
            <td class="t-strong">${esc(custName(r.customerId))}</td>
            <td>${esc(r.device)}</td>
            <td><span class="badge ${STATUS[r.status].cls}">${STATUS[r.status].label}</span></td>
            <td class="t-money">${ILS(r.totalPrice)}</td>
            <td class="t-mut">${fmtDate(r.createdAt)}</td>
          </tr>`).join('') : `<tr><td colspan="5" class="empty"><div class="e-ico">🔧</div><p>אין תיקונים עדיין</p></td></tr>`}
          </tbody></table>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>פילוח סטטוס תיקונים</h2></div>
        <div class="card-pad">
          <div class="status-bars">
            ${STATUS_ORDER.map((s, i) => `<div class="sb-row">
              <div class="sb-label">${STATUS[s].label}</div>
              <div class="sb-track"><div class="sb-fill" style="width:${counts[i]/maxC*100}%;background:${barColors[s]}"></div></div>
              <div class="sb-val">${counts[i]}</div>
            </div>`).join('')}
          </div>
        </div>
        <div class="card-head" style="border-top:1px solid var(--line)"><h2>התראות מלאי</h2></div>
        <div class="card-body">
          ${lowStock.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>
            ${lowStock.slice(0,6).map(i => `<tr class="row-click" data-inv="${i.id}">
              <td class="t-strong">${esc(i.name)}</td>
              <td>${Number(i.quantity)===0 ? '<span class="pill-no">אזל מהמלאי</span>' : `<span class="pill-warn">נותרו ${i.quantity}</span>`}</td>
            </tr>`).join('')}
          </tbody></table></div>` : `<div class="empty" style="padding:26px"><div class="e-ico">👍</div><p>כל הפריטים במלאי תקין</p></div>`}
        </div>
      </div>
    </div>
  `;
  $('#quickRepair').onclick = () => openForm('repairs');
  $('#main').querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { state.view = b.dataset.goto; render(); });
  $('#main').querySelectorAll('[data-rep]').forEach(r => r.onclick = () => openForm('repairs', byId('repairs', r.dataset.rep)));
  $('#main').querySelectorAll('[data-inv]').forEach(r => r.onclick = () => openForm('inventory', byId('inventory', r.dataset.inv)));
}

/* ===========================================================
   רכיב כללי: כותרת + סרגל חיפוש/סינון
   =========================================================== */
function pageHead(title, sub, addLabel, addFn) {
  setTimeout(() => { const b = $('#addBtn'); if (b) b.onclick = addFn; }, 0);
  return `<div class="page-head">
    <div><h1>${title}</h1><div class="sub">${sub}</div></div>
    ${addLabel ? `<button class="btn" id="addBtn">＋ ${addLabel}</button>` : ''}
  </div>`;
}

function attachFilter(inputId, rows, renderRows, selId) {
  const run = () => {
    const q = ($(inputId) ? $(inputId).value : '').trim().toLowerCase();
    const f = selId && $(selId) ? $(selId).value : '';
    renderRows(q, f);
  };
  if ($(inputId)) $(inputId).oninput = run;
  if (selId && $(selId)) $(selId).onchange = run;
}

/* ===========================================================
   לקוחות
   =========================================================== */
function renderCustomers() {
  const head = pageHead('ניהול לקוחות', 'כרטיס אישי לכל לקוח עם היסטוריית תיקונים ותשלומים', 'לקוח חדש', () => openForm('customers'));
  $('#main').innerHTML = head + `
    <div class="card">
      <div class="toolbar">
        <div class="search-mini">
          <svg viewBox="0 0 24 24" class="ico"><path d="M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>
          <input id="fltCustomers" placeholder="חיפוש לפי שם, טלפון, כתובת..." />
        </div>
      </div>
      <div class="tbl-wrap" id="custTbl"></div>
    </div>`;
  const draw = (q = '') => {
    let rows = col('customers');
    if (q) rows = rows.filter(c => [c.name, c.phone, c.address, c.email].some(v => String(v||'').toLowerCase().includes(q)));
    rows = [...rows].sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
    $('#custTbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr>
      <th>שם הלקוח</th><th>טלפון</th><th>כתובת</th><th>תיקונים</th><th>סך תשלומים</th><th></th>
    </tr></thead><tbody>${rows.map(c => {
      const reps = col('repairs').filter(r => r.customerId === c.id);
      const paid = col('invoices').filter(i => i.customerId === c.id && i.paid).reduce((s,i)=>s+(Number(i.total)||0),0);
      return `<tr class="row-click" data-card="${c.id}">
        <td class="t-strong">${esc(c.name)}</td>
        <td><a href="tel:${esc(c.phone)}" style="color:var(--blue);text-decoration:none;font-weight:600">${esc(c.phone)}</a></td>
        <td class="t-mut">${esc(c.address)||'—'}</td>
        <td><span class="tag">${reps.length} תיקונים</span></td>
        <td class="t-money">${ILS(paid)}</td>
        <td><div class="row-actions">
          <button class="icon-btn" data-edit="${c.id}" title="עריכה">✎</button>
          <button class="icon-btn del" data-del="${c.id}" title="מחיקה">🗑</button>
        </div></td>
      </tr>`; }).join('')}</tbody></table>`
      : `<div class="empty"><div class="e-ico">👥</div><p>${q?'לא נמצאו לקוחות':'אין לקוחות עדיין — הוסיפו את הראשון'}</p></div>`;
    bindRowActions('custTbl', 'customers', { card: openCustomerCard });
  };
  draw();
  attachFilter('#fltCustomers', null, draw);
}

function openCustomerCard(id) {
  const c = byId('customers', id);
  if (!c) return;
  const reps = col('repairs').filter(r => r.customerId === id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const invs = col('invoices').filter(i => i.customerId === id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const totalPaid = invs.filter(i=>i.paid).reduce((s,i)=>s+(Number(i.total)||0),0);

  openModal('כרטיס לקוח — ' + c.name, `
    <div class="kv-grid">
      <div class="kv"><div class="k">טלפון</div><div class="v">${esc(c.phone)}</div></div>
      <div class="kv"><div class="k">דוא"ל</div><div class="v">${esc(c.email)||'—'}</div></div>
      <div class="kv"><div class="k">כתובת</div><div class="v">${esc(c.address)||'—'}</div></div>
      <div class="kv"><div class="k">לקוח מאז</div><div class="v">${fmtDate(c.createdAt)}</div></div>
      <div class="kv"><div class="k">סה"כ תיקונים</div><div class="v">${reps.length}</div></div>
      <div class="kv"><div class="k">סך תשלומים</div><div class="v" style="color:var(--ok)">${ILS(totalPaid)}</div></div>
    </div>
    ${c.notes ? `<div class="kv" style="margin-top:10px"><div class="k">הערות</div><div class="v" style="font-weight:500">${esc(c.notes)}</div></div>` : ''}

    <div class="detail-section">
      <h4>היסטוריית תיקונים</h4>
      <div class="mini-list">
        ${reps.length ? reps.map(r => `<div class="mini-item">
          <span><b>${esc(r.device)}</b> — ${esc(r.issue)}</span>
          <span><span class="badge ${STATUS[r.status].cls}">${STATUS[r.status].label}</span> &nbsp; <b>${ILS(r.totalPrice)}</b></span>
        </div>`).join('') : '<div class="t-mut">אין תיקונים</div>'}
      </div>
    </div>
    <div class="detail-section">
      <h4>היסטוריית תשלומים</h4>
      <div class="mini-list">
        ${invs.length ? invs.map(i => `<div class="mini-item">
          <span>חשבונית #${i.number} — ${fmtDate(i.date)}</span>
          <span>${i.paid?'<span class="pill-ok">שולם</span>':'<span class="pill-no">לא שולם</span>'} &nbsp; <b>${ILS(i.total)}</b></span>
        </div>`).join('') : '<div class="t-mut">אין חשבוניות</div>'}
      </div>
    </div>
    <div class="form-actions">
      <button class="btn" id="cardEdit">✎ עריכת פרטים</button>
      <button class="btn btn-sec" id="cardRepair">＋ תיקון חדש ללקוח</button>
    </div>
  `);
  $('#cardEdit').onclick = () => openForm('customers', c);
  $('#cardRepair').onclick = () => openForm('repairs', { customerId: id });
}

/* ===========================================================
   תיקונים
   =========================================================== */
function renderRepairs() {
  const head = pageHead('ניהול תיקונים', 'כל מכשיר שנכנס מקבל כרטיס תיקון עם סטטוס ברור', 'תיקון חדש', () => openForm('repairs'));
  $('#main').innerHTML = head + `
    <div class="card">
      <div class="toolbar">
        <div class="search-mini">
          <svg viewBox="0 0 24 24" class="ico"><path d="M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>
          <input id="fltRepairs" placeholder="חיפוש לפי לקוח, מכשיר, תקלה..." />
        </div>
        <select class="filter-sel" id="fltRepStatus">
          <option value="">כל הסטטוסים</option>
          ${STATUS_ORDER.map(s => `<option value="${s}">${STATUS[s].label}</option>`).join('')}
        </select>
      </div>
      <div class="tbl-wrap" id="repTbl"></div>
    </div>`;
  const draw = (q = '', f = '') => {
    let rows = col('repairs');
    if (f) rows = rows.filter(r => r.status === f);
    if (q) rows = rows.filter(r => [custName(r.customerId), r.device, r.issue].some(v => String(v||'').toLowerCase().includes(q)));
    rows = [...rows].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    $('#repTbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr>
      <th>לקוח</th><th>מכשיר</th><th>תקלה</th><th>טכנאי</th><th>סטטוס</th><th>מחיר</th><th>רווח</th><th></th>
    </tr></thead><tbody>${rows.map(r => `<tr class="row-click" data-edit="${r.id}">
      <td class="t-strong">${esc(custName(r.customerId))}</td>
      <td>${esc(r.device)}</td>
      <td class="t-mut">${esc(r.issue).slice(0,40)}</td>
      <td class="t-mut">${esc(empName(r.assignedTo))}</td>
      <td><span class="badge ${STATUS[r.status].cls}">${STATUS[r.status].label}</span></td>
      <td class="t-money">${ILS(r.totalPrice)}</td>
      <td class="t-profit">${ILS(repairProfit(r))}</td>
      <td><div class="row-actions">
        <button class="icon-btn" data-invoice="${r.id}" title="צור חשבונית">🧾</button>
        <button class="icon-btn del" data-del="${r.id}" title="מחיקה">🗑</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`
      : `<div class="empty"><div class="e-ico">🔧</div><p>${q||f?'לא נמצאו תיקונים':'אין תיקונים עדיין'}</p></div>`;
    bindRowActions('repTbl', 'repairs', { edit: id => openForm('repairs', byId('repairs', id)), invoice: createInvoiceFromRepair });
  };
  draw();
  attachFilter('#fltRepairs', null, draw, '#fltRepStatus');
}

/* ===========================================================
   מלאי
   =========================================================== */
function renderInventory() {
  const head = pageHead('ניהול מלאי וחלקים', 'מסכים, סוללות, מצלמות — כמות, ספק ועלות לכל פריט', 'חלק חדש', () => openForm('inventory'));
  $('#main').innerHTML = head + `
    <div class="card">
      <div class="toolbar">
        <div class="search-mini">
          <svg viewBox="0 0 24 24" class="ico"><path d="M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>
          <input id="fltInv" placeholder="חיפוש לפי שם חלק או דגם מכשיר..." />
        </div>
        <select class="filter-sel" id="fltInvCat">
          <option value="">כל הקטגוריות</option>
          ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="tbl-wrap" id="invTbl"></div>
    </div>`;
  const draw = (q = '', f = '') => {
    let rows = col('inventory');
    if (f) rows = rows.filter(i => i.category === f);
    if (q) rows = rows.filter(i => [i.name, i.deviceModel, i.category].some(v => String(v||'').toLowerCase().includes(q)));
    rows = [...rows].sort((a,b)=> Number(a.quantity)-Number(b.quantity));
    $('#invTbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr>
      <th>שם החלק</th><th>קטגוריה</th><th>דגם</th><th>כמות</th><th>מיקום</th><th>עלות</th><th>מחיר מכירה</th><th>רווח</th><th>ספק</th><th></th>
    </tr></thead><tbody>${rows.map(i => {
      const low = Number(i.quantity) <= Number(i.minQuantity);
      const out = Number(i.quantity) === 0;
      const profit = (Number(i.sellPrice)||0)-(Number(i.costPrice)||0);
      return `<tr class="row-click" data-edit="${i.id}">
        <td class="t-strong">${esc(i.name)}</td>
        <td><span class="tag">${esc(i.category)}</span></td>
        <td class="t-mut">${esc(i.deviceModel)||'—'}</td>
        <td>${out?'<span class="pill-no">אזל</span>':low?`<span class="pill-warn">${i.quantity}</span>`:`<b>${i.quantity}</b>`}</td>
        <td class="t-mut">${esc(i.location)||'—'}</td>
        <td class="t-money">${ILS(i.costPrice)}</td>
        <td class="t-money">${ILS(i.sellPrice)}</td>
        <td class="t-profit">${ILS(profit)}</td>
        <td class="t-mut">${esc(supName(i.supplierId))}</td>
        <td><div class="row-actions">
          <button class="icon-btn del" data-del="${i.id}" title="מחיקה">🗑</button>
        </div></td>
      </tr>`; }).join('')}</tbody></table>`
      : `<div class="empty"><div class="e-ico">📦</div><p>${q||f?'לא נמצאו חלקים':'אין חלקים במלאי עדיין'}</p></div>`;
    bindRowActions('invTbl', 'inventory', { edit: id => openForm('inventory', byId('inventory', id)) });
  };
  draw();
  attachFilter('#fltInv', null, draw, '#fltInvCat');
}

/* ===========================================================
   חשבוניות
   =========================================================== */
function renderInvoices() {
  const head = pageHead('חשבוניות ותשלומים', 'הפקת חשבוניות, מעקב תשלומים והיסטוריה מלאה', 'חשבונית חדשה', () => openForm('invoices'));
  const invs = col('invoices');
  const paid = invs.filter(i=>i.paid).reduce((s,i)=>s+(Number(i.total)||0),0);
  const unpaid = invs.filter(i=>!i.paid).reduce((s,i)=>s+(Number(i.total)||0),0);
  $('#main').innerHTML = head + `
    <div class="stat-grid">
      <div class="stat-card s-ok"><div class="stat-top"><div class="stat-ico">💰</div></div>
        <div class="stat-val">${ILS(paid)}</div><div class="stat-label">סך תשלומים שנגבו</div></div>
      <div class="stat-card s-warn"><div class="stat-top"><div class="stat-ico">⏳</div></div>
        <div class="stat-val">${ILS(unpaid)}</div><div class="stat-label">ממתין לתשלום</div></div>
      <div class="stat-card"><div class="stat-top"><div class="stat-ico">🧾</div></div>
        <div class="stat-val">${invs.length}</div><div class="stat-label">חשבוניות בסך הכל</div></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-mini">
          <svg viewBox="0 0 24 24" class="ico"><path d="M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>
          <input id="fltInvc" placeholder="חיפוש לפי לקוח או מספר חשבונית..." />
        </div>
      </div>
      <div class="tbl-wrap" id="invcTbl"></div>
    </div>`;
  const draw = (q = '') => {
    let rows = col('invoices');
    if (q) rows = rows.filter(i => [custName(i.customerId), String(i.number)].some(v => String(v||'').toLowerCase().includes(q)));
    rows = [...rows].sort((a,b)=>new Date(b.date)-new Date(a.date));
    $('#invcTbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr>
      <th>מס׳</th><th>לקוח</th><th>פריטים</th><th>תאריך</th><th>אמצעי תשלום</th><th>סכום</th><th>סטטוס</th><th></th>
    </tr></thead><tbody>${rows.map(i => `<tr class="row-click" data-edit="${i.id}">
      <td class="t-strong">#${i.number}</td>
      <td>${esc(custName(i.customerId))}</td>
      <td class="t-mut">${(i.items||[]).length} פריטים</td>
      <td class="t-mut">${fmtDate(i.date)}</td>
      <td class="t-mut">${esc(i.paymentMethod)||'—'}</td>
      <td class="t-money">${ILS(i.total)}</td>
      <td>${i.paid?'<span class="pill-ok">שולם</span>':'<span class="pill-no">לא שולם</span>'}</td>
      <td><div class="row-actions">
        <button class="icon-btn" data-print="${i.id}" title="הדפסה">🖨</button>
        <button class="icon-btn del" data-del="${i.id}" title="מחיקה">🗑</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`
      : `<div class="empty"><div class="e-ico">🧾</div><p>${q?'לא נמצאו חשבוניות':'אין חשבוניות עדיין'}</p></div>`;
    bindRowActions('invcTbl', 'invoices', { edit: id => openForm('invoices', byId('invoices', id)), print: printInvoice });
  };
  draw();
  attachFilter('#fltInvc', null, draw);
}

/* ===========================================================
   חנות מוצרים
   =========================================================== */
function renderProducts() {
  const head = pageHead('חנות מוצרים', 'אביזרים ומוצרים למכירה ישירה — מחיר ומלאי', 'מוצר חדש', () => openForm('products'));
  $('#main').innerHTML = head + `
    <div class="card">
      <div class="toolbar">
        <div class="search-mini">
          <svg viewBox="0 0 24 24" class="ico"><path d="M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>
          <input id="fltProd" placeholder="חיפוש מוצר..." />
        </div>
      </div>
      <div class="tbl-wrap" id="prodTbl"></div>
    </div>`;
  const draw = (q = '') => {
    let rows = col('products');
    if (q) rows = rows.filter(p => [p.name, p.category].some(v => String(v||'').toLowerCase().includes(q)));
    $('#prodTbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr>
      <th>שם המוצר</th><th>קטגוריה</th><th>במלאי</th><th>עלות</th><th>מחיר מכירה</th><th>רווח ליחידה</th><th></th>
    </tr></thead><tbody>${rows.map(p => `<tr class="row-click" data-edit="${p.id}">
      <td class="t-strong">${esc(p.name)}</td>
      <td><span class="tag">${esc(p.category)||'כללי'}</span></td>
      <td>${Number(p.quantity)===0?'<span class="pill-no">אזל</span>':`<b>${p.quantity}</b>`}</td>
      <td class="t-money">${ILS(p.costPrice)}</td>
      <td class="t-money">${ILS(p.price)}</td>
      <td class="t-profit">${ILS((Number(p.price)||0)-(Number(p.costPrice)||0))}</td>
      <td><div class="row-actions">
        <button class="icon-btn del" data-del="${p.id}" title="מחיקה">🗑</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`
      : `<div class="empty"><div class="e-ico">🛒</div><p>${q?'לא נמצאו מוצרים':'אין מוצרים עדיין'}</p></div>`;
    bindRowActions('prodTbl', 'products', { edit: id => openForm('products', byId('products', id)) });
  };
  draw();
  attachFilter('#fltProd', null, draw);
}

/* ===========================================================
   ספקים
   =========================================================== */
function renderSuppliers() {
  const head = pageHead('ניהול ספקים', 'אנשי הקשר שמספקים לכם חלקים ומוצרים', 'ספק חדש', () => openForm('suppliers'));
  $('#main').innerHTML = head + `<div class="card"><div class="tbl-wrap" id="supTbl"></div></div>`;
  const rows = col('suppliers');
  $('#supTbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr>
    <th>שם הספק</th><th>טלפון</th><th>חלקים שסופקו</th><th>הערות</th><th></th>
  </tr></thead><tbody>${rows.map(s => {
    const parts = col('inventory').filter(i => i.supplierId === s.id).length;
    return `<tr class="row-click" data-edit="${s.id}">
      <td class="t-strong">${esc(s.name)}</td>
      <td><a href="tel:${esc(s.phone)}" style="color:var(--blue);text-decoration:none;font-weight:600">${esc(s.phone)}</a></td>
      <td><span class="tag">${parts} סוגי חלקים</span></td>
      <td class="t-mut">${esc(s.notes)||'—'}</td>
      <td><div class="row-actions"><button class="icon-btn del" data-del="${s.id}" title="מחיקה">🗑</button></div></td>
    </tr>`; }).join('')}</tbody></table>`
    : `<div class="empty"><div class="e-ico">🚚</div><p>אין ספקים עדיין</p></div>`;
  bindRowActions('supTbl', 'suppliers', { edit: id => openForm('suppliers', byId('suppliers', id)) });
}

/* ===========================================================
   עובדים
   =========================================================== */
function renderEmployees() {
  const head = pageHead('ניהול עובדים', 'כל עובד והמשימות שלו — בלי "אמרתי לו בוואטסאפ"', 'עובד חדש', () => openForm('employees'));
  $('#main').innerHTML = head + `<div class="card"><div class="tbl-wrap" id="empTbl"></div></div>`;
  const rows = col('employees');
  $('#empTbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr>
    <th>שם העובד</th><th>תפקיד</th><th>טלפון</th><th>תיקונים פעילים</th><th>סה"כ תיקונים</th><th></th>
  </tr></thead><tbody>${rows.map(e => {
    const all = col('repairs').filter(r => r.assignedTo === e.id);
    const active = all.filter(r => r.status !== 'delivered').length;
    return `<tr class="row-click" data-edit="${e.id}">
      <td class="t-strong">${esc(e.name)}</td>
      <td><span class="tag">${esc(e.role)||'עובד'}</span></td>
      <td><a href="tel:${esc(e.phone)}" style="color:var(--blue);text-decoration:none;font-weight:600">${esc(e.phone)}</a></td>
      <td><b>${active}</b></td>
      <td class="t-mut">${all.length}</td>
      <td><div class="row-actions"><button class="icon-btn del" data-del="${e.id}" title="מחיקה">🗑</button></div></td>
    </tr>`; }).join('')}</tbody></table>`
    : `<div class="empty"><div class="e-ico">🧑‍🔧</div><p>אין עובדים עדיין</p></div>`;
  bindRowActions('empTbl', 'employees', { edit: id => openForm('employees', byId('employees', id)) });
}

/* ===========================================================
   חיפוש חכם
   =========================================================== */
function renderSearch(initial = '') {
  $('#main').innerHTML = `
    <div class="search-hero">
      <h1>🔍 חיפוש חכם</h1>
      <p>רשמו מה שאתם מחפשים — והמערכת תגיד לכם אם יש במלאי, כמה זה עולה, מי הספק וכמה תרוויחו</p>
      <div class="sh-box">
        <svg viewBox="0 0 24 24" class="ico" style="color:#8a93a6"><path d="M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>
        <input id="smartSearch" placeholder="לדוגמה: iPhone 13 screen / סוללה / מוחמד..." value="${esc(initial)}" />
      </div>
    </div>
    <div id="searchResults"></div>`;
  const inp = $('#smartSearch');
  const run = () => doSmartSearch(inp.value.trim());
  inp.oninput = run;
  inp.focus();
  run();
}

function doSmartSearch(q) {
  const box = $('#searchResults');
  if (!q) {
    box.innerHTML = `<div class="empty"><div class="e-ico">💡</div><p>התחילו להקליד כדי לחפש בכל המערכת</p></div>`;
    return;
  }
  const ql = q.toLowerCase();
  const match = v => String(v || '').toLowerCase().includes(ql);

  const invHits = col('inventory').filter(i => [i.name, i.deviceModel, i.category].some(match));
  const prodHits = col('products').filter(p => [p.name, p.category].some(match));
  const custHits = col('customers').filter(c => [c.name, c.phone].some(match));
  const repHits = col('repairs').filter(r => [custName(r.customerId), r.device, r.issue].some(match));

  let html = '';
  if (invHits.length) {
    html += `<div class="res-group-title">📦 חלקים במלאי (${invHits.length})</div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>חלק</th><th>זמינות</th><th>עלות לי</th><th>מחיר מכירה</th><th>רווח</th><th>ספק</th>
      </tr></thead><tbody>${invHits.map(i => {
        const out = Number(i.quantity) === 0;
        return `<tr class="row-click" data-sinv="${i.id}">
          <td class="t-strong">${esc(i.name)}</td>
          <td>${out?'<span class="pill-no">אין במלאי</span>':`<span class="pill-ok">יש ${i.quantity} במלאי</span>`}</td>
          <td class="t-money">${ILS(i.costPrice)}</td>
          <td class="t-money">${ILS(i.sellPrice)}</td>
          <td class="t-profit">${ILS((Number(i.sellPrice)||0)-(Number(i.costPrice)||0))}</td>
          <td class="t-mut">${esc(supName(i.supplierId))}</td>
        </tr>`; }).join('')}</tbody></table></div></div>`;
  }
  if (prodHits.length) {
    html += `<div class="res-group-title">🛒 מוצרים בחנות (${prodHits.length})</div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><tbody>${prodHits.map(p => `<tr class="row-click" data-sprod="${p.id}">
        <td class="t-strong">${esc(p.name)}</td>
        <td>${Number(p.quantity)===0?'<span class="pill-no">אזל</span>':`<span class="pill-ok">${p.quantity} במלאי</span>`}</td>
        <td class="t-money">${ILS(p.price)}</td>
      </tr>`).join('')}</tbody></table></div></div>`;
  }
  if (custHits.length) {
    html += `<div class="res-group-title">👥 לקוחות (${custHits.length})</div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><tbody>${custHits.map(c => `<tr class="row-click" data-scust="${c.id}">
        <td class="t-strong">${esc(c.name)}</td><td class="t-mut">${esc(c.phone)}</td>
        <td>${col('repairs').filter(r=>r.customerId===c.id).length} תיקונים</td>
      </tr>`).join('')}</tbody></table></div></div>`;
  }
  if (repHits.length) {
    html += `<div class="res-group-title">🔧 תיקונים (${repHits.length})</div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><tbody>${repHits.map(r => `<tr class="row-click" data-srep="${r.id}">
        <td class="t-strong">${esc(custName(r.customerId))}</td><td>${esc(r.device)}</td>
        <td><span class="badge ${STATUS[r.status].cls}">${STATUS[r.status].label}</span></td>
        <td class="t-money">${ILS(r.totalPrice)}</td>
      </tr>`).join('')}</tbody></table></div></div>`;
  }
  if (!html) html = `<div class="empty"><div class="e-ico">🔍</div><p>לא נמצאו תוצאות עבור "${esc(q)}"</p></div>`;
  box.innerHTML = html;
  box.querySelectorAll('[data-sinv]').forEach(r => r.onclick = () => openForm('inventory', byId('inventory', r.dataset.sinv)));
  box.querySelectorAll('[data-sprod]').forEach(r => r.onclick = () => openForm('products', byId('products', r.dataset.sprod)));
  box.querySelectorAll('[data-scust]').forEach(r => r.onclick = () => openCustomerCard(r.dataset.scust));
  box.querySelectorAll('[data-srep]').forEach(r => r.onclick = () => openForm('repairs', byId('repairs', r.dataset.srep)));
}

/* ===========================================================
   פעולות שורה (עריכה / מחיקה / מותאם)
   =========================================================== */
function bindRowActions(containerId, collection, custom = {}) {
  const c = $('#' + containerId);
  if (!c) return;
  c.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    (custom.edit || (id => openForm(collection, byId(collection, id))))(el.dataset.edit);
  }));
  c.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation(); confirmDelete(collection, el.dataset.del);
  }));
  ['card', 'invoice', 'print'].forEach(k => {
    if (custom[k]) c.querySelectorAll('[data-' + k + ']').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation(); custom[k](el.dataset[k]);
    }));
  });
  // לחיצה על שורה => עריכה
  c.querySelectorAll('tr.row-click').forEach(tr => {
    const id = tr.dataset.edit || tr.dataset.card;
    if (!id) return;
    tr.addEventListener('click', () => {
      if (tr.dataset.card && custom.card) custom.card(id);
      else (custom.edit || (i => openForm(collection, byId(collection, i))))(id);
    });
  });
}

/* ===========================================================
   חלון מודאלי כללי
   =========================================================== */
function openModal(title, bodyHTML, wide = false) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML;
  $('#modal').querySelector('.modal').classList.toggle('wide', wide);
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
$('#modalClose').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ===========================================================
   הגדרות שדות הטפסים
   =========================================================== */
function schema(collection) {
  const refOptions = (name, labelKey = 'name') =>
    col(name).map(x => ({ v: x.id, t: x[labelKey] }));

  const S = {
    customers: { title: 'לקוח', fields: [
      { k: 'name', l: 'שם מלא', t: 'text', req: 1 },
      { k: 'phone', l: 'טלפון', t: 'tel', req: 1 },
      { k: 'email', l: 'דוא"ל', t: 'email' },
      { k: 'address', l: 'כתובת', t: 'text' },
      { k: 'notes', l: 'הערות', t: 'textarea', full: 1 }
    ]},
    repairs: { title: 'תיקון', fields: [
      { k: 'customerId', l: 'לקוח', t: 'select', req: 1, options: refOptions('customers') },
      { k: 'device', l: 'דגם המכשיר', t: 'text', req: 1 },
      { k: 'issue', l: 'תיאור התקלה', t: 'textarea', full: 1, req: 1 },
      { k: 'status', l: 'סטטוס', t: 'select', options: STATUS_ORDER.map(s => ({ v: s, t: STATUS[s].label })) },
      { k: 'assignedTo', l: 'טכנאי מטפל', t: 'select', options: refOptions('employees') },
      { k: 'laborCost', l: 'עלות עבודה (₪)', t: 'number' },
      { k: 'notes', l: 'הערות פנימיות', t: 'textarea', full: 1 }
    ]},
    inventory: { title: 'חלק במלאי', fields: [
      { k: 'name', l: 'שם החלק', t: 'text', req: 1 },
      { k: 'category', l: 'קטגוריה', t: 'select', options: CATEGORIES.map(c => ({ v: c, t: c })) },
      { k: 'deviceModel', l: 'דגם מכשיר מתאים', t: 'text' },
      { k: 'quantity', l: 'כמות במלאי', t: 'number', req: 1 },
      { k: 'minQuantity', l: 'סף התראת מלאי', t: 'number' },
      { k: 'costPrice', l: 'מחיר עלות (₪)', t: 'number' },
      { k: 'sellPrice', l: 'מחיר מכירה (₪)', t: 'number' },
      { k: 'supplierId', l: 'ספק', t: 'select', options: refOptions('suppliers') },
      { k: 'location', l: 'מיקום פיזי בחנות', t: 'text' }
    ]},
    products: { title: 'מוצר', fields: [
      { k: 'name', l: 'שם המוצר', t: 'text', req: 1 },
      { k: 'category', l: 'קטגוריה', t: 'select', options: CATEGORIES.map(c => ({ v: c, t: c })) },
      { k: 'quantity', l: 'כמות במלאי', t: 'number' },
      { k: 'costPrice', l: 'מחיר עלות (₪)', t: 'number' },
      { k: 'price', l: 'מחיר מכירה (₪)', t: 'number', req: 1 }
    ]},
    suppliers: { title: 'ספק', fields: [
      { k: 'name', l: 'שם הספק', t: 'text', req: 1 },
      { k: 'phone', l: 'טלפון', t: 'tel' },
      { k: 'notes', l: 'הערות', t: 'textarea', full: 1 }
    ]},
    employees: { title: 'עובד', fields: [
      { k: 'name', l: 'שם העובד', t: 'text', req: 1 },
      { k: 'role', l: 'תפקיד', t: 'text' },
      { k: 'phone', l: 'טלפון', t: 'tel' }
    ]},
    invoices: { title: 'חשבונית', fields: [
      { k: 'customerId', l: 'לקוח', t: 'select', req: 1, options: refOptions('customers') },
      { k: 'date', l: 'תאריך', t: 'date' },
      { k: 'paymentMethod', l: 'אמצעי תשלום', t: 'select', options: PAYMENT.map(p => ({ v: p, t: p })) },
      { k: 'paid', l: 'שולם', t: 'checkbox' }
    ]}
  };
  return S[collection];
}

function fieldHTML(f, val) {
  const v = val == null ? '' : val;
  const lbl = `<label>${f.l}${f.req ? ' <span class="req">*</span>' : ''}</label>`;
  let input;
  if (f.t === 'textarea') {
    input = `<textarea name="${f.k}">${esc(v)}</textarea>`;
  } else if (f.t === 'select') {
    input = `<select name="${f.k}">${f.req ? '' : '<option value="">— ללא —</option>'}${
      f.options.map(o => `<option value="${esc(o.v)}" ${String(o.v)===String(v)?'selected':''}>${esc(o.t)}</option>`).join('')}</select>`;
  } else if (f.t === 'checkbox') {
    return `<div class="field full"><label class="checkline"><input type="checkbox" name="${f.k}" ${v?'checked':''}/> ${f.l}</label></div>`;
  } else {
    input = `<input type="${f.t}" name="${f.k}" value="${esc(v)}" ${f.req?'required':''}/>`;
  }
  return `<div class="field ${f.full?'full':''}">${lbl}${input}</div>`;
}

/* ===========================================================
   טופס הוספה/עריכה
   =========================================================== */
function openForm(collection, item) {
  const sc = schema(collection);
  if (!sc) return;
  const isEdit = item && item.id;
  const data = item || {};
  if (collection === 'invoices' && !data.date) data.date = new Date().toISOString().slice(0, 10);
  if (collection === 'repairs' && !data.status) data.status = 'received';

  let body = `<form id="entityForm"><div class="form-grid">
    ${sc.fields.map(f => {
      let v = data[f.k];
      if (f.t === 'date' && v) v = String(v).slice(0, 10);
      return fieldHTML(f, v);
    }).join('')}`;

  // עורך חלקים — רק לתיקונים
  if (collection === 'repairs') {
    body += `<div class="parts-box" id="partsBox">
      <h4>🔩 חלקים שהוחלפו בתיקון</h4>
      <div id="partRows"></div>
      <button type="button" class="btn btn-sec btn-sm" id="addPartRow" style="margin-top:6px">＋ הוסף חלק</button>
      <div class="parts-total"><span>סה"כ עלות חלקים:</span><span id="partsTotal">₪0</span></div>
      <div class="parts-total" style="border:none;padding-top:2px"><span>מחיר סופי ללקוח (חלקים + עבודה):</span><span id="grandTotal">₪0</span></div>
    </div>`;
  }
  if (collection === 'invoices') {
    body += `<div class="parts-box full" id="itemsBox" style="border-color:var(--ink)">
      <h4>🧾 פריטי החשבונית</h4>
      <div id="itemRows"></div>
      <button type="button" class="btn btn-sec btn-sm" id="addItemRow" style="margin-top:6px">＋ הוסף פריט</button>
      <div class="parts-total"><span>סה"כ לתשלום:</span><span id="invTotal">₪0</span></div>
    </div>`;
  }

  body += `</div><div class="form-actions">
    <button type="submit" class="btn">${isEdit ? '💾 שמירת שינויים' : '＋ הוספה'}</button>
    <button type="button" class="btn btn-sec" id="formCancel">ביטול</button>
  </div></form>`;

  openModal((isEdit ? 'עריכת ' : 'הוספת ') + sc.title, body, collection === 'repairs' || collection === 'invoices');
  $('#formCancel').onclick = closeModal;

  // --- עורך חלקים ---
  let parts = collection === 'repairs' ? JSON.parse(JSON.stringify(data.partsUsed || [])) : [];
  let items = collection === 'invoices' ? JSON.parse(JSON.stringify(data.items || [])) : [];

  function drawParts() {
    const invList = col('inventory');
    $('#partRows').innerHTML = parts.map((p, idx) => `<div class="part-row">
      <select data-pidx="${idx}" data-pf="invId">
        <option value="">— בחר חלק / ידני —</option>
        ${invList.map(i => `<option value="${i.id}" ${i.id===p.invId?'selected':''}>${esc(i.name)} (${i.quantity} במלאי)</option>`).join('')}
      </select>
      <input type="number" min="1" value="${p.qty||1}" data-pidx="${idx}" data-pf="qty" title="כמות" />
      <input type="number" class="pr-cost" value="${p.cost||0}" data-pidx="${idx}" data-pf="cost" title="עלות ליחידה" />
      <button type="button" class="part-del" data-pdel="${idx}">✕</button>
    </div>`).join('');
    const partsCost = parts.reduce((s, p) => s + (Number(p.cost)||0)*(Number(p.qty)||1), 0);
    const labor = Number($('[name=laborCost]').value) || 0;
    $('#partsTotal').textContent = ILS(partsCost);
    $('#grandTotal').textContent = ILS(partsCost + labor);
    $('#partRows').querySelectorAll('[data-pf]').forEach(el => {
      el.onchange = () => {
        const i = +el.dataset.pidx, f = el.dataset.pf;
        if (f === 'invId') {
          parts[i].invId = el.value;
          const it = byId('inventory', el.value);
          if (it) { parts[i].name = it.name; parts[i].cost = Number(it.costPrice)||0; }
        } else parts[i][f] = f === 'qty' ? (+el.value||1) : (+el.value||0);
        drawParts();
      };
    });
    $('#partRows').querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => { parts.splice(+b.dataset.pdel, 1); drawParts(); });
  }
  if (collection === 'repairs') {
    drawParts();
    $('#addPartRow').onclick = () => { parts.push({ invId: '', name: '', qty: 1, cost: 0 }); drawParts(); };
    $('[name=laborCost]').oninput = drawParts;
  }

  function drawItems() {
    $('#itemRows').innerHTML = items.map((it, idx) => `<div class="part-row">
      <input type="text" style="flex:2" placeholder="תיאור הפריט" value="${esc(it.desc||'')}" data-iidx="${idx}" data-if="desc" />
      <input type="number" min="1" value="${it.qty||1}" data-iidx="${idx}" data-if="qty" title="כמות" />
      <input type="number" class="pr-cost" value="${it.price||0}" data-iidx="${idx}" data-if="price" title="מחיר" />
      <button type="button" class="part-del" data-idel="${idx}">✕</button>
    </div>`).join('');
    const total = items.reduce((s, it) => s + (Number(it.price)||0)*(Number(it.qty)||1), 0);
    $('#invTotal').textContent = ILS(total);
    $('#itemRows').querySelectorAll('[data-if]').forEach(el => {
      el.oninput = () => {
        const i = +el.dataset.iidx, f = el.dataset.if;
        items[i][f] = f === 'desc' ? el.value : (+el.value||0);
        const total = items.reduce((s, it) => s + (Number(it.price)||0)*(Number(it.qty)||1), 0);
        $('#invTotal').textContent = ILS(total);
      };
    });
    $('#itemRows').querySelectorAll('[data-idel]').forEach(b => b.onclick = () => { items.splice(+b.dataset.idel, 1); drawItems(); });
  }
  if (collection === 'invoices') {
    drawItems();
    $('#addItemRow').onclick = () => { items.push({ desc: '', qty: 1, price: 0 }); drawItems(); };
  }

  // --- שמירה ---
  $('#entityForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {};
    sc.fields.forEach(f => {
      if (f.t === 'checkbox') payload[f.k] = fd.get(f.k) === 'on';
      else if (f.t === 'number') payload[f.k] = Number(fd.get(f.k)) || 0;
      else payload[f.k] = (fd.get(f.k) || '').trim();
    });

    if (collection === 'repairs') {
      payload.partsUsed = parts.filter(p => p.name || p.invId).map(p => ({
        invId: p.invId || '', name: p.name || (byId('inventory', p.invId)||{}).name || 'חלק',
        qty: Number(p.qty)||1, cost: Number(p.cost)||0
      }));
      payload.partsCost = payload.partsUsed.reduce((s, p) => s + p.cost*p.qty, 0);
      payload.totalPrice = payload.partsCost + (Number(payload.laborCost)||0);
    }
    if (collection === 'invoices') {
      payload.items = items.filter(it => it.desc);
      payload.total = payload.items.reduce((s, it) => s + (Number(it.price)||0)*(Number(it.qty)||1), 0);
    }

    try {
      if (isEdit) await api('PUT', `/${collection}/${data.id}`, payload);
      else await api('POST', `/${collection}`, payload);
      await loadDB();
      closeModal();
      render();
      toast(isEdit ? 'הרשומה עודכנה בהצלחה ✓' : 'הרשומה נוספה בהצלחה ✓');
    } catch (err) {
      toast('שגיאה בשמירה — בדקו שהשרת פעיל', 'err');
    }
  };
}

/* ===========================================================
   מחיקה
   =========================================================== */
function confirmDelete(collection, id) {
  const names = { customers: 'הלקוח', repairs: 'התיקון', inventory: 'החלק', invoices: 'החשבונית', products: 'המוצר', suppliers: 'הספק', employees: 'העובד' };
  openModal('אישור מחיקה', `
    <p style="font-size:15px;line-height:1.6">האם למחוק את ${names[collection]||'הרשומה'}? <br/>הפעולה אינה ניתנת לביטול.</p>
    <div class="form-actions">
      <button class="btn" id="delYes" style="background:var(--danger);box-shadow:none">כן, למחוק</button>
      <button class="btn btn-sec" id="delNo">ביטול</button>
    </div>`);
  $('#delNo').onclick = closeModal;
  $('#delYes').onclick = async () => {
    try {
      await api('DELETE', `/${collection}/${id}`);
      await loadDB(); closeModal(); render();
      toast('הרשומה נמחקה');
    } catch { toast('שגיאה במחיקה', 'err'); }
  };
}

/* ===========================================================
   יצירת חשבונית מתיקון
   =========================================================== */
async function createInvoiceFromRepair(repairId) {
  const r = byId('repairs', repairId);
  if (!r) return;
  const items = [];
  (r.partsUsed || []).forEach(p => items.push({ desc: p.name + ' (חלק)', qty: p.qty || 1, price: 0 }));
  items.push({ desc: `תיקון ${r.device} — ${r.issue}`.slice(0, 60), qty: 1, price: Number(r.totalPrice) || 0 });
  const payload = {
    customerId: r.customerId, repairId: r.id, items,
    total: Number(r.totalPrice) || 0, paid: false,
    paymentMethod: 'לא שולם', date: new Date().toISOString().slice(0, 10)
  };
  try {
    const inv = await api('POST', '/invoices', payload);
    await loadDB(); render();
    toast(`חשבונית #${inv.number} נוצרה עבור ${custName(r.customerId)} ✓`);
  } catch { toast('שגיאה ביצירת חשבונית', 'err'); }
}

/* ===========================================================
   הדפסת חשבונית
   =========================================================== */
function printInvoice(id) {
  const inv = byId('invoices', id);
  if (!inv) return;
  const c = byId('customers', inv.customerId) || {};
  const rows = (inv.items || []).map(it => `<tr>
    <td>${esc(it.desc)}</td><td style="text-align:center">${it.qty||1}</td>
    <td style="text-align:left">${ILS((Number(it.price)||0)*(Number(it.qty)||1))}</td></tr>`).join('');
  const w = window.open('', '_blank', 'width=720,height=900');
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/>
    <title>חשבונית #${inv.number}</title><style>
    body{font-family:Arial,sans-serif;padding:40px;color:#0c1424}
    .hd{display:flex;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:16px;margin-bottom:24px}
    .hd h1{color:#1d4ed8;margin:0;font-size:26px}.hd .meta{text-align:left}
    .info{display:flex;justify-content:space-between;margin-bottom:20px;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th{background:#1d4ed8;color:#fff;padding:10px;text-align:right}
    td{padding:10px;border-bottom:1px solid #e6e9f0}
    .total{text-align:left;font-size:20px;font-weight:bold;color:#1d4ed8}
    .ft{margin-top:40px;text-align:center;color:#5b6679;font-size:13px;border-top:1px solid #e6e9f0;padding-top:16px}
    </style></head><body>
    <div class="hd"><div><h1>תקשורת נחף</h1><div>תיקון מכשירים סלולריים</div></div>
      <div class="meta"><b>חשבונית מס׳ ${inv.number}</b><br/>${fmtDate(inv.date)}<br/>טל׳ 053-522-4616</div></div>
    <div class="info"><div><b>לכבוד:</b> ${esc(c.name||'')}<br/>${esc(c.phone||'')}<br/>${esc(c.address||'')}</div>
      <div><b>אמצעי תשלום:</b> ${esc(inv.paymentMethod||'—')}<br/><b>סטטוס:</b> ${inv.paid?'שולם':'ממתין לתשלום'}</div></div>
    <table><thead><tr><th>תיאור</th><th style="text-align:center">כמות</th><th style="text-align:left">מחיר</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="total">סה"כ לתשלום: ${ILS(inv.total)}</div>
    <div class="ft">תודה שבחרתם בתקשורת נחף · 053-522-4616</div>
    </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 350);
}

/* ===========================================================
   חיפוש גלובלי + גיבוי
   =========================================================== */
$('#globalSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    state.view = 'search';
    render();
    setTimeout(() => { const s = $('#smartSearch'); if (s) { s.value = e.target.value; doSmartSearch(s.value); } }, 30);
    e.target.value = '';
  }
});
$('#backupBtn').onclick = async () => {
  const db = await api('GET', '/db');
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tikshoret-nahef-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast('קובץ הגיבוי הורד — אפשר להעלות אותו ל-Google Drive ✓');
};

// שחזור נתונים מקובץ גיבוי (למשל קובץ שהורד מ-Google Drive)
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object' || !Array.isArray(data.customers))
        throw new Error('מבנה לא תקין');
      await api('PUT', '/db', data);
      await loadDB();
      render();
      toast('הנתונים שוחזרו מהקובץ בהצלחה ✓');
    } catch (err) {
      toast('הקובץ אינו קובץ גיבוי תקין', 'err');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
};

/* ===========================================================
   אתחול — זיהוי מצב הרצה (שרת מקומי / Vercel)
   =========================================================== */
const EMPTY_DB = { customers: [], repairs: [], inventory: [], invoices: [], products: [], suppliers: [], employees: [], meta: { invoiceCounter: 1000 } };

(async function init() {
  // ניסיון להתחבר לשרת המקומי
  try {
    const res = await fetch('/api/db', { cache: 'no-store' });
    const data = await res.json(); // נכשל אם חזר HTML (כמו ב-Vercel)
    if (res.ok && data && Array.isArray(data.customers)) {
      MODE = 'server';
      state.db = data;
      render();
      return;
    }
    throw new Error('not server');
  } catch (e) {
    MODE = 'local';
  }

  // מצב מקומי — נתונים מהדפדפן
  const saved = localStorage.getItem(LOCAL_KEY);
  if (saved) {
    try { state.db = JSON.parse(saved); } catch (_) { state.db = null; }
  }
  if (!state.db) {
    // טעינה ראשונה — נתוני התחלה מהקובץ המצורף
    try {
      const seed = await fetch('seed-data.json', { cache: 'no-store' });
      state.db = await seed.json();
    } catch (_) {
      state.db = JSON.parse(JSON.stringify(EMPTY_DB));
    }
    saveLocal();
  }
  render();
  toast('מצב ענן — הנתונים נשמרים בדפדפן זה. גבו עותק בכפתור "גיבוי" 💾', 'ok');
})();
