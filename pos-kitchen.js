// pos-kitchen.js — KOT, KDS, waiter alerts
// ══ KOT ══════════════════════════════════════════════════════════
function showKOT(order) {
  const s = loadSettings();
  const bizName = s.bizName || 'Restaurant';
  const now = new Date();
  if (document.getElementById('kot-biz')) document.getElementById('kot-biz').textContent = bizName;
  if (document.getElementById('kot-num')) document.getElementById('kot-num').textContent = '#' + order.order_number;
  if (document.getElementById('kot-badge')) document.getElementById('kot-badge').textContent = 'KOT #' + order.order_number;
  if (document.getElementById('kot-time')) document.getElementById('kot-time').textContent = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) + ' · ' + now.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  const metaEl = document.getElementById('kot-meta');
  if (metaEl) {
    let html = '<span class="kot-pill">' + (_orderType==='dine'?'🍽 Dine In':'_orderType'==='take'?'🛍 Takeaway':'🏪 Stall') + '</span>';
    if (_orderType==='dine'&&_tableNumber) html += '<span class="kot-pill table">Table ' + _tableNumber + '</span>';
    if (order.customer_name) html += '<span class="kot-pill">' + order.customer_name + '</span>';
    metaEl.innerHTML = html;
  }
  const itemsEl = document.getElementById('kot-items');
  if (itemsEl) {
    const entries = Object.values(cart).length > 0 ? Object.values(cart) : (order.items || []);
    itemsEl.innerHTML = entries.map(it => '<div class="kot-item"><span class="kot-item-name">' + (it.icon||it.product_icon||'') + ' ' + (it.name||it.product_name) + '</span><span class="kot-item-qty">× ' + (it.qty) + '</span></div>').join('');
  }
  document.getElementById('kot-overlay')?.classList.add('show');
}

function closeKOT() { document.getElementById('kot-overlay')?.classList.remove('show'); }

function printKOT() {
  const body = document.querySelector('.kot-modal')?.innerHTML || '';
  const win = window.open('','_blank','width=320,height=500');
  if (!win) return;
  win.document.write('<html><head><title>KOT</title><style>body{font-family:monospace;padding:10px;font-size:12px;}.kot-head{background:#1A1208;color:#fff;padding:8px;display:flex;justify-content:space-between;margin:-10px -10px 10px;}.kot-badge{background:#E8440A;padding:2px 6px;border-radius:4px;font-size:10px;}.kot-item{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #ddd;}.kot-item-qty{font-weight:bold;color:#E8440A;}.kot-pill{display:inline-block;background:#f0ede8;padding:2px 8px;border-radius:10px;font-size:10px;margin-right:3px;}.kot-pill.table{background:#FEF0EB;color:#E8440A;}.kot-biz{text-align:center;font-size:10px;text-transform:uppercase;color:#666;margin-bottom:2px;}.kot-num{text-align:center;font-size:20px;font-weight:bold;margin-bottom:8px;}.kot-divider{border-top:1px dashed #999;margin:6px 0;}.kot-meta{margin:5px 0;text-align:center;}.kot-foot,.screen-actions{display:none;}</style></head><body onload="window.print()">');
  win.document.write(body);
  win.document.write('</body></html>');
  win.document.close();
}

// ══ WA SETTINGS HELPERS ══════════════════════════════════════════
function getWASettings() {
  return { waCode: localStorage.getItem('bite_wa_code')||'', tableCount: parseInt(localStorage.getItem('bite_table_count')||'10') };
}
function populateWASettingsForm() {
  const wa = getWASettings();
  const w = document.getElementById('set-wa-code'); if(w) w.value = wa.waCode||'';
  const t = document.getElementById('set-table-count'); if(t) t.value = wa.tableCount||10;
  const p = document.getElementById('set-pay4-wa'); if(p) p.value = localStorage.getItem('bite_pay4_wa_number')||'';
}
function saveWASettings() {
  const waCode = document.getElementById('set-wa-code')?.value?.trim()?.toUpperCase();
  const tableCount = parseInt(document.getElementById('set-table-count')?.value)||10;
  localStorage.setItem('bite_wa_code', waCode||'');
  localStorage.setItem('bite_table_count', tableCount);
  buildTableNumBtns();
}
function initWASystem() {
  const wa = getWASettings();
  if (wa.waCode) buildTableNumBtns();
}
function updateWaPreview() {
  const code = document.getElementById('set-wa-code')?.value?.trim()?.toUpperCase();
  const prev = document.getElementById('wa-settings-preview');
  const codeEl = document.getElementById('wa-code-preview');
  if (!prev||!codeEl) return;
  if (code) { codeEl.textContent = code+'-T1'; prev.style.display='block'; }
  else prev.style.display='none';
}

