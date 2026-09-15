/* ═══════════════════════════════════════════════════════
   UniCampus Admin Portal — app.js
   All frontend logic, API calls, page rendering
═══════════════════════════════════════════════════════ */

const API = '/api/admin';
let authToken = localStorage.getItem('admin_token') || null;
let currentPage = 'overview';
let charts = {};

// ─── UTILS ─────────────────────────────────────────────────────
const fmt = n => '₹ ' + Number(n).toLocaleString('en-IN', {maximumFractionDigits:0});
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtNum = n => Number(n).toLocaleString('en-IN');

function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' '+type : '');
  setTimeout(() => { t.classList.remove('show'); }, 3000);
}

function apiFetch(url, opts={}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  return fetch(url, { ...opts, headers: {...headers,...(opts.headers||{})} })
    .then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');
      return data;
    });
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

// ─── AUTH ───────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  err.classList.remove('show');
  if (!email || !password) { err.textContent='Enter credentials'; err.classList.add('show'); return; }
  btn.textContent = 'Signing in…'; btn.disabled = true;
  try {
    const data = await apiFetch(`${API}/login`, {
      method:'POST', body: JSON.stringify({ email, password })
    });
    authToken = data.token;
    localStorage.setItem('admin_token', authToken);
    initApp(data.email);
  } catch(e) {
    err.textContent = e.message; err.classList.add('show');
  } finally { btn.textContent='Sign In'; btn.disabled=false; }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') doLogin();
});

async function doLogout() {
  try { await apiFetch(`${API}/logout`, { method:'POST' }); } catch {}
  authToken = null; localStorage.removeItem('admin_token');
  document.getElementById('app').classList.remove('active');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

// ─── PROFILE MODAL ──────────────────────────────────────────────
function openProfileModal() {
  document.getElementById('profile-modal').classList.add('open');
  document.getElementById('admin-dropdown').classList.remove('open');
  document.getElementById('profile-error').classList.remove('show');
  ['p-current','p-email','p-new'].forEach(id => document.getElementById(id).value='');
}
function closeProfileModal() { document.getElementById('profile-modal').classList.remove('open'); }
async function saveProfile() {
  const cur = document.getElementById('p-current').value;
  const email = document.getElementById('p-email').value.trim();
  const np = document.getElementById('p-new').value;
  const errEl = document.getElementById('profile-error');
  if (!cur) { errEl.textContent='Current password required'; errEl.classList.add('show'); return; }
  if (!email && !np) { errEl.textContent='Enter new email or new password'; errEl.classList.add('show'); return; }
  try {
    const data = await apiFetch(`${API}/profile`, { method:'PUT', body: JSON.stringify({ email:email||undefined, current_password:cur, new_password:np||undefined }) });
    authToken = data.token; localStorage.setItem('admin_token', authToken);
    updateAdminDisplay(data.email);
    closeProfileModal(); showToast('Profile updated', 'success');
  } catch(e) { errEl.textContent = e.message; errEl.classList.add('show'); }
}

function toggleProfileDropdown() {
  document.getElementById('admin-dropdown').classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!document.getElementById('admin-profile-btn').contains(e.target))
    document.getElementById('admin-dropdown').classList.remove('open');
});

function updateAdminDisplay(email) {
  document.getElementById('admin-email-display').textContent = email;
  document.getElementById('dropdown-email').textContent = email;
  document.getElementById('admin-avatar').textContent = email.charAt(0).toUpperCase();
}

// ─── INIT APP ───────────────────────────────────────────────────
async function initApp(email) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('app').classList.add('active');
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  updateAdminDisplay(email || 'Admin');
  navigate('overview');
}

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page-content').forEach(el => el.classList.toggle('active', el.id === 'page-'+page));
  const titles = { overview:'Overview', orders:'Orders', revenue:'Revenue', profit:'Profit', discount:'Discount Codes', variants:'Product Variants', support:'Customer Support' };
  const subs   = { overview:'Welcome back, Admin! Here\'s what\'s happening.', orders:'Manage and track all orders', revenue:'Revenue analytics and trends', profit:'Profit breakdown and analysis', discount:'Manage discount codes', variants:'Add page-count / size / type variants for products', support:'Customer requests and messages' };
  document.getElementById('page-title').textContent = titles[page];
  document.getElementById('page-sub').textContent = subs[page];
  const renderers = { overview:renderOverview, orders:renderOrders, revenue:renderRevenue, profit:renderProfit, discount:renderDiscount, variants:renderVariants, support:renderSupport };
  if (renderers[page]) renderers[page]();
}

// ─── STATUS BADGE ───────────────────────────────────────────────
function statusBadge(s) {
  const map = { Completed:'completed', Processing:'processing', Pending:'pending', Cancelled:'cancelled', Open:'open', 'In Progress':'in-progress', Resolved:'resolved' };
  return `<span class="badge badge-${map[s]||'pending'}">${s}</span>`;
}

