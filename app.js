'use strict';

// ════════════════════════════════════ SUPABASE INIT
const LS_URL = 'pafwa_sb_url', LS_KEY = 'pafwa_sb_key';
let sb = null, CU = null; // supabase client, current user
let _cats = [], _items = [], _posItems = [], _cart = [], _repData = [], _repType = 'sales';
let _invFilter = null, _rcptFilter = null;

const $ = id => document.getElementById(id);
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtM = n => 'Rs. ' + Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'); };
const fmtDT = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }); };

function getCfg() { return { url: localStorage.getItem(LS_URL) || '', key: localStorage.getItem(LS_KEY) || '' }; }
function hasCfg() { const c = getCfg(); return !!(c.url && c.key); }

function initSB(url, key) {
  try { sb = supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }); return true; }
  catch (e) { return false; }
}

// ════════════════════════════════════ UI UTILS
let toastT;
function toast(m, t = 's') { const e = $('TOAST'); e.textContent = m; e.className = `t${t} on`; clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 3500); }
function openM(h, w = '660px') { $('MB').innerHTML = h; $('MB').style.maxWidth = w; $('OV').classList.add('on'); }
function closeM() { $('OV').classList.remove('on'); $('MB').innerHTML = ''; }
function mmc(e) { if (e.target === $('OV')) closeM(); }
function ld(el, msg = '⏳ Loading…') { if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--mt)">${msg}</div>`; }

function stBadge(q, m) { if (!q || q == 0) return '<span class="bdg br_">Out</span>'; if (Number(q) <= Number(m)) return `<span class="bdg bo">Low: ${q}</span>`; return `<span class="bdg bg">${q}</span>`; }
function payBadge(p) { return p ? '<span class="bdg bg">✅ Paid</span>' : '<span class="bdg bo">⏳ Pending</span>'; }
function roleBadge(r) { return r === 'admin' ? '<span class="bdg bb">Admin</span>' : '<span class="bdg bgr">Staff</span>'; }
function pmBadge(m) { const c = { Cash: 'bg', ['Mess Bill']: 'bp_', ['PAFWA Home Store']: 'bb', ['Special Case']: 'bo' }; return `<span class="bdg ${c[m] || 'bgr'}">${esc(m)}</span>`; }

function togglePw(id, btn) {
  const el = $(id);
  if (el.type === 'password') { el.type = 'text'; btn.textContent = '🙈'; }
  else { el.type = 'password'; btn.textContent = '👁'; }
}

function openSidebar() { $('SB').classList.add('open'); $('SB-OVERLAY').classList.add('on'); }
function closeSidebar() { $('SB').classList.remove('open'); $('SB-OVERLAY').classList.remove('on'); }

// ════════════════════════════════════ LOGGING
async function addLog(action, detail) {
  if (!sb || !CU) return;
  try { await sb.from('logs').insert({ user_id: CU.id, username: CU.username, role: CU.role, action, detail }); }
  catch (e) { console.warn('log:', e.message); }
}

// ════════════════════════════════════ FIRST-RUN / CONFIG
function showCfg() {
  const c = getCfg();
  $('cfg-url').value = c.url || '';
  $('cfg-key').value = c.key || '';
  ['LOGIN', 'ADMIN-SCREEN', 'APP'].forEach(id => { const el = $(id); if (el) { el.style.display = 'none'; el.classList && el.classList.remove('on'); } });
  $('CFG-SCREEN').style.display = 'flex';
}
function saveCfgAndInit() {
  let url = $('cfg-url').value.trim();
  const key = $('cfg-key').value.trim();
  const err = $('cfg-err');
  if (!url || !key) { err.textContent = 'Both fields are required'; err.style.display = 'block'; return; }
  
  // Clean URL: remove trailing slashes and common extra paths like /rest/v1
  url = url.replace(/\/+$/, ""); 
  if (url.endsWith("/rest/v1")) url = url.slice(0, -8);
  if (url.endsWith("/auth/v1")) url = url.slice(0, -8);

  if (!url.includes('supabase.co')) { err.textContent = 'URL must be a valid .supabase.co address'; err.style.display = 'block'; return; }
  
  localStorage.setItem(LS_URL, url); localStorage.setItem(LS_KEY, key);
  $('CFG-SCREEN').style.display = 'none';
  boot();
}

// ════════════════════════════════════ FIRST ADMIN CREATION
async function createFirstAdmin() {
  const u = $('adm-u').value.trim(), fn = $('adm-fn').value.trim();
  const pw = $('adm-pw').value, pw2 = $('adm-pw2').value;
  const err = $('adm-err'), btn = $('adm-btn');
  err.style.display = 'none';
  if (!u || !pw) { err.textContent = 'Username and password required'; err.style.display = 'block'; return; }
  if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters'; err.style.display = 'block'; return; }
  if (pw !== pw2) { err.textContent = 'Passwords do not match'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const email = `${u}@pafwa.local`;
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { username: u, full_name: fn || 'Administrator', role: 'admin' } } });
    if (error) throw error;
    toast('Administrator created! Logging you in…');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = '✅ Create Administrator Account';
  }
}