// ══ PRODUCTS PAGE: Category filter + Bulk Select ══════════════
let _selectedProds = new Set();
let _prodCatFilter = 'all';

function renderProdCatFilter() {
  const el = document.getElementById('prod-cat-filter');
  if (!el) return;
  const cats = [{id:'all', name:'All', icon:''}].concat(categories||[]);
  el.innerHTML = '';
  cats.forEach(function(cat) {
    const btn = document.createElement('button');
    const isActive = _prodCatFilter === String(cat.id);
    btn.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.name;
    btn.style.cssText = 'font-size:11px;font-weight:600;padding:5px 12px;border-radius:20px;cursor:pointer;margin:2px;border:1.5px solid ' + (isActive ? 'var(--brand)' : 'var(--border)') + ';background:' + (isActive ? 'var(--brand-lt)' : 'var(--card)') + ';color:' + (isActive ? 'var(--brand)' : 'var(--muted)') + ';';
    btn.onclick = function() { setProdCatFilter(cat.id); };
    el.appendChild(btn);
  });
}
function setProdCatFilter(catId) {
  _prodCatFilter = String(catId);
  renderProdCatFilter();
  renderProductList();
}
function selectAllInGroup(masterCb, groupName, items) {
  if (items) {
    items.forEach(p => {
      if (masterCb.checked) _selectedProds.add(p.id);
      else _selectedProds.delete(p.id);
    });
    // Check/uncheck rendered checkboxes
    document.querySelectorAll('.prod-select-cb').forEach(cb => {
      const item = cb.closest('.prod-item');
      if (!item) return;
      let prev = item.previousElementSibling;
      while (prev && !prev.classList.contains('prod-group-head')) prev = prev.previousElementSibling;
      if (prev && prev.dataset.groupname === groupName) cb.checked = masterCb.checked;
    });
  }
  const bar = document.getElementById('bulk-bar');
  const cnt = document.getElementById('bulk-count');
  if (bar) bar.style.display = _selectedProds.size > 0 ? 'flex' : 'none';
  if (cnt) cnt.textContent = _selectedProds.size + ' selected';
}

function toggleProdSelect(prodId, cb) {
  if (cb.checked) _selectedProds.add(prodId); else _selectedProds.delete(prodId);
  const bar = document.getElementById('bulk-bar');
  const cnt = document.getElementById('bulk-count');
  if (bar) bar.style.display = _selectedProds.size > 0 ? 'flex' : 'none';
  if (cnt) cnt.textContent = _selectedProds.size + ' selected';
}
function clearBulkSelect() {
  _selectedProds.clear();
  const bar = document.getElementById('bulk-bar');
  if (bar) bar.style.display = 'none';
  document.querySelectorAll('.prod-select-cb').forEach(cb => cb.checked = false);
}
async function deleteSelectedProducts() {
  if (_selectedProds.size === 0) return;
  if (!confirm('Delete ' + _selectedProds.size + ' product(s)? Cannot be undone.')) return;
  const ids = Array.from(_selectedProds);
  const { error } = await sb.from('products').delete().in('id', ids).eq('tenant_id', window._tenantId);
  if (error) { showToast('Error deleting'); return; }
  showToast(ids.length + ' product(s) deleted');
  clearBulkSelect();
  await loadProducts();
}