// ─── PAGE: OVERVIEW ─────────────────────────────────────────────
async function renderOverview() {
  const el = document.getElementById('page-overview');
  el.innerHTML = `<div class="empty-state"><div class="icon">⏳</div><p>Loading overview…</p></div>`;
  try {
    const d = await apiFetch(`${API}/overview`);
    el.innerHTML = `
      <div class="stats-grid">
        ${statCard('💰','Total Revenue',fmt(d.totalRevenue),'--blue','up','Live')}
        ${statCard('📈','Total Profit',fmt(d.totalProfit),'--green','up','Live')}
        ${statCard('🛍️','Total Orders',fmtNum(d.totalOrders),'--purple','up','Live')}
        ${statCard('✅','Orders Done',fmtNum(d.ordersDone),'--blue','up','')}
        ${statCard('⏳','Orders Pending',fmtNum(d.ordersPending),'--orange','neutral','')}
        ${statCard('🔄','Repeated Clients',fmtNum(d.repeatedClients),'--purple','neutral','')}
        ${statCard('🎁','Discounts Given',fmt(d.discountsUsed),'--yellow','neutral','')}
        ${statCard('❌','Cancelled',fmtNum(d.ordersCancelled),'--red','neutral','')}
      </div>

      <div class="panels-row" style="grid-template-columns:2fr 1fr">
        <div class="panel">
          <div class="panel-head">
            <span class="panel-title">Revenue Overview</span>
            <select class="filter-select" id="ov-period" onchange="updateOverviewChart()" style="padding:5px 10px;font-size:12px;">
              <option value="daily">Daily (30d)</option>
              <option value="monthly" selected>Monthly</option>
            </select>
          </div>
          <div class="panel-body">
            <div style="font-size:12px;color:var(--text-3);margin-bottom:4px;">Total Revenue</div>
            <div style="font-size:26px;font-weight:800;letter-spacing:-.8px;margin-bottom:16px;">${fmt(d.totalRevenue)}</div>
            <div class="chart-wrap"><canvas id="ov-chart"></canvas></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><span class="panel-title">Order Status</span></div>
          <div class="panel-body">
            <div style="display:flex;flex-direction:column;align-items:center;gap:20px;">
              <div class="donut-wrap"><canvas id="donut-chart"></canvas></div>
              <div class="status-legend">
                ${legendRow('#22c55e','Completed',d.ordersDone,d.totalOrders)}
                ${legendRow('#4f7cf6','Processing',d.ordersProcessing,d.totalOrders)}
                ${legendRow('#f97316','Pending',d.ordersPending,d.totalOrders)}
                ${legendRow('#ef4444','Cancelled',d.ordersCancelled,d.totalOrders)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Recent Orders</span>
          <a onclick="navigate('orders')" style="font-size:13px;color:var(--blue);cursor:pointer;font-weight:600;">View All Orders →</a>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ORDER ID</th><th>CUSTOMER</th><th>AMOUNT</th><th>STATUS</th><th>DATE</th></tr></thead>
            <tbody>
              ${d.recentOrders.map(o=>`<tr>
                <td><span style="font-family:monospace;font-weight:600;font-size:12px;">#${o.id}</span></td>
                <td>${o.customer_name}</td>
                <td style="font-weight:700;">${fmt(o.amount)}</td>
                <td>${statusBadge(o.status)}</td>
                <td style="color:var(--text-3);">${fmtDate(o.created_at)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Store data for chart re-render
    window._ovData = d;

    // Revenue chart
    buildOvChart(d.monthlyRevenue, 'monthly');

    // Donut chart
    destroyChart('donut');
    const ctx2 = document.getElementById('donut-chart').getContext('2d');
    charts['donut'] = new Chart(ctx2, {
      type:'doughnut',
      data:{ labels:['Completed','Processing','Pending','Cancelled'],
             datasets:[{data:[d.ordersDone,d.ordersProcessing,d.ordersPending,d.ordersCancelled],
                        backgroundColor:['#22c55e','#4f7cf6','#f97316','#ef4444'],
                        borderWidth:0,hoverOffset:6}]},
      options:{ cutout:'72%', plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.label}: ${c.parsed}`}} }, animation:{animateRotate:true} }
    });
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Failed to load</h3><p>${e.message}</p></div>`;
  }
}

function statCard(icon, label, value, colorVar, trend, extra) {
  const bg = { '--blue':'#eef2ff','--green':'#dcfce7','--purple':'#faf5ff','--orange':'#fff7ed','--yellow':'#fefce8','--red':'#fef2f2' };
  const bgc = bg[colorVar] || '#f3f4f6';
  const col = `var(${colorVar})`;
  return `<div class="stat-card">
    <div class="stat-card-header">
      <div>
        <div class="stat-label">${label.toUpperCase()}</div>
        <div class="stat-value">${value}</div>
        ${extra ? `<span class="stat-badge ${trend}">${extra==='Live'?'↑ Live':extra}</span>` : ''}
      </div>
      <div class="stat-icon" style="background:${bgc};"><span style="color:${col};font-size:20px;">${icon}</span></div>
    </div>
  </div>`;
}

function legendRow(color, label, count, total) {
  const pct = total ? Math.round(count/total*100) : 0;
  return `<div class="legend-row"><div><span class="legend-dot" style="background:${color}"></span>${label}</div><div><strong>${count}</strong> <span class="legend-pct">(${pct}%)</span></div></div>`;
}

function buildOvChart(data, period) {
  destroyChart('ov');
  const ctx = document.getElementById('ov-chart');
  if (!ctx) return;
  charts['ov'] = new Chart(ctx.getContext('2d'), {
    type:'line',
    data:{
      labels: data.map(r=>r.label||r.month||r.day),
      datasets:[{
        label:'Revenue',
        data: data.map(r=>r.revenue),
        borderColor:'#4f7cf6', backgroundColor:'rgba(79,124,246,.08)',
        borderWidth:2.5, pointRadius:3, pointBackgroundColor:'#4f7cf6',
        fill:true, tension:.35
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>'  '+fmt(c.parsed.y)}} },
      scales:{
        x:{ grid:{display:false}, ticks:{font:{size:11},color:'#9ca3af'} },
        y:{ grid:{color:'#f3f4f6'}, ticks:{font:{size:11},color:'#9ca3af', callback:v=>'₹'+Math.round(v/1000)+'K'} }
      }
    }
  });
}

async function updateOverviewChart() {
  const period = document.getElementById('ov-period').value;
  const d = window._ovData;
  if (!d) return;
  if (period === 'daily') buildOvChart(d.dailyRevenue, 'daily');
  else buildOvChart(d.monthlyRevenue, 'monthly');
}

// ─── PAGE: ORDERS ───────────────────────────────────────────────
let ordersState = { page:1, search:'', status:'', from:'', to:'' };

async function renderOrders() {
  const el = document.getElementById('page-orders');
  el.innerHTML = `
    <div class="section-header">
      <h2>All Orders</h2>
      <button class="btn btn-blue" onclick="openOrderModal()">+ New Order</button>
    </div>
    <div class="panel">
      <div class="panel-body" style="padding-bottom:0;">
        <div class="toolbar">
          <div class="search-input">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search by name, email, order ID…" id="ord-search" oninput="debouncedOrderSearch()" value="${ordersState.search}">
          </div>
          <select class="filter-select" id="ord-status" onchange="ordersState.status=this.value;ordersState.page=1;loadOrders()">
            <option value="">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="Processing">Processing</option>
            <option value="Pending">Pending</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <input type="date" class="date-input" id="ord-from" onchange="ordersState.from=this.value;ordersState.page=1;loadOrders()" title="From date">
          <input type="date" class="date-input" id="ord-to" onchange="ordersState.to=this.value;ordersState.page=1;loadOrders()" title="To date">
          <button class="btn btn-outline" onclick="resetOrderFilters()">Reset</button>
        </div>
      </div>
      <div id="orders-table-wrap" class="table-wrap">
        <table>
          <thead><tr><th>ORDER ID</th><th>CUSTOMER</th><th>AMOUNT</th><th>STATUS</th><th>DATE</th><th>ACTIONS</th></tr></thead>
          <tbody id="orders-tbody"><tr class="loading-row"><td colspan="6">Loading orders…</td></tr></tbody>
        </table>
      </div>
      <div class="panel-body" style="padding-top:0;" id="orders-pagination"></div>
    </div>
    ${ordersModal()}
    ${orderViewModal()}
  `;
  document.getElementById('ord-status').value = ordersState.status;
  document.getElementById('ord-from').value = ordersState.from;
  document.getElementById('ord-to').value = ordersState.to;
  loadOrders();
}

const debouncedOrderSearch = debounce(() => {
  ordersState.search = document.getElementById('ord-search')?.value || '';
  ordersState.page = 1;
  loadOrders();
}, 350);

function resetOrderFilters() {
  ordersState = { page:1, search:'', status:'', from:'', to:'' };
  renderOrders();
}

async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr class="loading-row"><td colspan="6">Loading…</td></tr>`;
  const { page, search, status, from, to } = ordersState;
  const q = new URLSearchParams({ page, limit:15, ...(search&&{search}), ...(status&&{status}), ...(from&&{from}), ...(to&&{to}) });
  try {
    const { orders, total, limit } = await apiFetch(`${API}/orders?${q}`);
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">📦</div><h3>No orders found</h3><p>Try adjusting your filters</p></div></td></tr>`;
      document.getElementById('orders-pagination').innerHTML=''; return;
    }
    tbody.innerHTML = orders.map(o=>`<tr>
      <td><span style="font-family:monospace;font-weight:600;font-size:12px;color:var(--blue);">#${o.id}</span></td>
      <td>
        <div style="font-weight:600;font-size:13px;">${o.customer_name}</div>
        <div style="font-size:11.5px;color:var(--text-3);">${o.customer_email}</div>
      </td>
      <td style="font-weight:700;">${fmt(o.amount)}</td>
      <td>
        <select onchange="updateOrderStatus('${o.id}',this.value)" style="border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;" class="badge-sel">
          ${['Pending','Processing','Completed','Cancelled'].map(s=>`<option${s===o.status?' selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="color:var(--text-3);font-size:12px;">${fmtDate(o.created_at)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <span class="icon-action" title="View" onclick="viewOrder('${o.id}')">👁️</span>
          <span class="icon-action del" title="Delete" onclick="deleteOrder('${o.id}')">🗑️</span>
        </div>
      </td>
    </tr>`).join('');
    // Pagination
    const pages = Math.ceil(total / limit);
    const pg = document.getElementById('orders-pagination');
    if (pages > 1) {
      pg.innerHTML = `<div class="pagination">
        <span class="pagination-info">Showing ${(page-1)*limit+1}–${Math.min(page*limit,total)} of ${total} orders</span>
        <div class="pagination-btns">
          <button class="page-btn" onclick="ordersState.page=${page-1};loadOrders()" ${page<=1?'disabled':''}>‹ Prev</button>
          ${Array.from({length:Math.min(pages,5)},(_,i)=>{const p=i+1;return`<button class="page-btn${p===page?' active':''}" onclick="ordersState.page=${p};loadOrders()">${p}</button>`;}).join('')}
          <button class="page-btn" onclick="ordersState.page=${page+1};loadOrders()" ${page>=pages?'disabled':''}>Next ›</button>
        </div>
      </div>`;
    } else pg.innerHTML='';
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">⚠️</div><h3>Failed to load orders</h3><p>${e.message}</p></div></td></tr>`;
  }
}

async function updateOrderStatus(id, status) {
  try {
    await apiFetch(`${API}/orders/${id}`, { method:'PUT', body: JSON.stringify({ status }) });
    showToast('Status updated', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function deleteOrder(id) {
  if (!confirm(`Delete order #${id}? This cannot be undone.`)) return;
  try {
    await apiFetch(`${API}/orders/${id}`, { method:'DELETE' });
    showToast('Order deleted', 'success'); loadOrders();
  } catch(e) { showToast(e.message, 'error'); }
}

async function viewOrder(id) {
  const m = document.getElementById('order-view-modal');
  const body = document.getElementById('order-view-body');
  m.classList.add('open');
  body.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:30px;">Loading…</p>';
  try {
    const o = await apiFetch(`${API}/orders/${id}`);
    let items = [];
    try { items = JSON.parse(o.items); } catch {}
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div><div class="form-label">Order ID</div><div style="font-weight:700;font-family:monospace;">#${o.id}</div></div>
        <div><div class="form-label">Status</div>${statusBadge(o.status)}</div>
        <div><div class="form-label">Customer</div><div style="font-weight:600;">${o.customer_name}</div></div>
        <div><div class="form-label">Email</div><div>${o.customer_email}</div></div>
        <div><div class="form-label">Phone</div><div>${o.customer_phone||'—'}</div></div>
        <div><div class="form-label">Date</div><div>${fmtDate(o.created_at)}</div></div>
        <div><div class="form-label">Amount</div><div style="font-size:18px;font-weight:800;">${fmt(o.amount)}</div></div>
        <div><div class="form-label">Discount</div><div>${o.discount_code ? `${o.discount_code} (${fmt(o.discount_amount)})` : '—'}</div></div>
      </div>
      ${items.length ? `
      <div style="margin-top:18px;">
        <div class="form-label">Items</div>
        <div class="table-wrap" style="margin-top:8px;">
          <table>
            <thead><tr><th>ITEM</th><th>QTY</th><th>PRICE</th></tr></thead>
            <tbody>${items.map(i=>`<tr><td>${i.name}</td><td>${i.qty||1}</td><td>${fmt(i.price)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  } catch(e) { body.innerHTML = `<p style="color:var(--red);">${e.message}</p>`; }
}

function ordersModal() {
  return `<div class="modal-overlay" id="order-modal">
    <div class="modal">
      <div class="modal-head"><h2 id="order-modal-title">New Order</h2><div class="modal-close" onclick="closeOrderModal()">✕</div></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Customer Name *</label><input type="text" id="om-name" class="form-control" placeholder="Full name"></div>
          <div class="form-group"><label class="form-label">Email *</label><input type="email" id="om-email" class="form-control" placeholder="email@example.com"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Phone</label><input type="tel" id="om-phone" class="form-control" placeholder="9876543210"></div>
          <div class="form-group"><label class="form-label">Amount (₹) *</label><input type="number" id="om-amount" class="form-control" placeholder="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Cost (₹)</label><input type="number" id="om-cost" class="form-control" placeholder="0"></div>
          <div class="form-group"><label class="form-label">Status</label>
            <select id="om-status" class="form-control">
              <option>Pending</option><option>Processing</option><option>Completed</option><option>Cancelled</option>
            </select>
          </div>
        </div>
        <div class="form-row col-1">
          <div class="form-group"><label class="form-label">Items (JSON or description)</label><textarea id="om-items" class="form-control" rows="3" placeholder='[{"name":"Notebook","qty":1,"price":110}]'></textarea></div>
        </div>
        <div class="form-error" id="order-form-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeOrderModal()">Cancel</button>
        <button class="btn btn-blue" onclick="saveOrder()">Save Order</button>
      </div>
    </div>
  </div>`;
}

function orderViewModal() {
  return `<div class="modal-overlay" id="order-view-modal">
    <div class="modal modal-lg">
      <div class="modal-head"><h2>Order Details</h2><div class="modal-close" onclick="document.getElementById('order-view-modal').classList.remove('open')">✕</div></div>
      <div class="modal-body" id="order-view-body"></div>
    </div>
  </div>`;
}

function openOrderModal() { document.getElementById('order-modal').classList.add('open'); }
function closeOrderModal() { document.getElementById('order-modal').classList.remove('open'); }

async function saveOrder() {
  const errEl = document.getElementById('order-form-err');
  const name = document.getElementById('om-name').value.trim();
  const email = document.getElementById('om-email').value.trim();
  const amount = parseFloat(document.getElementById('om-amount').value);
  const cost = parseFloat(document.getElementById('om-cost').value)||0;
  const status = document.getElementById('om-status').value;
  const phone = document.getElementById('om-phone').value.trim();
  let items = document.getElementById('om-items').value.trim();
  if (!name || !email || !amount) { errEl.textContent='Name, email, and amount are required'; errEl.classList.add('show'); return; }
  if (!items) items = '[]';
  try { JSON.parse(items); } catch { items = JSON.stringify([{name:items,qty:1,price:amount}]); }
  try {
    await apiFetch(`${API}/orders`, { method:'POST', body: JSON.stringify({ customer_name:name, customer_email:email, customer_phone:phone, items, amount, cost, status }) });
    closeOrderModal(); showToast('Order created', 'success'); loadOrders();
  } catch(e) { errEl.textContent=e.message; errEl.classList.add('show'); }
}

// ─── PAGE: REVENUE ──────────────────────────────────────────────
let revState = { period:'monthly', from:'', to:'' };

async function renderRevenue() {
  const el = document.getElementById('page-revenue');
  el.innerHTML = `
    <div class="section-header"><h2>Revenue Analytics</h2></div>
    <div class="toolbar">
      <div class="period-tabs" id="rev-tabs">
        <div class="period-tab active" onclick="setRevPeriod('daily',this)">Daily</div>
        <div class="period-tab" onclick="setRevPeriod('monthly',this)">Monthly</div>
        <div class="period-tab" onclick="setRevPeriod('yearly',this)">Yearly</div>
      </div>
      <input type="date" class="date-input" id="rev-from" onchange="revState.from=this.value;loadRevenue()">
      <input type="date" class="date-input" id="rev-to" onchange="revState.to=this.value;loadRevenue()">
      <button class="btn btn-outline" onclick="revState.from='';revState.to='';document.getElementById('rev-from').value='';document.getElementById('rev-to').value='';loadRevenue()">Reset</button>
    </div>
    <div class="stats-grid" id="rev-stats"></div>
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Revenue Trend</span></div>
      <div class="panel-body"><div class="chart-wrap" style="height:280px;"><canvas id="rev-chart"></canvas></div></div>
    </div>
  `;
  loadRevenue();
}

function setRevPeriod(p, el) {
  revState.period = p;
  document.querySelectorAll('#rev-tabs .period-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  loadRevenue();
}

async function loadRevenue() {
  const q = new URLSearchParams({ period:revState.period, ...(revState.from&&{from:revState.from}), ...(revState.to&&{to:revState.to}) });
  try {
    const d = await apiFetch(`${API}/revenue?${q}`);
    document.getElementById('rev-stats').innerHTML = `
      ${statCard('💰','Total Revenue',fmt(d.total),'--blue','up','')}
      ${statCard('🛍️','Total Orders',fmtNum(d.orderCount),'--purple','up','')}
      ${statCard('📊','Avg. Order Value',fmt(d.avgOrder),'--green','up','')}
    `;
    destroyChart('rev');
    const ctx = document.getElementById('rev-chart');
    if (!ctx) return;
    charts['rev'] = new Chart(ctx.getContext('2d'), {
      type:'bar',
      data:{
        labels: d.data.map(r=>r.label),
        datasets:[{
          label:'Revenue',
          data: d.data.map(r=>r.revenue),
          backgroundColor:'rgba(79,124,246,.8)', borderRadius:6, borderSkipped:false
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>'  '+fmt(c.parsed.y)}} },
        scales:{
          x:{ grid:{display:false}, ticks:{font:{size:11},color:'#9ca3af'} },
          y:{ grid:{color:'#f3f4f6'}, ticks:{font:{size:11},color:'#9ca3af',callback:v=>'₹'+Math.round(v/1000)+'K'} }
        }
      }
    });
  } catch(e) { showToast(e.message, 'error'); }
}

// ─── PAGE: PROFIT ───────────────────────────────────────────────
let profitState = { period:'monthly', from:'', to:'' };

async function renderProfit() {
  const el = document.getElementById('page-profit');
  el.innerHTML = `
    <div class="section-header"><h2>Profit Analysis</h2></div>
    <div class="toolbar">
      <div class="period-tabs" id="prof-tabs">
        <div class="period-tab active" onclick="setProfPeriod('daily',this)">Daily</div>
        <div class="period-tab" onclick="setProfPeriod('monthly',this)">Monthly</div>
        <div class="period-tab" onclick="setProfPeriod('yearly',this)">Yearly</div>
      </div>
      <input type="date" class="date-input" id="prof-from" onchange="profitState.from=this.value;loadProfit()">
      <input type="date" class="date-input" id="prof-to" onchange="profitState.to=this.value;loadProfit()">
      <button class="btn btn-outline" onclick="profitState.from='';profitState.to='';document.getElementById('prof-from').value='';document.getElementById('prof-to').value='';loadProfit()">Reset</button>
    </div>
    <div class="stats-grid" id="prof-stats"></div>
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Revenue vs Cost vs Profit</span></div>
      <div class="panel-body"><div class="chart-wrap" style="height:280px;"><canvas id="prof-chart"></canvas></div></div>
    </div>
  `;
  loadProfit();
}

function setProfPeriod(p, el) {
  profitState.period = p;
  document.querySelectorAll('#prof-tabs .period-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  loadProfit();
}

async function loadProfit() {
  const q = new URLSearchParams({ period:profitState.period, ...(profitState.from&&{from:profitState.from}), ...(profitState.to&&{to:profitState.to}) });
  try {
    const d = await apiFetch(`${API}/profit?${q}`);
    const margin = d.revenue > 0 ? (d.profit/d.revenue*100).toFixed(1) : 0;
    document.getElementById('prof-stats').innerHTML = `
      ${statCard('💰','Total Revenue',fmt(d.revenue),'--blue','up','')}
      ${statCard('📦','Total Cost',fmt(d.cost),'--orange','neutral','')}
      ${statCard('📈','Net Profit',fmt(d.profit),'--green','up','')}
      ${statCard('📊','Profit Margin',margin+'%','--purple','up','')}
    `;
    destroyChart('prof');
    const ctx = document.getElementById('prof-chart');
    if (!ctx) return;
    charts['prof'] = new Chart(ctx.getContext('2d'), {
      type:'bar',
      data:{
        labels: d.data.map(r=>r.label),
        datasets:[
          { label:'Revenue', data:d.data.map(r=>r.revenue), backgroundColor:'rgba(79,124,246,.8)', borderRadius:4 },
          { label:'Cost',    data:d.data.map(r=>r.cost),    backgroundColor:'rgba(249,115,22,.7)', borderRadius:4 },
          { label:'Profit',  data:d.data.map(r=>r.profit),  backgroundColor:'rgba(34,197,94,.8)',  borderRadius:4 }
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{position:'top',labels:{font:{size:12},boxWidth:12}}, tooltip:{callbacks:{label:c=>`  ${c.dataset.label}: ${fmt(c.parsed.y)}`}} },
        scales:{
          x:{ grid:{display:false}, ticks:{font:{size:11},color:'#9ca3af'} },
          y:{ grid:{color:'#f3f4f6'}, ticks:{font:{size:11},color:'#9ca3af',callback:v=>'₹'+Math.round(v/1000)+'K'} }
        }
      }
    });
  } catch(e) { showToast(e.message, 'error'); }
}

// ─── PAGE: DISCOUNT ─────────────────────────────────────────────
async function renderDiscount() {
  const el = document.getElementById('page-discount');
  el.innerHTML = `
    <div class="section-header">
      <h2>Discount Codes</h2>
      <button class="btn btn-blue" onclick="openDiscountModal()">+ New Discount</button>
    </div>
    <div class="panel">
      <div id="discount-table-wrap" class="table-wrap">
        <table>
          <thead><tr><th>CODE</th><th>TYPE</th><th>VALUE</th><th>MIN ORDER</th><th>USES</th><th>ACTIVE</th><th>EXPIRES</th><th>ACTIONS</th></tr></thead>
          <tbody id="discount-tbody"><tr class="loading-row"><td colspan="8">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
    ${discountModal()}
  `;
  loadDiscounts();
}

async function loadDiscounts() {
  const tbody = document.getElementById('discount-tbody');
  if (!tbody) return;
  try {
    const discounts = await apiFetch(`${API}/discounts`);
    if (!discounts.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">🎁</div><h3>No discount codes</h3><p>Create your first discount code</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = discounts.map(d=>`<tr>
      <td><span style="font-family:monospace;font-weight:700;font-size:13px;color:var(--blue);">${d.code}</span></td>
      <td><span class="badge" style="background:#f3f4f6;color:var(--text-2);">${d.type==='percentage'?'Percentage':'Fixed'}</span></td>
      <td style="font-weight:700;">${d.type==='percentage'? d.value+'%' : fmt(d.value)}</td>
      <td>${d.min_order>0?fmt(d.min_order):'None'}</td>
      <td>${d.uses}${d.max_uses?' / '+d.max_uses:' / ∞'}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${d.active?'checked':''} onchange="toggleDiscount(${d.id},this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td style="color:var(--text-3);font-size:12px;">${d.expires_at?fmtDate(d.expires_at):'No expiry'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <span class="icon-action" onclick="editDiscount(${JSON.stringify(d).split('"').join('&quot;')})">✏️</span>
          <span class="icon-action del" onclick="deleteDiscount(${d.id},'${d.code}')">🗑️</span>
        </div>
      </td>
    </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">⚠️</div><h3>Failed to load</h3></div></td></tr>`;
  }
}

function discountModal() {
  return `<div class="modal-overlay" id="discount-modal">
    <div class="modal">
      <div class="modal-head"><h2 id="disc-modal-title">New Discount Code</h2><div class="modal-close" onclick="closeDiscountModal()">✕</div></div>
      <div class="modal-body">
        <input type="hidden" id="disc-id">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Code *</label><input type="text" id="disc-code" class="form-control" placeholder="WELCOME10" style="text-transform:uppercase;"></div>
          <div class="form-group"><label class="form-label">Type *</label>
            <select id="disc-type" class="form-control"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed (₹)</option></select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Value *</label><input type="number" id="disc-value" class="form-control" placeholder="10"></div>
          <div class="form-group"><label class="form-label">Min Order (₹)</label><input type="number" id="disc-min" class="form-control" placeholder="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Max Uses</label><input type="number" id="disc-maxuses" class="form-control" placeholder="Unlimited"></div>
          <div class="form-group" style="display:flex;align-items:center;gap:10px;padding-top:22px;">
            <label class="toggle"><input type="checkbox" id="disc-active" checked><span class="toggle-slider"></span></label>
            <label class="form-label" style="margin:0;">Active</label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Starts At</label><input type="date" id="disc-starts" class="form-control"></div>
          <div class="form-group"><label class="form-label">Expires At</label><input type="date" id="disc-expires" class="form-control"></div>
        </div>
        <div class="form-error" id="disc-form-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDiscountModal()">Cancel</button>
        <button class="btn btn-blue" onclick="saveDiscount()">Save</button>
      </div>
    </div>
  </div>`;
}

function openDiscountModal(disc=null) {
  document.getElementById('disc-modal-title').textContent = disc ? 'Edit Discount' : 'New Discount Code';
  document.getElementById('disc-id').value = disc ? disc.id : '';
  document.getElementById('disc-code').value = disc ? disc.code : '';
  document.getElementById('disc-type').value = disc ? disc.type : 'percentage';
  document.getElementById('disc-value').value = disc ? disc.value : '';
  document.getElementById('disc-min').value = disc ? disc.min_order : '';
  document.getElementById('disc-maxuses').value = disc ? (disc.max_uses||'') : '';
  document.getElementById('disc-active').checked = disc ? !!disc.active : true;
  document.getElementById('disc-starts').value = disc ? (disc.starts_at||'').slice(0,10) : new Date().toISOString().slice(0,10);
  document.getElementById('disc-expires').value = disc ? (disc.expires_at||'').slice(0,10) : '';
  document.getElementById('disc-form-err').classList.remove('show');
  document.getElementById('discount-modal').classList.add('open');
}

function closeDiscountModal() { document.getElementById('discount-modal').classList.remove('open'); }

function editDiscount(d) { openDiscountModal(d); }

async function saveDiscount() {
  const id = document.getElementById('disc-id').value;
  const code = document.getElementById('disc-code').value.trim().toUpperCase();
  const type = document.getElementById('disc-type').value;
  const value = parseFloat(document.getElementById('disc-value').value);
  const min_order = parseFloat(document.getElementById('disc-min').value)||0;
  const max_uses = parseInt(document.getElementById('disc-maxuses').value)||null;
  const active = document.getElementById('disc-active').checked;
  const starts_at = document.getElementById('disc-starts').value;
  const expires_at = document.getElementById('disc-expires').value||null;
  const errEl = document.getElementById('disc-form-err');
  if (!code || !value) { errEl.textContent='Code and value are required'; errEl.classList.add('show'); return; }
  try {
    if (id) await apiFetch(`${API}/discounts/${id}`, { method:'PUT', body: JSON.stringify({code,type,value,min_order,max_uses,active,starts_at,expires_at}) });
    else await apiFetch(`${API}/discounts`, { method:'POST', body: JSON.stringify({code,type,value,min_order,max_uses,active,starts_at,expires_at}) });
    closeDiscountModal(); showToast(id?'Discount updated':'Discount created','success'); loadDiscounts();
  } catch(e) { errEl.textContent=e.message; errEl.classList.add('show'); }
}

async function toggleDiscount(id, active) {
  const disc = (await apiFetch(`${API}/discounts`)).find(d=>d.id===id);
  if (!disc) return;
  try {
    await apiFetch(`${API}/discounts/${id}`, { method:'PUT', body: JSON.stringify({...disc, active}) });
    showToast(active?'Discount activated':'Discount deactivated','success');
  } catch(e) { showToast(e.message,'error'); loadDiscounts(); }
}

async function deleteDiscount(id, code) {
  if (!confirm(`Delete discount code "${code}"?`)) return;
  try {
    await apiFetch(`${API}/discounts/${id}`, { method:'DELETE' });
    showToast('Discount deleted','success'); loadDiscounts();
  } catch(e) { showToast(e.message,'error'); }
}

// ─── PAGE: PRODUCT VARIANTS ─────────────────────────────────────
let variantsState = { filterProduct: '' };

function allBaseProducts() {
  return (typeof PRODUCTS_DATA !== 'undefined' ? PRODUCTS_DATA : []);
}

async function renderVariants() {
  const el = document.getElementById('page-variants');
  const products = allBaseProducts();
  el.innerHTML = `
    <div class="section-header">
      <h2>Product Variants</h2>
      <button class="btn btn-blue" onclick="openVariantModal()">+ New Variant</button>
    </div>
    <div class="panel">
      <div class="panel-body" style="padding-bottom:0;">
        <div class="toolbar">
          <select class="filter-select" id="var-filter-product" onchange="variantsState.filterProduct=this.value;loadVariants()">
            <option value="">All Products</option>
            ${products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>PRODUCT</th><th>VARIANT</th><th>PRICE</th><th>STOCK</th><th>ACTIVE</th><th>ACTIONS</th></tr></thead>
          <tbody id="variants-tbody"><tr class="loading-row"><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
    ${variantModal()}
  `;
  loadVariants();
}

async function loadVariants() {
  const tbody = document.getElementById('variants-tbody');
  if (!tbody) return;
  try {
    const q = variantsState.filterProduct ? `?product_id=${encodeURIComponent(variantsState.filterProduct)}` : '';
    const variants = await apiFetch(`${API}/variants${q}`);
    if (!variants.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🏷️</div><h3>No variants yet</h3><p>Add page-count / size variants for a product</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = variants.map(v=>`<tr>
      <td>${v.product_name}<div style="font-size:11px;color:var(--text-3);">${v.product_id}</div></td>
      <td style="font-weight:700;">${v.label}</td>
      <td>${fmt(v.price)}</td>
      <td>${fmtNum(v.stock)}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${v.active?'checked':''} onchange="toggleVariant(${v.id},this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <div style="display:flex;gap:4px;">
          <span class="icon-action" onclick='editVariant(${JSON.stringify(v).split("'").join("&apos;")})'>✏️</span>
          <span class="icon-action del" onclick="deleteVariant(${v.id},'${(v.label+'').replace(/'/g,"\\'")}')">🗑️</span>
        </div>
      </td>
    </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">⚠️</div><h3>Failed to load</h3></div></td></tr>`;
  }
}

function variantModal() {
  const products = allBaseProducts();
  return `<div class="modal-overlay" id="variant-modal">
    <div class="modal">
      <div class="modal-head"><h2 id="var-modal-title">New Variant</h2><div class="modal-close" onclick="closeVariantModal()">✕</div></div>
      <div class="modal-body">
        <input type="hidden" id="var-id">
        <div class="form-row">
          <div class="form-group" style="flex:1 1 100%;">
            <label class="form-label">Product *</label>
            <select id="var-product" class="form-control" onchange="onVariantProductChange()">
              <option value="">Select a product…</option>
              ${products.map(p=>`<option value="${p.id}" data-name="${p.name}">${p.name} (${p.id})</option>`).join('')}
              <option value="__custom__">Other / Custom product ID…</option>
            </select>
          </div>
        </div>
        <div class="form-row" id="var-custom-row" style="display:none;">
          <div class="form-group"><label class="form-label">Custom Product ID *</label><input type="text" id="var-product-id-custom" class="form-control" placeholder="stat-001"></div>
          <div class="form-group"><label class="form-label">Custom Product Name *</label><input type="text" id="var-product-name-custom" class="form-control" placeholder="Practical Notebook"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Variant Label *</label><input type="text" id="var-label" class="form-control" placeholder="e.g. 200 Pages"></div>
          <div class="form-group"><label class="form-label">Price (₹) *</label><input type="number" id="var-price" class="form-control" placeholder="110"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Stock</label><input type="number" id="var-stock" class="form-control" placeholder="100"></div>
          <div class="form-group" style="display:flex;align-items:center;gap:10px;padding-top:22px;">
            <label class="toggle"><input type="checkbox" id="var-active" checked><span class="toggle-slider"></span></label>
            <label class="form-label" style="margin:0;">Active</label>
          </div>
        </div>
        <div class="form-error" id="var-form-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeVariantModal()">Cancel</button>
        <button class="btn btn-blue" onclick="saveVariant()">Save</button>
      </div>
    </div>
  </div>`;
}

function onVariantProductChange() {
  const val = document.getElementById('var-product').value;
  document.getElementById('var-custom-row').style.display = val === '__custom__' ? 'flex' : 'none';
}

function openVariantModal(v=null) {
  document.getElementById('var-modal-title').textContent = v ? 'Edit Variant' : 'New Variant';
  document.getElementById('var-id').value = v ? v.id : '';
  const products = allBaseProducts();
  const isKnown = v && products.some(p=>p.id===v.product_id);
  document.getElementById('var-product').value = v ? (isKnown ? v.product_id : '__custom__') : '';
  document.getElementById('var-custom-row').style.display = (v && !isKnown) ? 'flex' : 'none';
  document.getElementById('var-product-id-custom').value = (v && !isKnown) ? v.product_id : '';
  document.getElementById('var-product-name-custom').value = (v && !isKnown) ? v.product_name : '';
  document.getElementById('var-label').value = v ? v.label : '';
  document.getElementById('var-price').value = v ? v.price : '';
  document.getElementById('var-stock').value = v ? v.stock : '';
  document.getElementById('var-active').checked = v ? !!v.active : true;
  document.getElementById('var-form-err').classList.remove('show');
  document.getElementById('variant-modal').classList.add('open');
}

function closeVariantModal() { document.getElementById('variant-modal').classList.remove('open'); }

function editVariant(v) { openVariantModal(v); }

async function saveVariant() {
  const id = document.getElementById('var-id').value;
  const sel = document.getElementById('var-product').value;
  const errEl = document.getElementById('var-form-err');
  let product_id, product_name;
  if (sel === '__custom__') {
    product_id = document.getElementById('var-product-id-custom').value.trim();
    product_name = document.getElementById('var-product-name-custom').value.trim();
  } else {
    product_id = sel;
    product_name = document.getElementById('var-product').selectedOptions[0]?.dataset.name || '';
  }
  const label = document.getElementById('var-label').value.trim();
  const price = parseFloat(document.getElementById('var-price').value);
  const stock = parseInt(document.getElementById('var-stock').value) || 0;
  const active = document.getElementById('var-active').checked;
  if (!product_id || !product_name || !label || !price) { errEl.textContent='Product, label and price are required'; errEl.classList.add('show'); return; }
  try {
    const body = JSON.stringify({ product_id, product_name, label, price, stock, active });
    if (id) await apiFetch(`${API}/variants/${id}`, { method:'PUT', body });
    else await apiFetch(`${API}/variants`, { method:'POST', body });
    closeVariantModal(); showToast(id?'Variant updated':'Variant added','success'); loadVariants();
  } catch(e) { errEl.textContent=e.message; errEl.classList.add('show'); }
}

async function toggleVariant(id, active) {
  try {
    const all = await apiFetch(`${API}/variants`);
    const v = all.find(x=>x.id===id);
    if (!v) return;
    await apiFetch(`${API}/variants/${id}`, { method:'PUT', body: JSON.stringify({...v, active}) });
    showToast(active?'Variant activated':'Variant deactivated','success');
  } catch(e) { showToast(e.message,'error'); loadVariants(); }
}

async function deleteVariant(id, label) {
  if (!confirm(`Delete variant "${label}"?`)) return;
  try {
    await apiFetch(`${API}/variants/${id}`, { method:'DELETE' });
    showToast('Variant deleted','success'); loadVariants();
  } catch(e) { showToast(e.message,'error'); }
}

// ─── PAGE: SUPPORT ──────────────────────────────────────────────
let supportState = { page:1, search:'', status:'', priority:'' };

async function renderSupport() {
  const el = document.getElementById('page-support');
  el.innerHTML = `
    <div class="section-header">
      <h2>Customer Support</h2>
      <button class="btn btn-blue" onclick="openSupportModal()">+ New Ticket</button>
    </div>
    <div class="panel">
      <div class="panel-body" style="padding-bottom:0;">
        <div class="toolbar">
          <div class="search-input">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search customer, subject, message…" id="sup-search" oninput="debouncedSupportSearch()">
          </div>
          <select class="filter-select" id="sup-status" onchange="supportState.status=this.value;supportState.page=1;loadSupport()">
            <option value="">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
          <select class="filter-select" id="sup-priority" onchange="supportState.priority=this.value;supportState.page=1;loadSupport()">
            <option value="">All Priorities</option>
            <option value="High">High</option>
            <option value="Normal">Normal</option>
          </select>
          <button class="btn btn-outline" onclick="supportState={page:1,search:'',status:'',priority:''};renderSupport()">Reset</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>CUSTOMER</th><th>SUBJECT</th><th>PRIORITY</th><th>STATUS</th><th>DATE</th><th>ACTIONS</th></tr></thead>
          <tbody id="support-tbody"><tr class="loading-row"><td colspan="7">Loading…</td></tr></tbody>
        </table>
      </div>
      <div class="panel-body" style="padding-top:0;" id="support-pagination"></div>
    </div>
    ${supportModal()}
    ${supportViewModal()}
  `;
  loadSupport();
}

const debouncedSupportSearch = debounce(() => {
  supportState.search = document.getElementById('sup-search')?.value || '';
  supportState.page = 1;
  loadSupport();
}, 350);

async function loadSupport() {
  const tbody = document.getElementById('support-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr class="loading-row"><td colspan="7">Loading…</td></tr>`;
  const { page, search, status, priority } = supportState;
  const q = new URLSearchParams({ page, limit:15, ...(search&&{search}), ...(status&&{status}), ...(priority&&{priority}) });
  try {
    const { tickets, total } = await apiFetch(`${API}/support?${q}`);
    if (!tickets.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">💬</div><h3>No tickets found</h3></div></td></tr>`;
      return;
    }
    tbody.innerHTML = tickets.map(t=>`<tr>
      <td style="font-size:12px;color:var(--text-3);">#${t.id}</td>
      <td>
        <div style="font-weight:600;font-size:13px;">${t.customer_name}</div>
        <div style="font-size:11.5px;color:var(--text-3);">${t.customer_email}</div>
      </td>
      <td style="max-width:200px;"><div style="font-weight:500;">${t.subject||'—'}</div><div style="font-size:11.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${t.message}</div></td>
      <td><span class="badge" style="${t.priority==='High'?'color:#dc2626;background:#fef2f2;':'color:var(--text-3);background:#f3f4f6;'}">${t.priority}</span></td>
      <td>
        <select onchange="updateTicketStatus(${t.id},this.value)" style="border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;">
          ${['Open','In Progress','Resolved'].map(s=>`<option${s===t.status?' selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="color:var(--text-3);font-size:12px;">${fmtDate(t.created_at)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <span class="icon-action" onclick="viewTicket(${t.id})">👁️</span>
          <span class="icon-action del" onclick="deleteTicket(${t.id})">🗑️</span>
        </div>
      </td>
    </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">⚠️</div><h3>Failed to load</h3></div></td></tr>`;
  }
}

function supportModal() {
  return `<div class="modal-overlay" id="support-modal">
    <div class="modal">
      <div class="modal-head"><h2>New Support Ticket</h2><div class="modal-close" onclick="closeSupportModal()">✕</div></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Customer Name *</label><input type="text" id="sm-name" class="form-control"></div>
          <div class="form-group"><label class="form-label">Email</label><input type="email" id="sm-email" class="form-control"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Phone</label><input type="tel" id="sm-phone" class="form-control"></div>
          <div class="form-group"><label class="form-label">Priority</label>
            <select id="sm-priority" class="form-control"><option>Normal</option><option>High</option></select>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Subject</label><input type="text" id="sm-subject" class="form-control" placeholder="Brief description"></div>
        <div class="form-group"><label class="form-label">Message *</label><textarea id="sm-message" class="form-control" rows="4" placeholder="Describe the issue…"></textarea></div>
        <div class="form-error" id="sup-form-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeSupportModal()">Cancel</button>
        <button class="btn btn-blue" onclick="saveSupportTicket()">Create Ticket</button>
      </div>
    </div>
  </div>`;
}

function supportViewModal() {
  return `<div class="modal-overlay" id="support-view-modal">
    <div class="modal modal-lg">
      <div class="modal-head"><h2>Ticket Details</h2><div class="modal-close" onclick="document.getElementById('support-view-modal').classList.remove('open')">✕</div></div>
      <div class="modal-body" id="support-view-body"></div>
      <div class="modal-footer" id="support-view-footer"></div>
    </div>
  </div>`;
}

function openSupportModal() { document.getElementById('support-modal').classList.add('open'); }
function closeSupportModal() { document.getElementById('support-modal').classList.remove('open'); }

async function saveSupportTicket() {
  const errEl = document.getElementById('sup-form-err');
  const name = document.getElementById('sm-name').value.trim();
  const email = document.getElementById('sm-email').value.trim();
  const phone = document.getElementById('sm-phone').value.trim();
  const subject = document.getElementById('sm-subject').value.trim();
  const message = document.getElementById('sm-message').value.trim();
  const priority = document.getElementById('sm-priority').value;
  if (!name || !message) { errEl.textContent='Name and message required'; errEl.classList.add('show'); return; }
  try {
    await apiFetch(`${API}/support`, { method:'POST', body: JSON.stringify({ customer_name:name, customer_email:email, customer_phone:phone, subject, message, priority }) });
    closeSupportModal(); showToast('Ticket created','success'); loadSupport();
  } catch(e) { errEl.textContent=e.message; errEl.classList.add('show'); }
}

async function updateTicketStatus(id, status) {
  try {
    await apiFetch(`${API}/support/${id}`, { method:'PUT', body: JSON.stringify({ status }) });
    showToast('Status updated','success');
  } catch(e) { showToast(e.message,'error'); }
}

async function viewTicket(id) {
  const m = document.getElementById('support-view-modal');
  const body = document.getElementById('support-view-body');
  const footer = document.getElementById('support-view-footer');
  m.classList.add('open');
  body.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:30px;">Loading…</p>';
  try {
    const tickets = await apiFetch(`${API}/support?page=1&limit=100`);
    const t = tickets.tickets.find(tt=>tt.id===id);
    if (!t) { body.innerHTML='<p>Not found</p>'; return; }
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div><div class="form-label">Customer</div><div style="font-weight:600;">${t.customer_name}</div></div>
        <div><div class="form-label">Email</div><div>${t.customer_email||'—'}</div></div>
        <div><div class="form-label">Phone</div><div>${t.customer_phone||'—'}</div></div>
        <div><div class="form-label">Priority</div><span class="badge" style="${t.priority==='High'?'color:#dc2626;background:#fef2f2;':'color:var(--text-3);background:#f3f4f6;'}">${t.priority}</span></div>
        <div><div class="form-label">Status</div>${statusBadge(t.status)}</div>
        <div><div class="form-label">Date</div><div style="color:var(--text-3);">${fmtDate(t.created_at)}</div></div>
      </div>
      <div class="form-group"><div class="form-label">Subject</div><div style="font-weight:600;">${t.subject||'—'}</div></div>
      <div class="form-group"><div class="form-label">Message</div>
        <div style="background:var(--surface);border-radius:8px;padding:14px;font-size:13px;line-height:1.7;">${t.message}</div>
      </div>
      <div class="form-group"><label class="form-label">Admin Notes</label>
        <textarea id="ticket-notes-${t.id}" class="form-control" rows="3" placeholder="Add internal notes…">${t.notes||''}</textarea>
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-outline" onclick="document.getElementById('support-view-modal').classList.remove('open')">Close</button>
      <button class="btn btn-success" onclick="saveTicketNotes(${t.id})">Save Notes</button>
    `;
  } catch(e) { body.innerHTML = `<p style="color:var(--red);">${e.message}</p>`; }
}

async function saveTicketNotes(id) {
  const notes = document.getElementById(`ticket-notes-${id}`)?.value || '';
  try {
    await apiFetch(`${API}/support/${id}`, { method:'PUT', body: JSON.stringify({ notes }) });
    showToast('Notes saved','success');
  } catch(e) { showToast(e.message,'error'); }
}

async function deleteTicket(id) {
  if (!confirm('Delete this support ticket?')) return;
  try {
    await apiFetch(`${API}/support/${id}`, { method:'DELETE' });
    showToast('Ticket deleted','success'); loadSupport();
  } catch(e) { showToast(e.message,'error'); }
}

// ─── DEBOUNCE HELPER ────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), ms); };
}

// ─── BOOT ───────────────────────────────────────────────────────
(async function boot() {
  if (authToken) {
    try {
      const me = await apiFetch(`${API}/me`);
      initApp(me.email);
    } catch {
      authToken = null; localStorage.removeItem('admin_token');
    }
  }
})();
