// pos-kitchen.js — KOT, KDS (Kitchen Display System)

// ── KDS State ─────────────────────────────────────────────────────
let _kdsOrders = [];
let _kdsRejections = {};
let _kdsTimers = {};
let _kdsSubscription = null;

// ── Load KDS orders from Supabase ────────────────────────────────
async function loadKDS() {
  if (!window._tenantId) return;
  const { data } = await sb
    .from('orders')
    .select('*, order_items(id,product_name,product_icon,qty,unit_price,line_total)')
    .eq('tenant_id', window._tenantId)
    .in('status', ['pending','preparing','ready'])
    .order('created_at', { ascending: true });
  _kdsOrders = data || [];
  renderKDS();
  updateKDSBadge();
}

// ── Render KDS columns ───────────────────────────────────────────
function renderKDS() {
  const pending   = _kdsOrders.filter(o => o.status === 'pending');
  const preparing = _kdsOrders.filter(o => o.status === 'preparing');
  const ready     = _kdsOrders.filter(o => o.status === 'ready');
  const empty = msg => '<div class="kds-empty">' + msg + '</div>';
  const pEl  = document.getElementById('kds-pending');
  const prEl = document.getElementById('kds-preparing');
  const rEl  = document.getElementById('kds-ready');
  if (pEl)  pEl.innerHTML  = pending.length   ? pending.map(kdsCardHTML).join('')   : empty('✅ No pending orders');
  if (prEl) prEl.innerHTML = preparing.length ? preparing.map(kdsCardHTML).join('') : empty('🍳 Nothing preparing');
  if (rEl)  rEl.innerHTML  = ready.length     ? ready.map(kdsCardHTML).join('')     : empty('🔔 Nothing ready yet');
  _kdsOrders.forEach(o => { if (!_kdsTimers[o.id]) _kdsTimers[o.id] = new Date(o.created_at).getTime(); });
}