// ════════════════════════════════════ AUTH
async function doLogin() {
  const u = ($('lu') || {}).value?.trim(), p = ($('lp') || {}).value;
  const btn = $('lbtn'), err = $('lerr');
  if (!u || !p) { if (err) err.textContent = 'Enter username and password'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }
  if (err) err.textContent = '';
  try {
    const email = `${u}@pafwa.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: p });
    if (error) {
      if (err) err.textContent = 'Invalid username or password';
      if (btn) { btn.disabled = false; btn.textContent = '🔐 Sign In'; }
      return;
    }
    sb.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', data.user.id).then(() => { });
  } catch (e) {
    if (err) err.textContent = 'Login error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '🔐 Sign In'; }
  }
}

async function doLogout() {
  if (!confirm('Logout?')) return;
  await addLog('LOGOUT', `${CU?.username} logged out`);
  await sb.auth.signOut();
}

// ════════════════════════════════════ AUTH LISTENER
function setupAuth() {
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const { data: prof } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
      if (prof && prof.active) {
        CU = { id: prof.id, username: prof.username, fullName: prof.full_name, role: prof.role };
        $('sbn').textContent = prof.full_name || prof.username;
        $('sbr').textContent = prof.role;
        $('sb-avatar').textContent = (prof.full_name || prof.username).charAt(0).toUpperCase();
        $('sbsy').textContent = '🟢 Connected';
        $('sbsy').style.color = 'var(--gr)';
        if (prof.role !== 'admin') document.querySelectorAll('.adm').forEach(e => e.style.display = 'none');
        else document.querySelectorAll('.adm').forEach(e => e.style.display = '');
        ['LOAD', 'LOGIN', 'CFG-SCREEN', 'ADMIN-SCREEN'].forEach(id => { const el = $(id); if (el) { el.style.display = 'none'; el.classList && el.classList.remove('on'); } });
        $('APP').classList.add('on');
        goTo('dash');
        return;
      }
    }
    // Not logged in
    $('LOAD').style.display = 'none';
    $('APP').classList.remove('on');
    // Only show login if the admin creation screen isn't currently open
    if ($('ADMIN-SCREEN').style.display !== 'flex') {
      $('LOGIN').style.display = 'flex';
    }
    if ($('lbtn')) { $('lbtn').disabled = false; $('lbtn').textContent = '🔐 Sign In'; }
    CU = null;
  });
}

// ════════════════════════════════════ NAVIGATION
document.querySelectorAll('.ni[data-p]').forEach(b => b.addEventListener('click', () => goTo(b.dataset.p)));
const adminPages = ['logs', 'users'];
document.querySelectorAll('.ni.adm').forEach((b, i) => { const p = ['logs', 'users'][i]; if(p){ b.dataset.p = p; b.addEventListener('click', () => goTo(p));} });

const LOADERS = { dash: loadDash, inv: loadInv, pos: loadPOS, rcpt: loadRcpt, acct: loadAcct, rep: loadRep, logs: loadLogs, users: loadUsers, bkp: loadBkp, cfg: loadCfg };
function goTo(p) {
  if (adminPages.includes(p) && CU?.role !== 'admin') { toast('Admin only', 'e'); return; }
  document.querySelectorAll('.pg').forEach(e => e.classList.remove('on'));
  const pg = $('page-' + p);
  if(pg) pg.classList.add('on');
  document.querySelectorAll('.ni').forEach(e => e.classList.toggle('on', e.dataset.p === p));
  if (window.innerWidth <= 900) closeSidebar();
  if (LOADERS[p]) LOADERS[p]();
}

// ════════════════════════════════════ DASHBOARD
async function loadDash() {
  const el = $('page-dash'); ld(el);
  try {
    const [iR, sR, lR] = await Promise.all([
      sb.from('items').select('id,stock_qty,min_stock_threshold,name,serial_number').eq('archived', false),
      sb.from('sales').select('id,total,paid,receipt_no,customer_name,cashier,payment_method,created_at').order('created_at', { ascending: false }).limit(200),
      sb.from('liabilities').select('amount')
    ]);
    const items = iR.data || [], sales = sR.data || [], liabs = lR.data || [];
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const todS = sales.filter(s => s.created_at?.startsWith(today));
    const monS = sales.filter(s => s.created_at?.startsWith(month));
    const todAmt = todS.reduce((a, s) => a + Number(s.total), 0);
    const monAmt = monS.reduce((a, s) => a + Number(s.total), 0);
    const pend = sales.filter(s => !s.paid);
    const pendAmt = pend.reduce((a, s) => a + Number(s.total), 0);
    const lowItems = items.filter(i => Number(i.stock_qty) <= Number(i.min_stock_threshold || 5));
    const totalLiab = liabs.reduce((a, l) => a + Number(l.amount), 0);

    el.innerHTML = `
    <div class="ph">
      <div><div class="pt">Dashboard</div><div class="ps">${new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
      <div class="ph-acts">
        <input id="gsq" style="width:280px;max-width:100%;padding:9px 12px;border:1.5px solid var(--br);border-radius:8px;font-size:13px;outline:none" placeholder="🔍 Search items, customers…" oninput="gSearch(this.value)">
      </div>
    </div>
    <div id="gsr" style="display:none;margin-bottom:14px"></div>
    <div class="stats-grid">
      <div class="stat" style="cursor:pointer" onclick="goTo('inv')"><div class="sl">Items</div><div class="sv">${items.length}</div><div class="ss">${items.reduce((a, i) => a + Number(i.stock_qty || 0), 0)} total units</div></div>
      <div class="stat g" style="cursor:pointer" onclick="goTo('rcpt')"><div class="sl">Sales Today</div><div class="sv" style="color:var(--gr)">${fmtM(todAmt)}</div><div class="ss">${todS.length} transactions</div></div>
      <div class="stat s" style="cursor:pointer" onclick="goTo('rep')"><div class="sl">This Month</div><div class="sv" style="color:var(--sk)">${fmtM(monAmt)}</div><div class="ss">${monS.length} transactions</div></div>
      <div class="stat o" style="cursor:pointer" onclick="_rcptFilter={st:'pend'};goTo('rcpt')"><div class="sl">Pending Cash</div><div class="sv" style="color:var(--or)">${fmtM(pendAmt)}</div><div class="ss">${pend.length} unpaid</div></div>
      <div class="stat ${lowItems.length ? 'r' : 'g'}" style="cursor:pointer" onclick="_invFilter={sh:'low'};goTo('inv')"><div class="sl">Low Stock</div><div class="sv" style="color:${lowItems.length ? 'var(--rd)' : 'var(--gr)'}">${lowItems.length}</div><div class="ss">${lowItems.length ? 'need restock' : 'All good ✓'}</div></div>
    </div>
    <div class="gw">
      <div class="card">
        <div class="ch"><span class="ct_">🧾 Recent Sales</span><button class="btn bs bsm" onclick="goTo('rcpt')">View All</button></div>
        ${sales.length ? `<div class="tw"><table>
        <thead><tr><th>No.</th><th>Customer</th><th>Total</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${sales.slice(0, 10).map(s => `<tr>
          <td><span class="bdg bb">No.${s.receipt_no}</span></td>
          <td>${esc(s.customer_name)}</td>
          <td><strong>${fmtM(s.total)}</strong></td>
          <td>${pmBadge(s.payment_method || 'Cash')}</td>
          <td>${payBadge(s.paid)}</td>
          <td class="tdm">${fmtDT(s.created_at)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div style="text-align:center;padding:30px;color:var(--mt)">No sales yet</div>'}
      </div>
      <div class="card">
        <div class="ct_">⚠️ Low Stock Alerts</div>
        ${lowItems.length ? `<div class="tw"><table><thead><tr><th>Item</th><th>Stock</th></tr></thead>
        <tbody>${lowItems.map(i => `<tr><td style="font-size:12px;font-weight:600">${esc(i.name)}</td><td style="text-align:right">${stBadge(i.stock_qty, i.min_stock_threshold)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div style="color:var(--gr);font-size:13px;padding:10px 0">✅ All items are adequately stocked.</div>'}
        ${totalLiab > 0 ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--br)"><div class="sl">Total Liabilities</div><div style="font-size:20px;font-weight:800;color:var(--rd)">${fmtM(totalLiab)}</div></div>` : ''}
      </div>
    </div>`;
  } catch (e) { el.innerHTML = `<div class="al ale">Error: ${e.message}</div>`; }
}

async function gSearch(q) {
  const el = $('gsr'); if (!q || q.length < 2) { el.style.display = 'none'; return; }
  const [iR, sR] = await Promise.all([
    sb.from('items').select('id,name,serial_number').eq('archived', false).or(`name.ilike.%${q}%,serial_number.ilike.%${q}%`).limit(4),
    sb.from('sales').select('id,receipt_no,customer_name').or(`customer_name.ilike.%${q}%`).limit(4)
  ]);
  const rows = [...(iR.data || []).map(i => `<div style="padding:8px 0;border-bottom:1px solid var(--br);display:flex;align-items:center;gap:8px"><span class="bdg bb">📦</span> <strong style="flex:1">${esc(i.name)}</strong> <span class="tdm">${esc(i.serial_number)}</span></div>`),
  ...(sR.data || []).map(s => `<div style="padding:8px 0;border-bottom:1px solid var(--br);display:flex;align-items:center;gap:8px"><span class="bdg bg">🧾</span> <strong style="flex:1">${esc(s.customer_name)}</strong> <span class="tdm">No.${s.receipt_no}</span></div>`)];
  el.innerHTML = `<div class="card" style="padding:10px 16px">${rows.length ? rows.join('') : '<p style="color:var(--mt);padding:8px 0">No results found</p>'}</div>`;
  el.style.display = 'block';
}

// ════════════════════════════════════ INVENTORY
async function loadInv() {
  const el = $('page-inv');
  el.innerHTML = `
  <div class="ph">
    <div><div class="pt">Inventory</div><div class="ps" id="icnt">Loading…</div></div>
    <div class="ph-acts">
      <button class="btn bg_" onclick="$('upload-excel').click()">📄 Import Excel</button>
      <input type="file" id="upload-excel" accept=".xlsx, .xls, .csv" style="display:none" onchange="importExcel(this)">
      <button class="btn bs" onclick="openManageCatM()">⚙️ Categories</button>
      <button class="btn bp" onclick="openItemM()">+ Add Item</button>
    </div>
  </div>
  <div class="fb">
    <input class="fi" id="iq" placeholder="🔍 Name, serial, location…" oninput="renderInv()">
    <select id="icat" onchange="renderInv()"><option value="">All Categories</option></select>
    <select id="ish" onchange="renderInv()"><option value="active">Active</option><option value="low">Low Stock</option><option value="arch">Archived</option></select>
  </div>
  <div id="itbl"></div>`;
  if (_invFilter) {
    if (_invFilter.cat) $('icat').value = _invFilter.cat;
    if (_invFilter.sh) $('ish').value = _invFilter.sh;
    if (_invFilter.q) $('iq').value = _invFilter.q;
    _invFilter = null;
  }
  await refreshInv();
}

async function refreshInv() {
  const [cR, iR] = await Promise.all([
    sb.from('categories').select('*').order('name'),
    sb.from('items').select('*,categories(name)').order('name')
  ]);
  _cats = cR.data || []; _items = iR.data || [];
  const sel = $('icat');
  if (sel) { const v = sel.value; sel.innerHTML = '<option value="">All Categories</option>' + _cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(''); sel.value = v; }
  renderInv();
}

async function importExcel(input) {
  const f = input.files[0];
  if (!f) return;
  toast('Reading Excel file...', 'i');
  
  const over = $('import-overlay');
  const bar = $('import-bar');
  const txt = $('import-txt');
  const logBox = $('import-log');
  if(over) over.style.display = 'flex';
  if(logBox) logBox.innerHTML = '';

  const lg = (msg, isErr=false) => {
      if(!logBox) return;
      const d = document.createElement('div');
      d.textContent = '> ' + msg;
      if(isErr) d.style.color = '#ef4444';
      logBox.appendChild(d);
      logBox.scrollTop = logBox.scrollHeight;
  };
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      lg('File loaded into memory. Parsing Excel data...');
      if(typeof XLSX === 'undefined') throw new Error('SheetJS not loaded yet, please refresh the page.');
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, {type: 'array', cellDates: true});
      if (!workbook.SheetNames.length) throw new Error('No sheets found in excel');
      
      let count = 0;
      let errCount = 0;
      let totalSheets = workbook.SheetNames.length;
      let curIdx = 0;
      
      for (const sheetName of workbook.SheetNames) {
        curIdx++;
        if(txt) txt.textContent = `Processing sheet ${curIdx} of ${totalSheets}...`;
        lg(`\n--- Sheet: ${sheetName} ---`);
        await new Promise(r => setTimeout(r, 10));
        
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {header: 1, defval: ''});
        lg(`Found ${rows.length} rows.`);
        if (!rows || rows.length < 2) { lg('Not enough rows, skipping.'); continue; }
        
        let cur = null;
        let lastSeenName = '';
        
        const saveItem = async (it) => {
           if (!it) return;
           if (!it.name && lastSeenName) {
               it.name = lastSeenName;
               lg(`Inheriting name '${it.name}' for sub-category ${it.code}`);
           }
           if (!it.name) {
               lg(`Skipping item with code '${it.code}' because no name was found.`, true);
               return;
           }
           
           lastSeenName = it.name;
           
           let validDate = null;
           if (it.date) {
               if (it.date instanceof Date) {
                   validDate = it.date.toISOString().split('T')[0];
               } else if (typeof it.date === 'number' && it.date > 10000 && it.date < 100000) {
                   // Handle Excel serial date
                   const d = new Date(Math.round((it.date - 25569) * 86400 * 1000));
                   validDate = d.toISOString().split('T')[0];
               } else {
                   const ds = String(it.date).trim();
                   let parts = ds.split(/[-/]/);
                   if (parts.length === 3) {
                       // Try to detect DD/MM/YYYY or YYYY/MM/DD
                       let y = parts[2], m = parts[1], d = parts[0];
                       if (y.length < 4 && d.length === 4) [y, d] = [d, y]; // swap if YYYY/MM/DD
                       if (y.length >= 4) {
                           validDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
                       }
                   }
                   if (!validDate) {
                       const d = new Date(it.date);
                       if (!isNaN(d.getTime())) validDate = d.toISOString().split('T')[0];
                   }
               }
           }

           const payload = {
             name: it.name,
             serial_number: it.code || null,
             stock_qty: it.qty,
             cost_price: it.cost,
             sale_price: it.price
           };
           if (validDate) payload.date_of_boc = validDate;

           lg(`Attempting to save item: [${it.code||'NO-CODE'}] ${it.name} (Qty: ${it.qty}, Cost: ${it.cost}, Price: ${it.price}, Date: ${validDate||'none'})`);

           const { error } = await sb.from('items').insert(payload);
           if (!error) {
               count++;
               lg(`SUCCESS: Saved ${it.name}`);
           } else {
               if (error.code === '23505' && it.code) {
                   lg(`Duplicate SN detected for ${it.code}. Attempting to update instead...`);
                   const { error: upErr } = await sb.from('items').update(payload).eq('serial_number', it.code);
                   if (!upErr) {
                       count++;
                       lg(`SUCCESS: Updated ${it.name}`);
                   } else { 
                       errCount++; 
                       lg(`ERROR: Update failed for ${it.name}: ${upErr.message}`, true); 
                   }
               } else {
                   errCount++;
                   lg(`ERROR: Insert failed for ${it.name}: ${error.message}`, true);
               }
           }
        };
        
        for (let r=0; r<rows.length; r++) {
          // Update progress bar per row if there are many rows
          if (r % 100 === 0) {
             if(bar) bar.style.width = Math.round((r / rows.length) * 100) + '%';
             await new Promise(res => setTimeout(res, 5)); // yield to UI
          }

          const rowStr = rows[r].map(v => String(v || '')).join(' ').toLowerCase();
          const col0 = rows[r][0];
          const col1 = rows[r][1] ? String(rows[r][1]).trim() : '';
          
          // Skip if this is a header row repeating the item name column
          if (col1.toLowerCase() === 'item name') continue;

          if (rowStr.includes('item code')) {
             if (cur && (cur.name || cur.code)) await saveItem(cur);
             lg(`Found 'Item Code' header at row ${r+1}`);
             cur = { code: '', name: '', cost: 0, price: 0, qty: 0, date: '', hIdx: -1, cIdx: -1, pIdx: -1, bIdx: -1 };
             for (let c=0; c<rows[r].length; c++) {
               if (String(rows[r][c]).trim().toLowerCase().includes('item code')) {
                 cur.code = String(rows[r][c+1] || rows[r][c+2] || '').trim();
                 if(!cur.code && rows[r+1] && rows[r+1][c]) {
                     cur.code = String(rows[r+1][c]).trim();
                 }
               }
             }
          } else if (!cur && (rowStr.includes('cost price') || rowStr.includes('sale price'))) {
             cur = { code: '', name: '', cost: 0, price: 0, qty: 0, date: '', hIdx: -1, cIdx: -1, pIdx: -1, bIdx: -1 };
          }
          
          if (cur) {
             if (rowStr.includes('cost price') && (rowStr.includes('sale price') || rowStr.includes('c/bal') || rowStr.includes('bal'))) {
                cur.hIdx = r;
                const headers = rows[r].map(h => String(h).trim().toLowerCase());
                cur.cIdx = headers.findIndex(h => h.includes('cost price'));
                cur.pIdx = headers.findIndex(h => h.includes('sale price'));
                cur.bIdx = headers.findIndex(h => h === 'c/bal' || h === 'bal' || h.includes('bal'));
                lg(`Found data headers at row ${r+1}. C/Bal is at column index ${cur.bIdx}`);
             }
             else if (cur.hIdx !== -1 && r > cur.hIdx) {
                
                if (col1 && col1 !== '-' && col1.toLowerCase() !== 'total' && col1.toLowerCase() !== 'item name') {
                   if (cur.name && cur.name !== col1) {
                       lg(`Found NEW item name '${col1}' at row ${r+1}. Saving previous item.`);
                       await saveItem(cur);
                       cur = { code: '', name: col1, cost: 0, price: 0, qty: 0, date: col0 !== '-' ? col0 : '', hIdx: cur.hIdx, cIdx: cur.cIdx, pIdx: cur.pIdx, bIdx: cur.bIdx };
                   } else if (!cur.name) {
                       cur.name = col1;
                       if (col0 && col0 !== '-') cur.date = col0;
                       lg(`Identified item name: ${col1}`);
                   }
                }

                if (cur.cIdx !== -1 && rows[r][cur.cIdx]) {
                   const cval = Number(String(rows[r][cur.cIdx]).replace(/,/g, ''));
                   if (!isNaN(cval) && cval > 0) cur.cost = cval;
                }
                if (cur.pIdx !== -1 && rows[r][cur.pIdx]) {
                   const pval = Number(String(rows[r][cur.pIdx]).replace(/,/g, ''));
                   if (!isNaN(pval) && pval > 0) cur.price = pval;
                }
                if (cur.bIdx !== -1 && rows[r][cur.bIdx] !== '') {
                   const bval = Number(String(rows[r][cur.bIdx]).replace(/,/g, ''));
                   if (!isNaN(bval)) cur.qty = bval;
                }
             }
          }
        }
        
        if (cur && (cur.name || cur.code)) await saveItem(cur);
      }
      
      lg(`\nDONE! Imported: ${count}. Errors: ${errCount}.`);
      if (errCount > 0) {
        toast(`⚠️ Imported ${count} items. ${errCount} items failed (check log).`, 'w');
      } else {
        toast(`✅ Successfully imported ${count} items!`, 's');
      }
      if(txt) txt.textContent = `Completed! ${count} imported, ${errCount} errors.`;
      if(bar) bar.style.width = '100%';
      
      lg('Closing dialog in 3 seconds...');
      await new Promise(r => setTimeout(r, 3500));
      refreshInv();
    } catch(err) {
      if(typeof lg !== 'undefined') lg(`CRITICAL FATAL ERROR: ${err.message}`, true);
      toast('Failed to import: ' + err.message, 'e');
      await new Promise(r => setTimeout(r, 4000));
    } finally {
      if(over) over.style.display = 'none';
      input.value = '';
    }
  };
  reader.readAsArrayBuffer(f);
}

async function refreshInv() {
  const [cR, iR] = await Promise.all([
    sb.from('categories').select('*').order('name'),
    sb.from('items').select('*,categories(name)').order('name')
  ]);
  _cats = cR.data || []; _items = iR.data || [];
  const sel = $('icat');
  if (sel) { const v = sel.value; sel.innerHTML = '<option value="">All Categories</option>' + _cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(''); sel.value = v; }
  renderInv();
}

function renderInv() {
  const q = ($('iq')?.value || '').toLowerCase(), cat = $('icat')?.value, sh = $('ish')?.value || 'active';
  let items = [..._items];
  if (sh === 'active') items = items.filter(i => !i.archived);
  else if (sh === 'arch') items = items.filter(i => i.archived);
  else if (sh === 'low') items = items.filter(i => !i.archived && Number(i.stock_qty) <= Number(i.min_stock_threshold || 5));
  if (q) items = items.filter(i => i.name?.toLowerCase().includes(q) || i.serial_number?.toLowerCase().includes(q) || i.location?.toLowerCase().includes(q));
  if (cat) items = items.filter(i => i.category_id === cat);
  const cnt = $('icnt'); if (cnt) cnt.textContent = items.length + ' items';
  const el = $('itbl'); if (!el) return;
  if (!items.length) { el.innerHTML = '<div style="text-align:center;padding:50px;color:var(--mt)"><div style="font-size:48px;margin-bottom:10px">📦</div><p>No items found</p></div>'; return; }
  el.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>S/N</th><th>Name</th><th>Category</th><th>Location</th><th>Cost</th><th>Sale Price</th><th>Stock</th><th>Actions</th></tr></thead>
  <tbody>${items.map(i => `<tr>
    <td><code style="font-size:11px;background:#f1f5f9;padding:3px 5px;border-radius:4px">${esc(i.serial_number || '—')}</code></td>
    <td><div style="display:flex;align-items:center;gap:10px">
      ${i.image_url ? `<img src="${esc(i.image_url)}" style="width:32px;height:32px;border-radius:6px;object-fit:cover">` : '<div style="width:32px;height:32px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:16px">📦</div>'}
      <div>
        <div style="font-weight:600;line-height:1.2">${esc(i.name)}${i.archived ? '<span class="bdg bgr" style="margin-left:6px">Archived</span>' : ''}</div>
        ${i.description ? `<div style="font-size:11px;color:var(--mt);margin-top:2px">${esc(i.description.slice(0, 40))}</div>` : ''}
      </div>
    </div></td>
    <td class="tdm">${esc(i.categories?.name || '—')}</td>
    <td class="tdm">${esc(i.location || '—')}</td>
    <td class="tdm">${fmtM(i.cost_price)}</td>
    <td><strong style="color:var(--nv)">${fmtM(i.sale_price)}</strong></td>
    <td>${stBadge(i.stock_qty, i.min_stock_threshold)}</td>
    <td><div style="display:flex;gap:6px">
      <button class="btn bb_ bsm" onclick="viewItem('${i.id}')">View</button>
      <button class="btn bs bsm" onclick="editItem('${i.id}')">Edit</button>
      <button class="btn bd bsm" onclick="archItem('${i.id}',${!!i.archived})">${i.archived ? 'Restore' : 'Archive'}</button>
    </div></td>
  </tr>`).join('')}
  </tbody></table></div></div>`;
}

function openItemM(item = null) {
  const e = item || {};
  const cOpts = _cats.map(c => `<option value="${c.id}"${e.category_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  openM(`<h2>${item ? '✏️ Edit Item' : '➕ Add New Item'}</h2>
  <div id="ie" class="al ale" style="display:none"></div>
  <div class="r2">
    <div class="fg"><label>Item Name *</label><input id="fin" value="${esc(e.name || '')}"></div>
    <div class="fg"><label>Serial Number</label><input id="fisn" value="${esc(e.serial_number || '')}" placeholder="Auto-generated if blank"></div>
  </div>
  <div class="r3">
    <div class="fg"><label>Category</label><select id="ficat"><option value="">None</option>${cOpts}</select></div>
    <div class="fg"><label>Location</label><input id="filoc" value="${esc(e.location || '')}" placeholder="Shelf A-3"></div>
    <div class="fg"><label>Date of BOC</label><input id="fiboc" type="date" value="${e.date_of_boc || ''}"></div>
  </div>
  <div class="r3">
    <div class="fg"><label>Cost Price (Rs.)</label><input id="ficp" type="number" min="0" step="0.01" value="${e.cost_price || 0}"></div>
    <div class="fg"><label>Sale Price (Rs.) *</label><input id="fisp" type="number" min="0" step="0.01" value="${e.sale_price || 0}"></div>
    <div class="fg"><label>Discount %</label><input id="fidisc" type="number" min="0" max="100" value="${e.discount_pct || 0}"></div>
  </div>
  <div class="r3">
    <div class="fg"><label>Stock Qty *</label><input id="fiq" type="number" min="0" value="${e.stock_qty || 0}"></div>
    <div class="fg"><label>Min Alert</label><input id="fimq" type="number" min="0" value="${e.min_stock_threshold || 5}"></div>
    <div class="fg"><label>Unit</label><input id="fiunit" value="${esc(e.unit || 'pcs')}" placeholder="pcs / kg"></div>
  </div>
  <div class="fg"><label>Description</label><textarea id="fidesc">${esc(e.description || '')}</textarea></div>
  <div class="fg"><label>Item Image</label>
    <div class="img-drop" id="idrop" onclick="$('fiimg').click()">${e.image_url ? `<img src="${esc(e.image_url)}">` : '<span style="font-size:24px;margin-bottom:4px">📷</span><span>Click to upload image</span>'}</div>
    <input type="file" id="fiimg" accept="image/*" style="display:none" onchange="prevImg(event)">
  </div>
  <div class="mf">
    <button class="btn bp" onclick="submitItem('${item?.id || ''}')">✅ ${item ? 'Save Changes' : 'Add Item'}</button>
    <button class="btn bs" onclick="closeM()">Cancel</button>
  </div>`, '680px');
  window._imgFile = null;
}

function prevImg(e) { const f = e.target.files[0]; if (!f) return; window._imgFile = f; const r = new FileReader(); r.onload = ev => { $('idrop').innerHTML = `<img src="${ev.target.result}">`; }; r.readAsDataURL(f); }

async function submitItem(id) {
  const name = $('fin').value.trim(), err = $('ie');
  if (!name) { err.textContent = 'Name required'; err.style.display = 'block'; return; }
  try {
    let imgUrl = id ? (_items.find(i => i.id === id)?.image_url || null) : null, imgPath = null;
    if (window._imgFile) {
      const ext = window._imgFile.name.split('.').pop();
      const path = `${Date.now()}.${ext}`;
      const { data: upData, error: upErr } = await sb.storage.from('item-images').upload(path, window._imgFile, { upsert: true });
      if (upErr) throw upErr;
      imgPath = path;
      const { data: { publicUrl } } = sb.storage.from('item-images').getPublicUrl(path);
      imgUrl = publicUrl;
    }
    const sn = $('fisn').value.trim() || `PAF-${String(_items.filter(i => !i.archived).length + 1).padStart(4, '0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const payload = {
      name, serial_number: sn, category_id: $('ficat').value || null, location: $('filoc').value.trim(), date_of_boc: $('fiboc').value || null,
      cost_price: parseFloat($('ficp').value) || 0, sale_price: parseFloat($('fisp').value) || 0, discount_pct: parseFloat($('fidisc').value) || 0,
      stock_qty: parseInt($('fiq').value) || 0, min_stock_threshold: parseInt($('fimq').value) || 5, unit: $('fiunit').value.trim() || 'pcs',
      description: $('fidesc').value.trim(), image_url: imgUrl, image_path: imgPath, archived: false
    };
    if (id) { const { error } = await sb.from('items').update(payload).eq('id', id); if (error) throw error; addLog('UPDATE_ITEM', `${name}`); }
    else { const { error } = await sb.from('items').insert({ ...payload, created_at: new Date().toISOString() }); if (error) throw error; addLog('ADD_ITEM', `${name} (${sn})`); }
    toast(id ? 'Item updated' : 'Item added'); closeM(); await refreshInv();
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}

function viewItem(id) {
  const i = _items.find(x => x.id === id); if (!i) return;
  openM(`<h2>📦 ${esc(i.name)}</h2>
  ${i.image_url ? `<img src="${esc(i.image_url)}" style="max-height:180px;border-radius:10px;margin-bottom:18px;box-shadow:var(--shadow)">` : ''}
  <div class="r3" style="margin-bottom:16px">
    <div><div class="tdm" style="font-size:11px;font-weight:700">SERIAL</div><strong>${esc(i.serial_number || '—')}</strong></div>
    <div><div class="tdm" style="font-size:11px;font-weight:700">CATEGORY</div>${esc(i.categories?.name || '—')}</div>
    <div><div class="tdm" style="font-size:11px;font-weight:700">LOCATION</div>${esc(i.location || '—')}</div>
  </div>
  <div class="r4" style="margin-bottom:16px">
    <div><div class="tdm" style="font-size:11px;font-weight:700">COST</div><strong style="color:var(--rd)">${fmtM(i.cost_price)}</strong></div>
    <div><div class="tdm" style="font-size:11px;font-weight:700">SALE PRICE</div><strong style="color:var(--nv);font-size:15px">${fmtM(i.sale_price)}</strong></div>
    <div><div class="tdm" style="font-size:11px;font-weight:700">STOCK</div>${stBadge(i.stock_qty, i.min_stock_threshold)}</div>
    <div><div class="tdm" style="font-size:11px;font-weight:700">UNIT</div>${esc(i.unit || 'pcs')}</div>
  </div>
  ${i.description ? `<div style="margin-bottom:16px;background:#f8fafc;padding:12px;border-radius:8px"><div class="tdm" style="font-size:11px;font-weight:700;margin-bottom:4px">DESCRIPTION</div><p style="font-size:13px;line-height:1.5">${esc(i.description)}</p></div>` : ''}
  <div class="mf"><button class="btn bs" onclick="closeM()">Close</button><button class="btn bp bsm" onclick="closeM();editItem('${id}')">Edit</button></div>`, '520px');
}
function editItem(id) { openItemM(_items.find(x => x.id === id)); }
async function archItem(id, isArch) {
  if (!confirm(isArch ? 'Restore this item?' : 'Archive this item?')) return;
  await sb.from('items').update({ archived: !isArch }).eq('id', id);
  addLog(isArch ? 'RESTORE_ITEM' : 'ARCHIVE_ITEM', `id:${id}`); toast(isArch ? 'Restored' : 'Archived', isArch ? 's' : 'w'); await refreshInv();
}
function openManageCatM() {
  const cats = _cats || [];
  const rows = cats.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid var(--br)">
      <div style="display:flex;gap:8px;align-items:center;flex:1">
        <input class="fi" style="margin:0;width:100%" value="${esc(c.name)}" id="cat_nm_${c.id}">
      </div>
      <div style="display:flex;gap:4px;margin-left:12px">
        <button class="btn bs bsm" onclick="saveCat('${c.id}')">💾</button>
        <button class="btn bs bsm" style="color:var(--rd)" onclick="delCat('${c.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
  
  const pOpts = cats.filter(c => !c.name.includes(' / ')).map(c => `<option value="${c.name}">${esc(c.name)}</option>`).join('');

  openM(`<h2>⚙️ Manage Categories</h2>
  <div style="max-height:280px;overflow-y:auto;margin-bottom:16px;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid var(--br)">
    ${rows || '<p style="color:var(--mt);font-size:12px">No categories found.</p>'}
  </div>
  <div style="font-weight:700;font-size:11px;color:var(--nv);margin-bottom:8px">ADD NEW CATEGORY</div>
  <div class="fg" style="display:flex;gap:8px">
     <select id="nc_p" style="width:160px"><option value="">Main Category</option>${pOpts}</select>
     <input id="nc_n" placeholder="Name (e.g. Chairs)" style="flex:1">
     <button class="btn bp" onclick="addNewCat()">+ Add</button>
  </div>
  <div class="mf"><button class="btn bs" onclick="closeM()">Done</button></div>`, '500px');
}

async function addNewCat() {
  const p = $('nc_p').value;
  const n = $('nc_n').value.trim();
  if(!n) return;
  const finalName = p ? `${p} / ${n}` : n;
  const { error } = await sb.from('categories').insert({ name: finalName });
  if (error) { toast(error.message, 'e'); return; }
  addLog('ADD_CATEGORY', finalName); toast('Category added'); 
  await refreshInv(); 
  openManageCatM();
}

async function saveCat(id) {
  const n = $('cat_nm_' + id).value.trim();
  if(!n) return;
  const { error } = await sb.from('categories').update({ name: n }).eq('id', id);
  if (error) { toast(error.message, 'e'); return; }
  toast('Saved');
  await refreshInv();
  openManageCatM();
}

async function delCat(id) {
  if(!confirm('Delete this category? Items in this category will become uncategorized.')) return;
  const { error } = await sb.from('categories').delete().eq('id', id);
  if (error) { toast(error.message, 'e'); return; }
  toast('Deleted');
  await refreshInv();
  openManageCatM();
}

// ════════════════════════════════════ POS
async function loadPOS() {
  const { data } = await sb.from('items').select('*,categories(name)').eq('archived', false).order('name');
  _posItems = data || [];
  const sess = CU;
  $('page-pos').innerHTML = `
  <div class="ph"><div class="pt">Shop / POS</div></div>
  <div class="pos-w">
    <div class="pos-l">
      <div class="card" style="margin-bottom:14px;padding:14px">
        <input id="posq" style="width:100%;padding:10px 14px;border:1.5px solid var(--br);border-radius:8px;font-size:14px;outline:none;background:#f8fafc" placeholder="🔍 Search items by name, serial, location…" oninput="filterPOS(this.value)">
      </div>
      <div id="posgrid" class="ig"></div>
    </div>
    <div class="pos-r">
      <div style="font-size:16px;font-weight:800;color:var(--nv);margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--br);display:flex;align-items:center;gap:8px"><span>🛒</span> Cart</div>
      <div class="fg"><label>Customer Name *</label><input id="posc" placeholder="e.g. Begum AVM Inam"></div>
      <div class="r2">
        <div class="fg"><label>Cashier</label><input id="poscash" value="${esc(sess?.fullName || sess?.username || 'Staff')}"></div>
        <div class="fg"><label>Payment Method</label>
          <select id="pospm"><option>Cash</option><option>Mess Bill</option><option>PAFWA Home Store</option><option>Gift</option><option>Special Case</option></select>
        </div>
      </div>
      <div class="r2">
        <div class="fg">
          <label>Discount</label>
          <div style="display:flex;gap:4px">
            <input id="posdisc" type="number" min="0" value="0" oninput="updTotal()" style="flex:1">
            <select id="posdtype" onchange="updTotal()" style="width:60px;padding:8px;border:1.5px solid var(--br);border-radius:8px">
              <option value="rs">Rs</option>
              <option value="pct">%</option>
            </select>
          </div>
        </div>
        <div class="fg" style="display:flex;align-items:center;gap:10px;margin-top:20px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;user-select:none">
            <input type="checkbox" id="pospaid" checked style="width:18px;height:18px;accent-color:var(--nv)"> Payment Received
          </label>
        </div>
      </div>
      <div id="cartrows" style="flex:1;overflow-y:auto;min-height:120px;margin-bottom:12px"></div>
      <div id="cartfoot" style="display:none;background:#f8fafc;padding:14px;border-radius:10px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--mt);margin-bottom:6px"><span>Subtotal:</span><span id="possub">Rs. 0</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--or);margin-bottom:10px;font-weight:600"><span>Discount:</span><span id="posdlbl">Rs. 0</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:18px;font-weight:900;color:var(--nv);padding-top:10px;border-top:2px dashed var(--br)"><span>TOTAL</span><span id="postot">Rs. 0</span></div>
      </div>
      <button id="posbtn" class="btn bg_ bfl" style="font-size:15px;padding:14px" onclick="completeSale()" style="display:none">✅ Complete Sale</button>
      <button id="posclr" class="btn bs bfl" style="margin-top:8px;display:none" onclick="clearCart()">🗑 Clear Cart</button>
      <div id="saleok" style="display:none;margin-top:14px"></div>
    </div>
  </div>`;
  _cart = []; renderPOSGrid(_posItems); renderCart();
}

function renderPOSGrid(items) {
  const el = $('posgrid'); if (!el) return;
  if (!items.length) { el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--mt);background:#fff;border-radius:10px">No items found</div>'; return; }
  el.innerHTML = items.map(i => {
    const oos = Number(i.stock_qty) <= 0; return `<div class="ic${oos ? ' oos' : ''}" onclick="${oos ? '' : 'addToCart(\'' + i.id + '\')'}">
    <div class="ic-img">${i.image_url ? `<img src="${esc(i.image_url)}">` : '📦'}</div>
    <div style="font-weight:700;font-size:13px;line-height:1.3;margin-bottom:4px">${esc(i.name)}</div>
    <div style="font-size:10px;color:var(--mt);font-family:monospace">${esc(i.serial_number || '')}</div>
    <div style="font-size:15px;font-weight:800;color:var(--nv);margin-top:6px">${fmtM(i.sale_price)}</div>
    <div style="font-size:11px;margin-top:4px;font-weight:600">${oos ? '<span style="color:var(--rd)">Out of Stock</span>' : `<span style="color:var(--gr)">In Stock: ${i.stock_qty}</span>`}</div>
  </div>`;
  }).join('');
}
function filterPOS(q) { renderPOSGrid(q ? _posItems.filter(i => i.name?.toLowerCase().includes(q.toLowerCase()) || i.serial_number?.toLowerCase().includes(q.toLowerCase()) || i.location?.toLowerCase().includes(q.toLowerCase())) : _posItems); }
function addToCart(id) {
  const item = _posItems.find(i => i.id === id); if (!item || Number(item.stock_qty) <= 0) { toast('Out of stock', 'e'); return; }
  const ex = _cart.find(c => c.id === id);
  const basePrice = item.sale_price;
  const discPct = item.discount_pct || 0;
  const finalPrice = basePrice - (basePrice * (discPct / 100));
  
  if (ex) { if (ex.qty >= Number(item.stock_qty)) { toast(`Max: ${item.stock_qty}`, 'w'); return; } ex.qty++; ex.total = ex.qty * ex.price; }
  else _cart.push({ id, name: item.name, sn: item.serial_number || '', price: finalPrice, origPrice: basePrice, discPct, qty: 1, total: finalPrice, max: Number(item.stock_qty), unit: item.unit || 'pcs' });
  renderCart(); toast(item.name + (discPct > 0 ? ` (${discPct}% off)` : '') + ' added');
}
function upQty(id, v) { const e = _cart.find(c => c.id === id); if (!e) return; const n = parseInt(v); if (isNaN(n) || n < 1) return; if (n > e.max) { toast(`Max: ${e.max}`, 'w'); return; } e.qty = n; e.total = n * e.price; renderCart(); }
function upPr(id, v) { const e = _cart.find(c => c.id === id); if (!e) return; const p = parseFloat(v); if (isNaN(p) || p < 0) return; e.price = p; e.total = e.qty * p; renderCart(); }
function rmCart(id) { _cart = _cart.filter(c => c.id !== id); renderCart(); }
function clearCart() { if (_cart.length && !confirm('Clear cart?')) return; _cart = []; renderCart(); const ok = $('saleok'); if (ok) ok.style.display = 'none'; }
function updTotal() {
  const sub = _cart.reduce((a, i) => a + i.total, 0);
  const dv = parseFloat($('posdisc')?.value) || 0;
  const dt = $('posdtype')?.value || 'rs';
  const disc = dt === 'pct' ? (sub * (dv / 100)) : dv;
  const total = Math.max(0, sub - disc);
  
  const subEl = $('possub'), dEl = $('posdlbl'), totEl = $('postot');
  if (subEl) subEl.textContent = fmtM(sub);
  if (dEl) dEl.textContent = (dt === 'pct' && dv > 0 ? `(${dv}%) ` : '') + fmtM(disc);
  if (totEl) totEl.textContent = fmtM(total);
  
  const ctv = $('ctv'); if (ctv) ctv.textContent = fmtM(total);
  return { sub, disc, total };
}
function renderCart() {
  const cr = $('cartrows'), cf = $('cartfoot'), btn = $('posbtn'), clr = $('posclr'); if (!cr || !cf) return;
  if (!_cart.length) { cr.innerHTML = '<div style="text-align:center;padding:30px;color:var(--mt)"><div style="font-size:42px;margin-bottom:10px">🛒</div><p style="font-weight:600">Cart empty</p></div>'; cf.style.display = 'none'; btn.style.display = 'none'; clr.style.display = 'none'; return; }
  cr.innerHTML = _cart.map(it => `<div class="ci" style="padding:12px;background:#fff;border-radius:8px;border:1px solid var(--br);margin-bottom:8px">
    <div style="flex:1">
      <div style="font-weight:700;font-size:13px;color:var(--tx)">${esc(it.name)}</div>
      <div style="font-size:10px;color:var(--mt);font-family:monospace;margin-top:2px">${esc(it.sn)}</div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
        <div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--mt);font-weight:600">Qty</span><input type="number" class="qi" value="${it.qty}" min="1" max="${it.max}" onchange="upQty('${it.id}',this.value)"></div>
        <div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--mt);font-weight:600">Rate</span><input type="number" class="pi" value="${it.price}" min="0" onchange="upPr('${it.id}',this.value)"></div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between">
      <div style="font-weight:800;color:var(--nv);font-size:14px">${fmtM(it.total)}</div>
      <button class="btn bs" style="padding:4px 8px;font-size:11px;margin-top:14px;color:var(--rd);border-color:#fca5a5" onclick="rmCart('${it.id}')">Remove</button>
    </div>
  </div>`).join('');
  cf.style.display = 'block'; btn.style.display = 'flex'; clr.style.display = 'flex'; updTotal();
}

async function completeSale() {
  const cust = ($('posc')?.value || '').trim(), cashier = ($('poscash')?.value || 'Staff').trim();
  const pm = $('pospm')?.value || 'Cash', paid = $('pospaid')?.checked !== false;
  if (!cust) { toast('Enter customer name', 'e'); $('posc')?.focus(); return; }
  if (!_cart.length) { toast('Cart empty', 'e'); return; }
  const btn = $('posbtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Processing…'; }
  try {
    const { sub, disc, total } = updTotal();
    const { data: rnoData, error: rnoErr } = await sb.rpc('get_next_receipt_no');
    if (rnoErr) throw rnoErr;
    const rno = rnoData;
    const { data: saleData, error: saleErr } = await sb.from('sales').insert({
      receipt_no: rno, customer_name: cust, cashier, payment_method: pm,
      subtotal: sub, discount: disc, total, paid,
      paid_at: paid ? new Date().toISOString() : null,
      created_by: CU?.id
    }).select().single();
    if (saleErr) throw saleErr;
    const saleItems = _cart.map(i => ({ sale_id: saleData.id, item_id: i.id, item_name: i.name, item_sn: i.sn, quantity: i.qty, unit_price: i.price, total: i.total, unit: i.unit }));
    const { error: siErr } = await sb.from('sale_items').insert(saleItems);
    if (siErr) throw siErr;
    for (const ci of _cart) {
      const cur = _posItems.find(i => i.id === ci.id);
      const newQty = Math.max(0, Number(cur?.stock_qty || 0) - ci.qty);
      await sb.from('items').update({ stock_qty: newQty }).eq('id', ci.id);
    }
    addLog('SALE', `No.${rno} | ${cust} | ${fmtM(total)} | ${pm}`);
    const ok = $('saleok'); const saleForPrint = { ...saleData, items: saleItems };
    if (ok) {
      ok.style.display = 'block'; ok.innerHTML = `<div class="al als" style="margin-top:16px;border-width:2px;background:#f0fdf4">
      <div style="font-size:16px;font-weight:800;color:var(--gr);margin-bottom:4px">✅ Sale Complete!</div>
      <div style="font-size:13px;color:var(--tx);margin-bottom:12px">Receipt No: <strong style="font-size:14px">${rno}</strong> &nbsp;|&nbsp; Total: <strong style="font-size:14px">${fmtM(total)}</strong></div>
      <button class="btn bgd bfl" onclick='printRcpt(${JSON.stringify(saleForPrint)})'>🖨️ Print Receipt</button>
    </div>`;
    }
    _cart = []; renderCart(); $('posc').value = '';
    const { data: fresh } = await sb.from('items').select('*,categories(name)').eq('archived', false).order('name');
    _posItems = fresh || []; filterPOS($('posq')?.value || '');
    toast(`Receipt No.${rno} generated!`);
  } catch (e) { toast(e.message, 'e'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '✅ Complete Sale'; } }
}

// ════════════════════════════════════ RECEIPT PRINT
async function printRcptById(saleId) {
  const { data: s } = await sb.from('sales').select('*').eq('id', saleId).single();
  const { data: items } = await sb.from('sale_items').select('*').eq('sale_id', saleId);
  if (!s) return;
  const { data: cfg } = await sb.from('settings').select('key,value');
  const c = {}; (cfg || []).forEach(r => c[r.key] = r.value);
  printRcpt({ ...s, items });
}
function printRcpt(sale) {
  const cfg = {};
  sb.from('settings').select('key,value').then(({ data }) => { (data || []).forEach(r => cfg[r.key] = r.value); _doPrint(sale, cfg); });
}
function _doPrint(sale, cfg) {
  const d = new Date(sale.created_at || Date.now());
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), yy = d.getFullYear();
  const items = sale.items || []; const ROWS = 11, empty = Math.max(0, ROWS - items.length);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt No.${sale.receipt_no}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px}
  .pg{width:210mm;min-height:297mm;padding:14mm 16mm;margin:0 auto}
  .hdr{text-align:center;margin-bottom:8px}.org{font-size:28px;font-weight:900;letter-spacing:1px}
  .loc{font-size:14px;font-weight:600}.mw{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  table{width:100%;border-collapse:collapse}th{background:#c8c8c8;border:1px solid #000;padding:7px 8px;font-weight:700}
  th.dsc{text-align:left}td{border:1px solid #000;padding:5px 8px;font-size:13px}
  td.sno,td.qty{text-align:center;width:55px}td.rate,td.amt{text-align:right;width:90px}
  .tr{background:#c8c8c8;font-weight:700}.foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px}
  .sig-line{width:140px;border-bottom:1px solid #000;height:30px;display:inline-block}
  @media print{.nopr{display:none}}</style></head>
  <body>
  <div class="nopr" style="background:#1a3a6b;color:#fff;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;font-family:sans-serif">
    <strong>Receipt No.${sale.receipt_no} — ${sale.customer_name}</strong>
    <div><button onclick="window.print()" style="background:#c5a028;color:#000;border:none;padding:8px 18px;border-radius:6px;font-weight:700;cursor:pointer">🖨️ Print / Save PDF</button>
    <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;margin-left:8px">✕</button></div>
  </div>
  <div class="pg">
    <div class="hdr">
      <img src="logo.png" style="width:175px;height:175px;object-fit:contain;margin-bottom:8px" onerror="this.src='logo_160.png'">
      <div class="org">${cfg.org_name || 'PAFWA APF'}</div>
      <div class="loc">${cfg.location || 'PAC KAMRA'}</div>
    </div>
    <div class="mw" style="margin-top:16px">
      <div style="font-weight:700;font-size:14px">Receipt No. ${sale.receipt_no}</div>
      <div style="font-weight:700;font-size:14px">Dated: <u>${dd}-${mm}-${yy}</u></div>
    </div>
    <div style="font-size:14px;font-weight:700;margin-bottom:10px">Name: <strong style="font-size:16px;margin-left:12px">${sale.customer_name}</strong></div>
    <table>
      <thead><tr><th style="width:50px">S No.</th><th class="dsc">DESCRIPTION</th><th style="width:55px">QTY</th><th style="width:90px;text-align:right">RATE</th><th style="width:90px;text-align:right">AMOUNT</th></tr></thead>
      <tbody>
        ${items.map((it, i) => `<tr><td class="sno">${i + 1}</td><td>${it.item_name}</td><td class="qty">${it.quantity}</td><td class="rate">${Number(it.unit_price).toLocaleString()}</td><td class="amt">${Number(it.total).toLocaleString()}</td></tr>`).join('')}
        ${empty > 0 ? `<tr><td colspan="5" style="padding:0;position:relative;height:${empty * 28}px;border:1px solid #000;overflow:hidden">
          <table style="width:100%;height:100%;border-collapse:collapse;position:absolute;top:0;left:0">${Array(empty).fill(0).map(() => `<tr style="height:28px"><td style="width:50px;border-right:1px solid #000">&nbsp;</td><td>&nbsp;</td><td style="width:55px;border-left:1px solid #000">&nbsp;</td><td style="width:90px;border-left:1px solid #000">&nbsp;</td><td style="width:90px;border-left:1px solid #000">&nbsp;</td></tr>`).join('')}</table>
          <svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="5" y1="0" x2="95" y2="100" stroke="#000" stroke-width="0.6" vector-effect="non-scaling-stroke"/></svg>
        </td></tr>`: ''}
        <tr class="tr"><td colspan="4" style="text-align:center;border:1px solid #000;padding:8px">Total</td><td style="text-align:right;border:1px solid #000;padding:8px;font-size:15px">${Number(sale.total).toLocaleString()}</td></tr>
        ${sale.discount > 0 ? `<tr><td colspan="4" style="text-align:right;border:1px solid #000;padding:4px 8px;font-size:11px;color:#666">Discount Given</td><td style="text-align:right;border:1px solid #000;padding:4px 8px;font-size:12px;font-weight:700">Rs. ${Number(sale.discount).toLocaleString()}</td></tr>` : ''}
      </tbody>
    </table>
    <div style="margin-top:12px;text-align:left;font-weight:800;font-size:18px;color:${sale.paid ? '#15803d' : '#b91c1c'}">${sale.paid ? 'PAID' : 'UNPAID'}</div>
    <div class="foot"><div style="font-weight:700;font-size:14px">${cfg.receipt_footer || 'Received with Thanks'}</div><div style="font-weight:700;font-size:14px">Sig: <span class="sig-line"></span></div></div>
    <div style="margin-top:10px;font-size:12px;line-height:1.6;text-align:left">
      Bank: <strong>Bank AL-Habib</strong><br>
      Acct Title: <strong>PAFWA Fund APF</strong><br>
      Acctt No: <strong>0225008100598101</strong><br>
      IBAN No: <strong>PK34BAHL0225008100598101</strong>
    </div>
    <div style="margin-top:24px;font-size:10px;color:#999;text-align:center">Printed: ${new Date().toLocaleString('en-PK')} · Cashier: ${sale.cashier || '—'} · Payment: ${sale.payment_method || 'Cash'}</div>
  </div></body></html>`;
  const w = window.open('', '_blank', 'width=820,height=950'); w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 700);
}

// ════════════════════════════════════ RECEIPTS
async function loadRcpt() {
  $('page-rcpt').innerHTML = `
  <div class="ph"><div class="pt">Receipts</div></div>
  <div class="fb">
    <input class="fi" id="rq" placeholder="🔍 Receipt no. or customer…" oninput="renderRcpt()">
    <div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:4px;border-radius:6px;border:1px solid var(--br)">
      <input type="date" id="rfrom" onchange="renderRcpt()" style="border:none;background:transparent;padding:4px">
      <span style="color:var(--mt);font-size:12px;font-weight:600">to</span>
      <input type="date" id="rto" onchange="renderRcpt()" style="border:none;background:transparent;padding:4px">
    </div>
    <select id="rpm" onchange="renderRcpt()"><option value="">All Methods</option><option>Cash</option><option>Mess Bill</option><option>PAFWA Home Store</option><option>Special Case</option></select>
    <select id="rst" onchange="renderRcpt()"><option value="">All Statuses</option><option value="paid">Paid</option><option value="pend">Pending</option></select>
  </div>
  <div id="rtbl">⏳ Loading…</div>`;
  if (_rcptFilter) {
    if (_rcptFilter.st) $('rst').value = _rcptFilter.st;
    if (_rcptFilter.q) $('rq').value = _rcptFilter.q;
    _rcptFilter = null;
  }
  await renderRcpt();
}
async function renderRcpt() {
  let q = sb.from('sales').select('*').order('created_at', { ascending: false });
  const from = $('rfrom')?.value, to = $('rto')?.value, pm = $('rpm')?.value, st = $('rst')?.value, sq = $('rq')?.value;
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to + 'T23:59:59');
  if (pm) q = q.eq('payment_method', pm);
  if (st === 'paid') q = q.eq('paid', true);
  if (st === 'pend') q = q.eq('paid', false);
  const { data: sales } = await q;
  let s = sales || [];
  if (sq) { const ql = sq.toLowerCase(); s = s.filter(x => String(x.receipt_no).includes(sq) || x.customer_name?.toLowerCase().includes(ql)); }
  const tot = s.reduce((a, x) => a + Number(x.total), 0);
  const el = $('rtbl'); if (!el) return;
  el.innerHTML = `<div class="al ali" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
    <span>Showing <strong>${s.length}</strong> receipts</span>
    <span style="font-size:15px">Total: <strong>${fmtM(tot)}</strong></span>
  </div>
  ${s.length ? `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Receipt#</th><th>Customer</th><th>Subtotal</th><th>Disc</th><th>Total</th><th>Method</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
  <tbody>${s.map(x => `<tr style="${!x.paid ? 'background:#fffbeb' : ''}">
    <td><span class="bdg bb">No.${x.receipt_no}</span></td>
    <td><strong>${esc(x.customer_name)}</strong></td>
    <td class="tdm">${fmtM(x.subtotal)}</td><td class="tdm">${fmtM(x.discount)}</td>
    <td><strong style="color:var(--nv)">${fmtM(x.total)}</strong></td>
    <td>${pmBadge(x.payment_method || 'Cash')}</td>
    <td>${payBadge(x.paid)}</td>
    <td class="tdm">${fmtDT(x.created_at)}</td>
    <td><div style="display:flex;gap:6px">
      <button class="btn bs bsm" onclick="printRcptById('${x.id}')">🖨️ Print</button>
      ${!x.paid ? `<button class="btn bg_ bsm" onclick="markPaid('${x.id}')">✅ Mark Paid</button>` : ''}
    </div></td>
  </tr>`).join('')}</tbody></table></div></div>` : '<div style="text-align:center;padding:50px;color:var(--mt)"><div style="font-size:42px;margin-bottom:10px">🧾</div><p>No receipts found</p></div>'}`;
}
async function markPaid(id) { await sb.from('sales').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', id); addLog('MARK_PAID', `id:${id}`); toast('Marked paid'); renderRcpt(); }

// ════════════════════════════════════ ACCOUNTING
async function loadAcct() {
  $('page-acct').innerHTML = `
  <div class="ph"><div class="pt">Accounting</div></div>
  <div class="tabs">
    <button class="tab on" onclick="tabA('sum',this)">📊 Summary</button>
    <button class="tab" onclick="tabA('led',this)">🧾 Ledger</button>
    <button class="tab" onclick="tabA('liab',this)">📋 Liabilities</button>
  </div>
  <div id="asum" class="tabp on"></div>
  <div id="aled" class="tabp"></div>
  <div id="aliab" class="tabp"></div>`;
  await loadAcctSum();
}
function tabA(t, btn) { document.querySelectorAll('#page-acct .tab').forEach(e => e.classList.remove('on')); document.querySelectorAll('#page-acct .tabp').forEach(e => e.classList.remove('on')); btn.classList.add('on'); $('a' + t).classList.add('on'); if (t === 'led') loadAcctLed(); else if (t === 'liab') loadAcctLiab(); }
async function loadAcctSum() {
  ld($('asum'));
  const [sR, lR, iR] = await Promise.all([
    sb.from('sales').select('total,paid,discount,payment_method,subtotal'),
    sb.from('liabilities').select('amount'),
    sb.from('items').select('cost_price,sale_price,stock_qty').eq('archived', false)
  ]);
  const sales = sR.data || [], liabs = lR.data || [], items = iR.data || [];
  
  const totRev = sales.reduce((a, s) => a + Number(s.total), 0);
  const totDisc = sales.reduce((a, s) => a + Number(s.discount || 0), 0);
  const paidRev = sales.filter(s => s.paid).reduce((a, s) => a + Number(s.total), 0);
  const pendRev = sales.filter(s => !s.paid).reduce((a, s) => a + Number(s.total), 0);
  const totLiab = liabs.reduce((a, l) => a + Number(l.amount), 0);
  const totGift = sales.filter(s => s.payment_method === 'Gift').reduce((a, s) => a + Number(s.total), 0);

  // Realized Profit (Estimate from sales - cost)
  // We'll fetch sale_items for accurate COGS if possible, or estimate
  const { data: si } = await sb.from('sale_items').select('quantity,unit_price,total,item_id');
  const { data: itemMap } = await sb.from('items').select('id,cost_price');
  const costMap = {}; (itemMap || []).forEach(i => costMap[i.id] = i.cost_price);
  const totCOGS = (si || []).reduce((a, s) => a + (Number(s.quantity) * Number(costMap[s.item_id] || 0)), 0);
  const profitRealized = totRev - totCOGS;

  // Unrealized Worth & Profit
  const unrealizedWorth = items.reduce((a, i) => a + (Number(i.sale_price) * Number(i.stock_qty)), 0);
  const unrealizedProfit = items.reduce((a, i) => a + ((Number(i.sale_price) - Number(i.cost_price)) * Number(i.stock_qty)), 0);

  const byM = {}; sales.forEach(s => { const m = s.payment_method || 'Cash'; if (!byM[m]) byM[m] = { c: 0, t: 0 }; byM[m].c++; byM[m].t += Number(s.total); });

  $('asum').innerHTML = `
  <div class="g3" style="margin-bottom:16px">
    <div class="stat g"><div class="sl">Total Sales Generated</div><div class="sv" style="color:var(--gr)">${fmtM(totRev)}</div><div class="ss">${sales.length} transactions</div></div>
    <div class="stat b"><div class="sl">Realized Profit</div><div class="sv" style="color:var(--bl)">${fmtM(profitRealized)}</div><div class="ss">Based on COGS</div></div>
    <div class="stat s"><div class="sl">Unrealized Worth</div><div class="sv" style="color:var(--sk)">${fmtM(unrealizedWorth)}</div><div class="ss">Stock at Sale Price</div></div>
  </div>
  <div class="g3" style="margin-bottom:16px">
    <div class="stat o"><div class="sl">Unrealized Profit</div><div class="sv" style="color:var(--or)">${fmtM(unrealizedProfit)}</div><div class="ss">Expected Margin</div></div>
    <div class="stat r"><div class="sl">Total Liabilities</div><div class="sv" style="color:var(--rd)">${fmtM(totLiab)}</div><div class="ss">From Ledger</div></div>
    <div class="stat r"><div class="sl">Pending Cash</div><div class="sv" style="color:var(--rd)">${fmtM(pendRev)}</div><div class="ss">Unpaid Receipts</div></div>
  </div>
  <div class="g3" style="margin-bottom:16px">
    <div class="stat o"><div class="sl">Discounts Given</div><div class="sv" style="color:var(--or)">${fmtM(totDisc)}</div></div>
    <div class="stat p"><div class="sl">Gifts</div><div class="sv" style="color:var(--pu)">${fmtM(totGift)}</div></div>
    <div class="stat g"><div class="sl">Net Cash (Paid − Liab)</div><div class="sv" style="color:var(--gr)">${fmtM(paidRev - totLiab)}</div></div>
  </div>
  <div class="card"><div class="ct_">Sales Distribution by Method</div><div class="tw"><table>
  <thead><tr><th>Method</th><th>Count</th><th>Total</th></tr></thead>
  <tbody>${Object.entries(byM).map(([m, v]) => `<tr><td>${pmBadge(m)}</td><td class="tdm">${v.c}</td><td><strong>${fmtM(v.t)}</strong></td></tr>`).join('')}</tbody></table></div></div>`;
}
async function loadAcctLed() {
  const { data: sales } = await sb.from('sales').select('*').order('created_at', { ascending: false });
  $('aled').innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Date</th><th>Receipt#</th><th>Customer</th><th>Cashier</th><th>Sub</th><th>Disc</th><th>Total</th><th>Method</th><th>Status</th></tr></thead>
  <tbody>${(sales || []).map(s => `<tr><td class="tdm">${fmtDT(s.created_at)}</td><td><span class="bdg bb">No.${s.receipt_no}</span></td><td><strong>${esc(s.customer_name)}</strong></td><td class="tdm">${esc(s.cashier)}</td><td class="tdm">${fmtM(s.subtotal)}</td><td class="tdm">${fmtM(s.discount)}</td><td><strong style="color:var(--nv)">${fmtM(s.total)}</strong></td><td>${pmBadge(s.payment_method || 'Cash')}</td><td>${payBadge(s.paid)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
async function loadAcctLiab() {
  const { data: liabs } = await sb.from('liabilities').select('*').order('created_at', { ascending: false });
  const tot = (liabs || []).reduce((a, l) => a + Number(l.amount), 0);
  $('aliab').innerHTML = `
  <div class="fb" style="background:#fef2f2;border:1px solid #fecaca">
    <input id="lamt" type="number" min="0" placeholder="Amount (Rs.)" style="width:150px">
    <input id="lrem" placeholder="Remarks / Description" class="fi">
    <button class="btn bd" onclick="addLiab()">+ Add Liability</button>
  </div>
  <div class="al" style="background:#fef2f2;color:#b91c1c;border-color:#ef4444;font-size:15px">Total Liabilities: <strong style="font-size:18px">${fmtM(tot)}</strong></div>
  <div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Date</th><th>Amount</th><th>Remarks</th><th>Added By</th><th>Actions</th></tr></thead>
  <tbody>${(liabs || []).map(l => `<tr><td class="tdm">${fmtDT(l.created_at)}</td><td><strong style="color:var(--rd)">${fmtM(l.amount)}</strong></td><td>${esc(l.remarks)}</td><td class="tdm">${esc(l.added_by || '—')}</td><td><button class="btn bs bsm" style="color:var(--rd)" onclick="delLiab('${l.id}')">Delete</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
async function addLiab() { const a = parseFloat($('lamt')?.value), r = ($('lrem')?.value || '').trim(); if (isNaN(a) || a <= 0) { toast('Enter valid amount', 'e'); return; } if (!r) { toast('Enter remarks', 'e'); return; } await sb.from('liabilities').insert({ amount: a, remarks: r, added_by: CU?.username }); addLog('ADD_LIAB', `Rs.${a}: ${r}`); toast('Liability added'); loadAcctLiab(); }
async function delLiab(id) { if (!confirm('Delete liability?')) return; await sb.from('liabilities').delete().eq('id', id); addLog('DEL_LIAB', `id:${id}`); toast('Deleted'); loadAcctLiab(); }

// ════════════════════════════════════ REPORTS
async function loadRep() {
  const { data: catsD } = await sb.from('categories').select('*').order('name');
  $('page-rep').innerHTML = `
  <div class="ph"><div class="pt">Reports &amp; Export</div></div>
  <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">
    <button class="btn bp" onclick="showRep('sales',this)" id="btn-rep-sales">📈 Sales</button>
    <button class="btn bs" onclick="showRep('inv',this)" id="btn-rep-inv">📦 Inventory</button>
    <button class="btn bs" onclick="showRep('low',this)" id="btn-rep-low">⚠️ Low Stock</button>
    <button class="btn bs" onclick="showRep('acct',this)" id="btn-rep-acct">💰 Accounting</button>
  </div>
  <div class="fb" id="repfil"></div>
  <div style="display:flex;gap:10px;margin-bottom:16px">
    <button class="btn bp" onclick="runRep()">Generate Report</button>
    <button class="btn bg_" onclick="expCSV()">⬇ Export CSV</button>
  </div>
  <div id="repout"></div>`;
  window._repCats = catsD || [];
  showRep('sales', $('btn-rep-sales'));
}
function showRep(t, btn) {
  _repType = t;
  document.querySelectorAll('#page-rep .btn:not(.bg_):not([onclick="runRep()"])').forEach(b => { b.className = 'btn bs'; });
  if (btn) btn.className = 'btn bp';
  const catO = (window._repCats || []).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const dateInput = `<div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:4px;border-radius:6px;border:1px solid var(--br)"><input type="date" id="rff" style="border:none;background:transparent;padding:4px"><span style="color:var(--mt);font-size:12px;font-weight:600">to</span><input type="date" id="rft" style="border:none;background:transparent;padding:4px"></div>`;
  const fils = {
    sales: `${dateInput}<select id="rfpm" class="fi"><option value="">All Methods</option><option>Cash</option><option>Mess Bill</option><option>PAFWA Home Store</option><option>Gift</option><option>Special Case</option></select><select id="rfst" class="fi"><option value="">All Statuses</option><option value="paid">Paid</option><option value="pend">Unpaid</option></select>`,
    inv: `<select id="rfcat" class="fi"><option value="">All Categories</option>${catO}</select><input id="rfloc" placeholder="📍 Location" class="fi" style="width:120px">`,
    low: `<span style="color:var(--mt);font-size:13px;padding:8px">Showing items at or below minimum stock threshold</span>`,
    acct: dateInput
  };
  const el = $('repfil'); if (el) el.innerHTML = fils[t] || '';
  runRep();
}
async function runRep() {
  const out = $('repout'); if (!out) return; ld(out);
  if (_repType === 'sales') {
    let q = sb.from('sales').select('*').order('created_at', { ascending: false });
    const from = $('rff')?.value, to = $('rft')?.value, pm = $('rfpm')?.value, st = $('rfst')?.value;
    if (from) q = q.gte('created_at', from); 
    if (to) q = q.lte('created_at', to + 'T23:59:59'); 
    if (pm) q = q.eq('payment_method', pm);
    if (st === 'paid') q = q.eq('paid', true);
    if (st === 'pend') q = q.eq('paid', false);
    const { data: sales } = await q; const s = sales || []; _repData = s;
    
    // Fetch all sale items for these sales to calculate profit
    const sIds = s.map(x => x.id);
    const { data: si } = sIds.length ? await sb.from('sale_items').select('sale_id,quantity,total,item_id') : { data: [] };
    const { data: items } = await sb.from('items').select('id,cost_price');
    const costMap = {}; (items || []).forEach(i => costMap[i.id] = i.cost_price);
    
    const profitMap = {};
    (si || []).forEach(item => {
      if (!profitMap[item.sale_id]) profitMap[item.sale_id] = 0;
      const itemCost = Number(item.quantity) * Number(costMap[item.item_id] || 0);
      profitMap[item.sale_id] += (Number(item.total) - itemCost);
    });

    const totSub = s.reduce((a, x) => a + Number(x.subtotal), 0);
    const totDisc = s.reduce((a, x) => a + Number(x.discount), 0);
    const totVal = s.reduce((a, x) => a + Number(x.total), 0);
    const totProf = Object.values(profitMap).reduce((a, v) => a + v, 0);

    out.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div style="padding:16px 20px;background:#f8fafc;border-bottom:1px solid var(--br);display:flex;justify-content:space-between;align-items:center"><span class="ct_" style="margin:0">📈 Sales Report</span><div style="text-align:right"><div style="font-size:18px;font-weight:900;color:var(--nv)">${fmtM(totVal)}</div><div style="font-size:11px;color:var(--mt)">${s.length} receipts</div></div></div>
    <div class="tw"><table><thead><tr><th>Receipt#</th><th>Customer</th><th>Subtotal</th><th>Disc</th><th>Total</th><th>Profit</th><th>Method</th><th>Paid</th><th>Date</th></tr></thead>
    <tbody>${s.map(x => `<tr><td><span class="bdg bb">No.${x.receipt_no}</span></td><td><strong>${esc(x.customer_name)}</strong></td><td class="tdm">${fmtM(x.subtotal)}</td><td class="tdm">${fmtM(x.discount)}</td><td><strong style="color:var(--nv)">${fmtM(x.total)}</strong></td><td style="color:var(--gr);font-weight:700">${fmtM(profitMap[x.id] || 0)}</td><td>${pmBadge(x.payment_method || 'Cash')}</td><td>${payBadge(x.paid)}</td><td class="tdm">${fmtDT(x.created_at)}</td></tr>`).join('')}</tbody>
    <tfoot style="background:var(--bg);font-weight:800"><tr><td colspan="2" style="text-align:right">TOTALS</td><td class="tdm">${fmtM(totSub)}</td><td class="tdm">${fmtM(totDisc)}</td><td><strong style="color:var(--nv)">${fmtM(totVal)}</strong></td><td style="color:var(--gr)">${fmtM(totProf)}</td><td colspan="3"></td></tr></tfoot>
    </table></div></div>`;
  } else if (_repType === 'inv') {
    let q = sb.from('items').select('*,categories(name)').eq('archived', false).order('name');
    const cat = $('rfcat')?.value, loc = ($('rfloc')?.value || '').trim();
    if (cat) q = q.eq('category_id', cat);
    if (loc) q = q.ilike('location', `%${loc}%`);
    const { data: items } = await q; _repData = items || [];
    out.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div style="padding:16px 20px;background:#f8fafc;border-bottom:1px solid var(--br);display:flex;justify-content:space-between;align-items:center"><span class="ct_" style="margin:0">📦 Inventory Status</span><span class="bdg bg">${(items || []).length} items</span></div>
    <div class="tw"><table><thead><tr><th>S/N</th><th>Name</th><th>Category</th><th>Location</th><th>Cost</th><th>Sale Price</th><th>Stock</th><th>Min Alert</th></tr></thead>
    <tbody>${(items || []).map(i => `<tr><td><code style="font-size:11px;background:#f1f5f9;padding:3px 5px;border-radius:4px">${esc(i.serial_number || '—')}</code></td><td><strong>${esc(i.name)}</strong></td><td class="tdm">${esc(i.categories?.name || '—')}</td><td class="tdm">${esc(i.location || '—')}</td><td>${fmtM(i.cost_price)}</td><td><strong style="color:var(--nv)">${fmtM(i.sale_price)}</strong></td><td>${stBadge(i.qty, i.min_stock_threshold)}</td><td class="tdm">${i.min_stock_threshold || 5}</td></tr>`).join('')}</tbody></table></div></div>`;
  } else if (_repType === 'low') {
    const { data: items } = await sb.from('items').select('*,categories(name)').eq('archived', false);
    const low = (items || []).filter(i => Number(i.qty) <= Number(i.min_stock_threshold || 5)); _repData = low;
    out.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div style="padding:16px 20px;background:#fef2f2;border-bottom:1px solid #fecaca;display:flex;justify-content:space-between;align-items:center"><span class="ct_" style="margin:0;color:var(--rd)">⚠️ Low Stock Items</span><span class="bdg br_">${low.length} items</span></div>
    <div class="tw"><table><thead><tr><th>S/N</th><th>Name</th><th>Category</th><th>Current Stock</th><th>Min Alert</th></tr></thead>
    <tbody>${low.map(i => `<tr><td><code style="font-size:11px;background:#f1f5f9;padding:3px 5px;border-radius:4px">${esc(i.serial_number || '—')}</code></td><td><strong>${esc(i.name)}</strong></td><td class="tdm">${esc(i.categories?.name || '—')}</td><td>${stBadge(i.qty, i.min_stock_threshold)}</td><td class="tdm">${i.min_stock_threshold || 5}</td></tr>`).join('')}</tbody></table></div></div>`;
  } else {
    let sQ = sb.from('sales').select('total,paid,discount,payment_method');
    let lQ = sb.from('liabilities').select('amount,remarks,created_at');
    const from = $('rff')?.value, to = $('rft')?.value;
    if(from){ sQ=sQ.gte('created_at',from); lQ=lQ.gte('created_at',from); }
    if(to){ sQ=sQ.lte('created_at',to+'T23:59:59'); lQ=lQ.lte('created_at',to+'T23:59:59'); }
    const [sR, lR] = await Promise.all([sQ, lQ]);
    const sales = sR.data || [], liabs = lR.data || []; _repData = sales;
    const byM = {}; sales.forEach(s => { const m = s.payment_method || 'Cash'; if (!byM[m]) byM[m] = { c: 0, t: 0 }; byM[m].c++; byM[m].t += Number(s.total); });
    out.innerHTML = `<div class="stats-grid">
      <div class="stat g"><div class="sl">Gross Revenue</div><div class="sv" style="color:var(--gr)">${fmtM(sales.reduce((a, s) => a + Number(s.total), 0))}</div></div>
      <div class="stat o"><div class="sl">Discounts Given</div><div class="sv" style="color:var(--or)">${fmtM(sales.reduce((a, s) => a + Number(s.discount || 0), 0))}</div></div>
      <div class="stat r"><div class="sl">Liabilities Added</div><div class="sv" style="color:var(--rd)">${fmtM(liabs.reduce((a, l) => a + Number(l.amount), 0))}</div></div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;background:#f8fafc;border-bottom:1px solid var(--br)"><span class="ct_" style="margin:0">Revenue Breakdown</span></div>
      <div class="tw"><table>
      <thead><tr><th>Payment Method</th><th>Transaction Count</th><th>Total Revenue</th></tr></thead>
      <tbody>${Object.entries(byM).map(([m, v]) => `<tr><td>${pmBadge(m)}</td><td class="tdm">${v.c}</td><td><strong style="color:var(--nv)">${fmtM(v.t)}</strong></td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }
}
function expCSV() {
  if (!_repData.length) { toast('No data to export', 'w'); return; }
  let h, rows;
  if (_repType === 'sales') {
    h = ['Receipt No', 'Customer', 'Subtotal', 'Discount', 'Total', 'Method', 'Paid', 'Cashier', 'Date'];
    rows = _repData.map(s => [s.receipt_no, s.customer_name, s.subtotal || 0, s.discount || 0, s.total, s.payment_method || 'Cash', s.paid ? 'Yes' : 'No', s.cashier || '', s.created_at]);
    // Add Totals row
    const totSub = _repData.reduce((a, s) => a + Number(s.subtotal || 0), 0);
    const totDisc = _repData.reduce((a, s) => a + Number(s.discount || 0), 0);
    const totVal = _repData.reduce((a, s) => a + Number(s.total || 0), 0);
    rows.push(['TOTALS', '', totSub, totDisc, totVal, '', '', '', '']);
  }
  else {
    h = ['S/N', 'Name', 'Category', 'Location', 'Cost', 'Sale Price', 'Stock', 'Min'];
    rows = _repData.map(i => [i.serial_number || '', i.name, i.categories?.name || '', i.location || '', i.cost_price || 0, i.sale_price || 0, i.stock_qty || 0, i.min_stock_threshold || 5]);
    // Add Totals row for inventory if relevant (e.g. stock)
    const totStock = _repData.reduce((a, i) => a + Number(i.stock_qty || 0), 0);
    rows.push(['TOTALS', '', '', '', '', '', totStock, '']);
  }
  const csv = [h.join(','), ...rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `PAFWA_${_repType}_${Date.now()}.csv`; a.click(); toast('CSV exported');
}

// ════════════════════════════════════ LOGS
async function loadLogs() {
  $('page-logs').innerHTML = `
  <div class="ph"><div class="pt">Activity Logs</div><button class="btn bs" onclick="loadLogs()">🔄 Refresh</button></div>
  <div class="fb">
    <input class="fi" id="lq" placeholder="🔍 Search username, action, details…" oninput="renderLogs()">
    <div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:4px;border-radius:6px;border:1px solid var(--br)">
      <input type="date" id="lfrom" onchange="renderLogs()" style="border:none;background:transparent;padding:4px">
      <span style="color:var(--mt);font-size:12px;font-weight:600">to</span>
      <input type="date" id="lto" onchange="renderLogs()" style="border:none;background:transparent;padding:4px">
    </div>
  </div>
  <div id="logtbl">⏳ Loading…</div>`;
  window._allLogs = (await sb.from('logs').select('*').order('created_at', { ascending: false }).limit(500)).data || [];
  renderLogs();
}
function renderLogs() {
  const q = ($('lq')?.value || '').toLowerCase(), from = $('lfrom')?.value, to = $('lto')?.value;
  let logs = [...(window._allLogs || [])];
  if (q) logs = logs.filter(l => l.username?.toLowerCase().includes(q) || l.action?.toLowerCase().includes(q) || l.detail?.toLowerCase().includes(q));
  if (from) logs = logs.filter(l => l.created_at >= from);
  if (to) logs = logs.filter(l => l.created_at <= to + 'T23:59:59');
  const el = $('logtbl'); if (!el) return;
  el.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Details</th></tr></thead>
  <tbody>${logs.map(l => `<tr><td class="tdm" style="white-space:nowrap">${fmtDT(l.created_at)}</td><td><strong>${esc(l.username || 'system')}</strong></td><td>${roleBadge(l.role || '')}</td><td><span class="bdg bgr" style="font-family:monospace">${esc(l.action)}</span></td><td class="tdm">${esc(l.detail || '—')}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

// ════════════════════════════════════ USERS
async function loadUsers() {
  $('page-users').innerHTML = `
  <div class="ph"><div class="pt">User Management</div><button class="btn bp" onclick="openAddUserM()">+ Add User</button></div>
  <div class="al ali" style="margin-bottom:16px">ℹ️ Users login with their <strong>username</strong>. The system automatically handles their internal email formatting.</div>
  <div id="usrtbl">⏳ Loading…</div>`;
  await renderUsers();
}
async function renderUsers() {
  const { data: users } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  $('usrtbl').innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
  <tbody>${(users || []).map(u => `<tr>
    <td><strong>${esc(u.username)}</strong></td><td>${esc(u.full_name || '—')}</td>
    <td>${roleBadge(u.role)}</td>
    <td><span class="bdg ${u.active !== false ? 'bg' : 'br_'}">${u.active !== false ? 'Active' : 'Deactivated'}</span></td>
    <td class="tdm">${u.last_login ? fmtDT(u.last_login) : 'Never'}</td>
    <td><div style="display:flex;gap:6px">
      <button class="btn bs bsm" onclick="openEditUserM('${u.id}')">Edit</button>
      ${u.username !== 'admin' ? `<button class="btn ${u.active !== false ? 'bd' : 'bg_'} bsm" onclick="toggleUser('${u.id}',${!!u.active})">${u.active !== false ? 'Deactivate' : 'Activate'}</button>` : ''}
    </div></td>
  </tr>`).join('')}
  </tbody></table></div></div>`;
}
function openAddUserM() {
  openM(`<h2>➕ Add User</h2>
  <div id="ue" class="al ale" style="display:none"></div>
  <div class="r2">
    <div class="fg"><label>Username *</label><input id="uu" placeholder="e.g. zara_staff" autocomplete="off"></div>
    <div class="fg"><label>Full Name</label><input id="ufn" placeholder="Full name" autocomplete="off"></div>
  </div>
  <div class="r2">
    <div class="fg"><label>Password * (min 6 chars)</label><input type="password" id="upw"></div>
    <div class="fg"><label>Role</label><select id="ur"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>
  </div>
  <div class="al alw">After creating, the user can log in immediately with their username and password.</div>
  <div class="mf"><button class="btn bp" onclick="submitAddUser()">Create User</button><button class="btn bs" onclick="closeM()">Cancel</button></div>`, '480px');
}
async function submitAddUser() {
  const u = $('uu').value.trim(), pw = $('upw').value, fn = $('ufn').value.trim(), role = $('ur').value;
  const err = $('ue');
  if (!u || !pw) { err.textContent = 'Username and password required'; err.style.display = 'block'; return; }
  if (pw.length < 6) { err.textContent = 'Min 6 characters'; err.style.display = 'block'; return; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    const accTok = session?.access_token, refTok = session?.refresh_token;

    const { data, error } = await sb.auth.signUp({
      email: `${u}@pafwa.local`, password: pw,
      options: { data: { username: u, full_name: fn || u, role } }
    });
    if (error) throw error;

    if (accTok && refTok) await sb.auth.setSession({ access_token: accTok, refresh_token: refTok });

    addLog('ADD_USER', `Created: ${u} (${role})`);
    toast('User created!'); closeM(); renderUsers();
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}
async function openEditUserM(id) {
  const { data: u } = await sb.from('profiles').select('*').eq('id', id).single();
  openM(`<h2>✏️ Edit User: ${esc(u.username)}</h2>
  <div class="fg"><label>Full Name</label><input id="efn" value="${esc(u.full_name || '')}"></div>
  <div class="fg"><label>Role</label><select id="er" ${u.username === 'admin' ? 'disabled' : ''}><option value="staff"${u.role === 'staff' ? ' selected' : ''}>Staff</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>Admin</option></select></div>
  <div class="mf"><button class="btn bp" onclick="submitEditUser('${id}')">Save Changes</button><button class="btn bs" onclick="closeM()">Cancel</button></div>`, '420px');
}
async function submitEditUser(id) { await sb.from('profiles').update({ full_name: $('efn').value.trim(), role: $('er').value }).eq('id', id); addLog('UPDATE_USER', `id:${id}`); toast('Updated'); closeM(); renderUsers(); }
async function toggleUser(id, isActive) { if (!confirm(isActive ? 'Deactivate this user?' : 'Activate this user?')) return; await sb.from('profiles').update({ active: !isActive }).eq('id', id); addLog(isActive ? 'DEACTIVATE' : 'ACTIVATE', `id:${id}`); toast(isActive ? 'Deactivated' : 'Activated'); renderUsers(); }

// ════════════════════════════════════ BACKUP
async function loadBkp() {
  const { data: sets } = await sb.from('settings').select('*');
  const cfg = {}; (sets || []).forEach(r => cfg[r.key] = r.value);
  $('page-bkp').innerHTML = `
  <div class="ph"><div class="pt">System Backup</div></div>
  <div class="g2">
    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="ct_">📦 Download Full Backup</div>
        <p style="color:var(--mt);font-size:13px;margin-bottom:14px;line-height:1.5">Downloads a complete JSON file containing all data (inventory, sales, settings, users).<br>Last automated backup: <strong style="color:var(--nv)">${cfg.last_backup ? fmtDT(cfg.last_backup) : 'Never'}</strong></p>
        <button class="btn bp bfl" onclick="doBackup()" style="font-size:14px">⬇️ Download Backup File</button>
        <div class="al ali" style="font-size:12px;margin-top:14px;margin-bottom:0">Automated backup reminder triggers daily at 12:00 noon.</div>
      </div>
      <div class="card">
        <div class="ct_">🔄 Restore from Backup</div>
        <div class="al alw" style="font-size:12px">⚠️ Restoring will add data to existing records, not replace them entirely. Proceed with caution.</div>
        <div class="fg" style="margin-top:10px"><label>Select Backup File (.json)</label><input type="file" id="bkf" accept=".json" style="padding:8px;font-size:13px;background:#f8fafc"></div>
        <button class="btn bo_ bfl" onclick="doRestore()">🔄 Import & Restore</button>
      </div>
    </div>
    <div class="card" style="align-self:start">
      <div class="ct_">ℹ️ System Information</div>
      <div style="font-size:13px;line-height:2.6">
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Version</strong> <span>3.0 (Responsive)</span></div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Database</strong> <span>Supabase PostgreSQL</span></div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Storage</strong> <span>Supabase Object Storage</span></div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Authentication</strong> <span>Supabase Auth</span></div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Active User</strong> <span>${CU?.fullName || CU?.username} (${CU?.role})</span></div>
        <div style="display:flex;justify-content:space-between"><strong>Project URL</strong> <span style="font-size:11px;color:var(--mt);max-width:150px;overflow:hidden;text-overflow:ellipsis">${getCfg().url || '—'}</span></div>
      </div>
    </div>
  </div>`;
}
async function doBackup() {
  try {
    toast('Preparing backup…', 'i');
    const [iR, sR, siR, cR, lR, libR, prR] = await Promise.all([
      sb.from('items').select('*'), sb.from('sales').select('*'),
      sb.from('sale_items').select('*'), sb.from('categories').select('*'),
      sb.from('logs').select('*').limit(1000), sb.from('liabilities').select('*'),
      sb.from('profiles').select('id,username,full_name,role,active,created_at')
    ]);
    const bkp = {
      version: '3.0-supabase', exportedAt: new Date().toISOString(), exportedBy: CU?.username,
      items: iR.data || [], sales: sR.data || [], sale_items: siR.data || [], categories: cR.data || [],
      logs: lR.data || [], liabilities: libR.data || [], profiles: prR.data || []
    };
    const d = new Date(), fn = `PAFWA_Backup_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(bkp, null, 2)); a.download = fn; a.click();
    await sb.from('settings').upsert({ key: 'last_backup', value: new Date().toISOString() });
    addLog('BACKUP', fn); toast('Backup downloaded!'); loadBkp();
  } catch (e) { toast('Failed: ' + e.message, 'e'); }
}
async function doRestore() {
  const f = $('bkf')?.files[0]; if (!f) { toast('Select a file', 'e'); return; }
  if (!confirm('Restore? This imports all data from the backup file.')) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!d.version) throw new Error('Invalid backup file');
      toast('Restoring data…', 'i');
      if (d.categories?.length) await sb.from('categories').upsert(d.categories.map(({ id, ...rest }) => ({ id, ...rest })));
      if (d.items?.length) await sb.from('items').upsert(d.items.map(i => ({ ...i })));
      if (d.sales?.length) await sb.from('sales').upsert(d.sales.map(s => ({ ...s })));
      if (d.sale_items?.length) await sb.from('sale_items').upsert(d.sale_items.map(si => ({ ...si })));
      if (d.liabilities?.length) await sb.from('liabilities').upsert(d.liabilities.map(l => ({ ...l })));
      addLog('RESTORE', f.name); toast('Data restored successfully!'); loadBkp();
    } catch (err) { toast('Restore failed: ' + err.message, 'e'); }
  }; r.readAsText(f);
}

// ════════════════════════════════════ SETTINGS
async function loadCfg() {
  const { data: sets } = await sb.from('settings').select('*');
  const cfg = {}; (sets || []).forEach(r => cfg[r.key] = r.value);
  $('page-cfg').innerHTML = `
  <div class="ph"><div class="pt">Settings</div></div>
  <div class="g2">
    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="ct_">🏛 Organisation Details</div>
        <div id="smsg" class="al" style="display:none"></div>
        <div class="fg"><label>Organisation Name</label><input id="sorg" value="${esc(cfg.org_name || 'PAFWA APF')}"></div>
        <div class="fg"><label>Location / Unit</label><input id="sloc" value="${esc(cfg.location || 'PAC KAMRA')}"></div>
        <div class="fg"><label>Receipt Footer Text</label><input id="sfoot" value="${esc(cfg.receipt_footer || 'Received with Thanks')}"></div>
        <div class="r2">
          <div class="fg"><label>Next Receipt No.</label><input id="srno" type="number" min="1" value="${cfg.next_receipt_no || 1}"></div>
          <div class="fg"><label>Low Stock Threshold</label><input id="slow" type="number" min="1" value="${cfg.low_stock_thresh || 5}"></div>
        </div>
        <button class="btn bp bfl" onclick="saveSettings()">💾 Save Settings</button>
      </div>
      <div class="card">
        <div class="ct_">🔑 Change My Password</div>
        <div id="pwmsg" class="al" style="display:none"></div>
        <div class="fg"><label>New Password</label><input type="password" id="pwn"></div>
        <div class="fg"><label>Confirm Password</label><input type="password" id="pwc"></div>
        <button class="btn bs bfl" onclick="changeMyPw()">Update Password</button>
      </div>
    </div>
    <div class="card" style="align-self:start">
      <div class="ct_">🔧 Supabase Configuration</div>
      <div class="al ali" style="margin-bottom:14px;font-size:12px">Update if you need to switch the linked Supabase cloud project.</div>
      <div class="fg"><label>Project URL</label><input id="scfgu" value="${esc(getCfg().url || '')}" autocomplete="off"></div>
      <div class="fg"><label>Anon Key</label><textarea id="scfgk" rows="4">${esc(getCfg().key || '')}</textarea></div>
      <button class="btn bo_ bfl" onclick="updateSbCfg()">💾 Update &amp; Reload</button>
    </div>
  </div>`;
}

async function saveSettings() {
  const entries = [['org_name', $('sorg').value.trim() || 'PAFWA APF'], ['location', $('sloc').value.trim() || 'PAC KAMRA'], ['receipt_footer', $('sfoot').value.trim()], ['next_receipt_no', $('srno').value || '1'], ['low_stock_thresh', $('slow').value || '5']];
  await sb.from('settings').upsert(entries.map(([key, value]) => ({ key, value })));
  addLog('SAVE_SETTINGS', 'Settings updated'); const m = $('smsg'); if (m) { m.className = 'al als'; m.textContent = '✅ Settings saved successfully!'; m.style.display = 'block'; setTimeout(() => m.style.display = 'none', 2500); } toast('Settings saved');
}
async function changeMyPw() {
  const n = $('pwn').value, c = $('pwc').value, msg = $('pwmsg');
  if (!n) { msg.className = 'al ale'; msg.textContent = 'Enter new password'; msg.style.display = 'block'; return; }
  if (n.length < 6) { msg.className = 'al ale'; msg.textContent = 'Minimum 6 characters'; msg.style.display = 'block'; return; }
  if (n !== c) { msg.className = 'al ale'; msg.textContent = 'Passwords do not match'; msg.style.display = 'block'; return; }
  const { error } = await sb.auth.updateUser({ password: n });
  if (error) { msg.className = 'al ale'; msg.textContent = error.message; msg.style.display = 'block'; return; }
  addLog('CHANGE_PASSWORD', 'Password changed'); msg.className = 'al als'; msg.textContent = '✅ Password updated!'; msg.style.display = 'block'; $('pwn').value = ''; $('pwc').value = ''; setTimeout(() => msg.style.display = 'none', 2500);
}
function updateSbCfg() { localStorage.setItem(LS_URL, $('scfgu').value.trim()); localStorage.setItem(LS_KEY, $('scfgk').value.trim()); toast('Config saved — reloading…', 'i'); setTimeout(() => location.reload(), 1000); }

// ════════════════════════════════════ CLOCK + AUTO BACKUP
function tick() {
  const n = new Date(); const t = n.toLocaleTimeString('en-PK'); const d = n.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  const cl = $('lclock'); if (cl) cl.textContent = `${d} · ${t}`;
  const st = $('sbtm'); if (st) st.textContent = t;
  const tt = $('top-time'); if (tt) tt.textContent = `${d} ${t}`;
}
setInterval(tick, 1000); tick();

setInterval(async () => {
  const n = new Date();
  if (n.getHours() === 12 && n.getMinutes() === 0 && sb && CU) {
    const { data: s } = await sb.from('settings').select('value').eq('key', 'last_backup').single();
    const today = new Date().toISOString().slice(0, 10);
    if (!s?.value || !s.value.startsWith(today)) { doBackup(); toast('🕐 Daily noon auto-backup running!', 'i'); }
  }
}, 30000);

// ════════════════════════════════════ BOOT
async function boot() {
  const lm = $('LOAD-MSG'); if (lm) lm.textContent = 'Connecting to Supabase…';
  if (!hasCfg()) { $('LOAD').style.display = 'none'; showCfg(); return; }
  const { url, key } = getCfg();
  if (!initSB(url, key)) { $('LOAD').style.display = 'none'; showCfg(); return; }
  try {
    const { data, error } = await sb.from('profiles').select('id').limit(1);
    if (error && error.code === '42501') {
      $('LOAD').style.display = 'none'; setupAuth(); return;
    }
    
    if (!data || data.length === 0) {
      $('LOAD').style.display = 'none';
      $('ADMIN-SCREEN').style.display = 'flex';
      setupAuth(); return;
    }
    setupAuth();
  } catch (e) {
    $('LOAD').style.display = 'none';
    const err = $('cfg-err');
    if (err) err.textContent = 'Connection failed: ' + e.message;
    showCfg();
  }
}

// Initial Boot
document.addEventListener('DOMContentLoaded', boot);