// ── Build single KDS card HTML ───────────────────────────────────
function kdsCardHTML(order) {
  const items    = order.order_items || [];
  const rejected = _kdsRejections[order.id] || [];
  const ot       = order.order_type || 'take';
  const typeLabel = ot === 'dine' ? ('🍽 Table ' + (order.table_number || '?'))
                  : ot === 'take' ? '🛍 Takeaway' : '🏪 Stall';
  let itemsHTML = '';
  items.forEach(function(item) {
    var isRej  = rejected.indexOf(item.id) >= 0;
    var style  = isRej ? ' style="opacity:0.45;text-decoration:line-through"' : '';
    var actBtn = '';
    if (order.status !== 'ready') {
      actBtn = isRej
        ? '<button class="kds-item-restore-btn" onclick="kdsRestoreItem(this)" data-order="' + order.id + '" data-item="' + item.id + '">Restore</button>'
        : '<button class="kds-item-reject-btn" onclick="kdsRejectItem(this)" data-order="' + order.id + '" data-item="' + item.id + '" data-name="' + (item.product_name||'').replace(/"/g,'') + '">Unavail</button>';
    }
    itemsHTML += '<div class="kds-item-row"' + style + '><span class="kds-item-qty">' + item.qty + 'x</span>'
      + '<span class="kds-item-name">' + (item.product_icon||'') + ' ' + (item.product_name||'') + '</span>' + actBtn + '</div>';
  });
  const rejWarn = rejected.length
    ? '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:5px 8px;font-size:11px;color:#DC2626;font-weight:600;margin-top:6px">&#9888; ' + rejected.length + ' item(s) unavailable</div>' : '';
  var oid = order.id;
  var actions = '';
  if (order.status === 'pending') {
    actions = '<button class="kds-btn prepare" onclick="kdsUpdateStatus(this.dataset.id, this.dataset.st)" data-id="' + oid + '" data-st="preparing">&#x1F525; Start</button>'
            + '<button class="kds-btn reprint" onclick="reprintKOT(this.dataset.id)" data-id="' + oid + '">KOT</button>';
  } else if (order.status === 'preparing') {
    actions = '<button class="kds-btn ready" onclick="kdsUpdateStatus(this.dataset.id, this.dataset.st)" data-id="' + oid + '" data-st="ready">&#x2705; Ready</button>'
            + '<button class="kds-btn notify" onclick="kdsNotifyWaiter(this.dataset.id)" data-id="' + oid + '">&#x1F514;</button>'
            + '<button class="kds-btn reprint" onclick="reprintKOT(this.dataset.id)" data-id="' + oid + '">KOT</button>';
  } else {
    actions = '<button class="kds-btn ready" onclick="this.closest(' + "'" + '.kds-card' + "'" + ')?.remove()" style="background:#166534">&#x1F37D; Served</button>';
            + '<button class="kds-btn notify" onclick="kdsNotifyWaiter(this.dataset.id)" data-id="' + oid + '">&#x1F514;</button>';
  }
  return '<div class="kds-card ' + order.status + '" id="kds-card-' + oid + '">'
    + '<div class="kds-card-head"><div><div class="kds-card-num">#' + order.order_number + '</div>'
    + '<div class="kds-card-meta">' + typeLabel + '</div></div>'
    + '<span class="kds-card-timer" id="kds-timer-' + oid + '">0m</span></div>'
    + '<div class="kds-card-body">' + itemsHTML + rejWarn + '</div>'
    + '<div class="kds-card-actions">' + actions + '</div></div>';
}

// ── Update order status ──────────────────────────────────────────
async function kdsUpdateStatus(orderId, newStatus) {
  var st = newStatus || (typeof orderId === 'object' ? orderId.dataset.st : newStatus);
  var id = typeof orderId === 'string' ? orderId : orderId.dataset.id;
  await sb.from('orders').update({ status: st }).eq('id', id);
  newStatus = st; orderId = id;
  showToast(newStatus === 'preparing' ? 'Order started 🔥' : 'Order ready ✅');
  await loadKDS();
}

// ── Reject/restore item ──────────────────────────────────────────
function kdsRejectItem(btn) {
  var orderId  = btn.dataset.order;
  var itemId   = btn.dataset.item;
  var itemName = btn.dataset.name;
  if (!_kdsRejections[orderId]) _kdsRejections[orderId] = [];
  if (_kdsRejections[orderId].indexOf(itemId) < 0) _kdsRejections[orderId].push(itemId);
  showToast('"' + itemName + '" marked unavailable');
  renderKDS();
  kdsShowWaiterAlert(orderId, itemName);
}

function kdsRestoreItem(btn) {
  var orderId = btn.dataset.order;
  var itemId  = btn.dataset.item;
  if (_kdsRejections[orderId]) {
    _kdsRejections[orderId] = _kdsRejections[orderId].filter(function(id){ return id !== itemId; });
  }
  renderKDS();
}

// ── Notify waiter ────────────────────────────────────────────────
function kdsNotifyWaiter(idOrBtn) {
  var orderId = typeof idOrBtn === 'string' ? idOrBtn : idOrBtn.dataset ? idOrBtn.dataset.id : idOrBtn;
  var order   = _kdsOrders.find(function(o){ return o.id === orderId; });
  if (!order) return;
  showToast('🔔 Waiter notified for Order #' + order.order_number);
  kdsShowWaiterAlert(orderId, null, 'ready');
}

// ── Show waiter alert on order screen ───────────────────────────
function kdsShowWaiterAlert(orderId, itemName, type) {
  var order   = _kdsOrders.find(function(o){ return o.id === orderId; });
  if (!order) return;
  var alertEl = document.getElementById('waiter-alerts');
  if (!alertEl) return;
  var id      = 'alert-' + Date.now();
  var isReady = type === 'ready';
  var msg     = isReady
    ? 'Order #' + order.order_number + ' is READY 🍽'
    : '"' + (itemName||'Item') + '" unavailable in #' + order.order_number;
  var loc = order.order_type === 'dine' ? 'Table ' + (order.table_number||'?') : 'Takeaway';
  var div = document.createElement('div');
  div.id        = id;
  div.className = 'waiter-alert ' + (isReady ? 'alert-ready' : 'alert-unavail');
  var icon = document.createElement('span');
  icon.className   = 'wa-alert-icon';
  icon.textContent = isReady ? '✅' : '⚠️';
  var body = document.createElement('div');
  body.className = 'wa-alert-body';
  body.innerHTML = '<div class="wa-alert-title">' + msg + '</div><div class="wa-alert-sub">' + loc + '</div>';
  var btn = document.createElement('button');
  btn.className   = 'wa-alert-dismiss';
  btn.textContent = '✕';
  btn.onclick     = function(){ dismissAlert(id); };
  div.appendChild(icon); div.appendChild(body); div.appendChild(btn);
  alertEl.appendChild(div);
  alertEl.style.display = 'flex';
  setTimeout(function(){ dismissAlert(id); }, 30000);
}

function dismissAlert(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
  var al = document.getElementById('waiter-alerts');
  if (al && !al.children.length) al.style.display = 'none';
}

// ── Reprint KOT ─────────────────────────────────────────────────
function reprintKOT(idOrBtn) {
  var orderId = typeof idOrBtn === 'string' ? idOrBtn : idOrBtn.dataset ? idOrBtn.dataset.id : idOrBtn;
  var order   = _kdsOrders.find(function(o){ return o.id === orderId; });
  if (!order) return;
  _orderType    = order.order_type || 'take';
  _tableNumber  = order.table_number || null;
  showKOT(order);
}

// ── Update KDS badge on nav ──────────────────────────────────────
function updateKDSBadge() {
  var pending = _kdsOrders.filter(function(o){ return o.status === 'pending'; }).length;
  var badge   = document.getElementById('kds-badge');
  if (!badge) return;
  badge.textContent = pending;
  badge.classList.toggle('show', pending > 0);
}

// ── Auto-refresh KDS timer ───────────────────────────────────────
setInterval(function() {
  Object.keys(_kdsTimers).forEach(function(id) {
    var el = document.getElementById('kds-timer-' + id);
    if (!el) return;
    var mins  = Math.floor((Date.now() - _kdsTimers[id]) / 60000);
    el.textContent  = mins + 'm';
    el.style.color  = mins > 20 ? '#DC2626' : mins > 10 ? '#D97706' : 'inherit';
  });
}, 30000);

// ── WA Settings Helpers ──────────────────────────────────────────
function getWASettings() {
  return {
    waCode:     localStorage.getItem('bite_wa_code') || '',
    tableCount: parseInt(localStorage.getItem('bite_table_count') || '10')
  };
}
function populateWASettingsForm() {
  var wa = getWASettings();
  var w  = document.getElementById('set-wa-code');    if(w) w.value = wa.waCode || '';
  var t  = document.getElementById('set-table-count'); if(t) t.value = wa.tableCount || 10;
  var p  = document.getElementById('set-pay4-wa');    if(p) p.value = localStorage.getItem('bite_pay4_wa_number') || '';
}
function saveWASettings() {
  var waCode     = document.getElementById('set-wa-code')?.value?.trim()?.toUpperCase();
  var tableCount = parseInt(document.getElementById('set-table-count')?.value) || 10;
  localStorage.setItem('bite_wa_code', waCode || '');
  localStorage.setItem('bite_table_count', tableCount);
}
function initWASystem() {
  var wa = getWASettings();
  if (wa.waCode) buildTableNumBtns();
}
function updateWaPreview() {
  var code   = document.getElementById('set-wa-code')?.value?.trim()?.toUpperCase();
  var prev   = document.getElementById('wa-settings-preview');
  var codeEl = document.getElementById('wa-code-preview');
  if (!prev || !codeEl) return;
  if (code) { codeEl.textContent = code + '-T1'; prev.style.display = 'block'; }
  else prev.style.display = 'none';
}
