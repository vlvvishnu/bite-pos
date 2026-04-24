// pos-data.js — products, categories, history
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


// ══ DATA ══
async function loadCategories(){
  let q=sb.from('categories').select('*').order('sort_order',{ascending:true});
  if(window._tenantId) q=q.eq('tenant_id',window._tenantId);
  const {data,error}=await q;
  if(!error&&data) categories=data;
}
async function loadProducts(){
  renderProdCatFilter();

  let q=sb.from('products').select('*, categories(name,icon)').order('sort_order',{ascending:true});
  if(window._tenantId) q=q.eq('tenant_id',window._tenantId);
  const {data,error}=await q;
  if(!error&&data) products=data.map(p=>({...p,catId:p.category_id,catName:p.categories?.name||'',catIcon:p.categories?.icon||'',outOfStock:p.out_of_stock}));
  if(document.getElementById('prod-list')) renderProductList();
}


// ══ HISTORY ══
function setFilter(f,btn){
  historyFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('custom-dates').style.display=f==='custom'?'flex':'none';
  if(f!=='custom') renderHistory();
}
async function renderHistory(){
  document.getElementById('stat-cards').innerHTML='<div class="empty-state"><div class="ls-spinner"></div></div>';
  document.getElementById('orders-table').innerHTML='';
  const now=new Date(); let fromISO,toISO;
  if(historyFilter==='today'){ fromISO=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString(); toISO=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toISOString(); }
  else if(historyFilter==='week'){ const w=new Date(now); w.setDate(now.getDate()-7); fromISO=w.toISOString(); toISO=new Date(now.getTime()+86400000).toISOString(); }
  else if(historyFilter==='year'){ fromISO=new Date(now.getFullYear(),0,1).toISOString(); toISO=new Date(now.getFullYear()+1,0,1).toISOString(); }
  else if(historyFilter==='custom'){
    const f=document.getElementById('date-from').value,t=document.getElementById('date-to').value;
    if(!f||!t){ showToast('Select both dates'); return; }
    fromISO=new Date(f).toISOString(); toISO=new Date(t+'T23:59:59').toISOString();
  }
  let q=sb.from('orders').select('*, order_items(product_name,product_icon,qty,unit_price,line_total)').order('created_at',{ascending:false});
  if(window._tenantId) q=q.eq('tenant_id',window._tenantId);
  if(fromISO) q=q.gte('created_at',fromISO);
  if(toISO)   q=q.lt('created_at',toISO);
  const {data:orders,error}=await q;
  if(error){ showToast('Error loading history'); return; }
  const paid=orders.filter(o=>o.status==='paid'),refunded=orders.filter(o=>o.status==='refunded');
  const revenue=paid.reduce((s,o)=>s+Number(o.total),0),refundAmt=refunded.reduce((s,o)=>s+Number(o.total),0);
  document.getElementById('stat-cards').innerHTML=`
    <div class="stat-card green"><div class="stat-label">Revenue</div><div class="stat-val">₹${revenue.toFixed(2)}</div><div class="stat-sub">${paid.length} paid orders</div></div>
    <div class="stat-card red"><div class="stat-label">Refunds</div><div class="stat-val">₹${refundAmt.toFixed(2)}</div><div class="stat-sub">${refunded.length} refunded</div></div>
    <div class="stat-card blue"><div class="stat-label">Total Orders</div><div class="stat-val">${orders.length}</div><div class="stat-sub">Avg ₹${orders.length?((revenue+refundAmt)/orders.length).toFixed(2):'0.00'}</div></div>
    <div class="stat-card"><div class="stat-label">Net Revenue</div><div class="stat-val">₹${(revenue-refundAmt).toFixed(2)}</div><div class="stat-sub">After refunds</div></div>`;
  if(!orders.length){ document.getElementById('orders-table').innerHTML='<div class="empty-state"><div class="es-ic">📭</div><p>No orders in this period</p></div>'; return; }
  document.getElementById('orders-table').innerHTML=`
    <div class="ot-head"><div>Order</div><div>Items</div><div class="col-time">Time</div><div>Total</div><div>Status</div><div class="col-refund">Action</div></div>
    ${orders.map(o=>{
      const items=(o.order_items||[]).map(i=>i.qty>1?i.qty+'× '+i.product_name:i.product_name).join(', ');
      return `<div class="ot-row" onclick="openOrderDetail('${o.id}')">
        <div class="ot-id">#${o.order_number}</div><div class="ot-items">${items}</div>
        <div class="ot-time col-time">${fmtTime(o.created_at)}</div>
        <div class="ot-total">₹${Number(o.total).toFixed(2)}</div>
        <div><span class="badge ${o.status}">${o.status}</span></div>
        <div class="col-refund" onclick="event.stopPropagation()">
          <button class="refund-btn" ${o.status==='refunded'?'disabled':''} onclick="openRefundModal('${o.id}','${o.order_number}','${o.total}')">Refund</button>
        </div></div>`;
    }).join('')}`;
}
function fmtTime(iso){ const d=new Date(iso),now=new Date(); return d.toDateString()===now.toDateString()?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([],{month:'short',day:'numeric'}); }

// ══ ORDER DETAIL ══
async function openOrderDetail(orderId){
  document.getElementById('order-detail-overlay').classList.add('show');
  document.getElementById('od-body').innerHTML='<div style="padding:28px;text-align:center"><div class="ls-spinner"></div></div>';
  const {data:o,error}=await sb.from('orders').select('*, order_items(product_name,product_icon,qty,unit_price,line_total)').eq('id',orderId).single();
  if(error||!o){ document.getElementById('od-body').innerHTML='<div class="empty-state"><p>Could not load order.</p></div>'; return; }
  currentOrderDetail=o;
  document.getElementById('od-num').textContent='#'+o.order_number;
  const rb=document.getElementById('od-refund-btn');
  rb.disabled=o.status==='refunded'; rb.textContent=o.status==='refunded'?'Already Refunded':'Issue Refund';
  const hasCustomer=o.customer_name||o.customer_email||o.customer_phone;
  const {bizName}=loadSettings(); const receiptURL=getReceiptURL(o.id,bizName);
  document.getElementById('od-body').innerHTML=`
    <div class="od-meta">
      <div class="od-meta-chip">${fmtTime(o.created_at)}</div>
      <div class="od-meta-chip">${new Date(o.created_at).toLocaleDateString([],{day:'numeric',month:'short',year:'numeric'})}</div>
      <div class="od-meta-chip">${o.kiosk_id||'Kiosk'}</div>
      <span class="badge ${o.status}" style="align-self:center">${o.status}</span>
    </div>
    <div class="od-section-label">Items</div>
    ${(o.order_items||[]).map(i=>`<div class="od-item-row"><div class="od-item-icon">${i.product_icon||'🍽️'}</div><div class="od-item-name">${i.product_name}</div><div class="od-item-qty">${i.qty}×</div><div class="od-item-price">₹${Number(i.line_total).toFixed(2)}</div></div>`).join('')}
    <div class="od-totals">
      <div class="od-tot-row"><span>Subtotal</span><span>₹${Number(o.subtotal).toFixed(2)}</span></div>
      <div class="od-tot-row"><span>Tax</span><span>₹${Number(o.tax).toFixed(2)}</span></div>
      <div class="od-tot-row grand"><span>Total</span><span>₹${Number(o.total).toFixed(2)}</span></div>
    </div>
    ${hasCustomer?`<div class="od-customer"><div class="od-customer-title">Customer</div>
      ${o.customer_name?`<div class="od-customer-row">👤 ${o.customer_name}</div>`:''}
      ${o.customer_email?`<div class="od-customer-row">✉️ ${o.customer_email}</div>`:''}
      ${o.customer_phone?`<div class="od-customer-row">📱 ${o.customer_phone}</div>`:''}
    </div>`:''}
    <div class="share-panel">
      <div class="share-panel-title">Share Receipt</div>
      <div class="share-qr-row"><div class="share-qr-box"><div id="od-qr-canvas"></div></div>
      <div class="share-qr-hint"><strong>Scan to open receipt</strong>Customer can view, download or print.</div></div>
      <div class="share-btns" style="grid-template-columns:repeat(4,1fr)">
        <button class="share-btn wa" onclick="shareReceiptWhatsApp('${receiptURL}',${o.order_number},'${Number(o.total).toFixed(2)}','${(o.customer_phone||'')}')"><span class="sb-icon">💬</span>WhatsApp</button>
        <button class="share-btn mail" id="od-mail-btn" ${!o.customer_email?'disabled':''}
          onclick="sendReceiptEmail('${o.id}',${o.order_number},'${Number(o.total).toFixed(2)}','${o.customer_email||''}','${(o.customer_name||'').replace(/'/g,'')}','${receiptURL}','${bizName}')">
          <span class="sb-icon">✉️</span>${o.customer_email?'Email':'No Email'}</button>
        <a class="share-btn" href="${PRINT_BASE}?id=${o.id}" target="_blank"><span class="sb-icon">🖨️</span>Print</a>
        <button class="share-btn" onclick="copyReceiptLink('${receiptURL}')"><span class="sb-icon">🔗</span>Copy</button>
      </div>
    </div>`;
  setTimeout(()=>{ const el=document.getElementById('od-qr-canvas'); if(el&&typeof QRCode!=='undefined') new QRCode(el,{text:receiptURL,width:68,height:68,colorDark:'#1A1208',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M}); },150);
}
function closeOrderDetail(){ document.getElementById('order-detail-overlay').classList.remove('show'); currentOrderDetail=null; }
function refundFromDetail(){ if(!currentOrderDetail) return; closeOrderDetail(); openRefundModal(currentOrderDetail.id,currentOrderDetail.order_number,currentOrderDetail.total); }
function openRefundModal(id,num,total){ pendingRefundId=id; document.getElementById('refund-modal-sub').textContent=`Refund order #${num} for ₹${Number(total).toFixed(2)}?`; document.getElementById('refund-modal').classList.add('show'); }
function closeRefundModal(){ document.getElementById('refund-modal').classList.remove('show'); pendingRefundId=null; }
async function confirmRefund(){
  if(!pendingRefundId) return;
  const {error}=await sb.from('orders').update({status:'refunded'}).eq('id',pendingRefundId);
  if(error){ showToast('Refund failed'); return; }
  closeRefundModal(); renderHistory(); showToast('Refund issued ✓');
}

// ══ PRODUCTS ══
async function renderProductList(){
  const list = document.getElementById('prod-list');
  if (!list) return;
  const filter = _prodCatFilter || 'all';
  const filtered = filter === 'all' ? products : products.filter(p => String(p.catId) === filter);
  list.innerHTML = '';
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="es-ic">🍽️</div><p>No products found.</p></div>';
    return;
  }
  // Group by category
  const groupMap = {};
  filtered.forEach(p => {
    const key = p.catId || 'none';
    if (!groupMap[key]) groupMap[key] = { name: p.catName||'Uncategorised', icon: p.catIcon||'', items: [] };
    groupMap[key].items.push(p);
  });
  Object.values(groupMap).forEach(grp => {
    // Group header
    const hd = document.createElement('div');
    hd.className = 'prod-group-head';
    hd.dataset.groupname = grp.name;
    const hdSpan = document.createElement('span');
    hdSpan.textContent = (grp.icon ? grp.icon + ' ' : '') + grp.name;
    const hdLabel = document.createElement('label');
    hdLabel.style.cssText = 'font-size:11px;color:var(--muted);cursor:pointer;display:flex;align-items:center;gap:4px';
    const hdCb = document.createElement('input');
    hdCb.type = 'checkbox';
    hdCb.style.accentColor = 'var(--brand)';
    hdCb.addEventListener('change', (function(g){ return function(e){ selectAllInGroup(e.target, g.name, g.items); }; })(grp));
    hdLabel.appendChild(hdCb);
    hdLabel.appendChild(document.createTextNode(' Select all'));
    hd.appendChild(hdSpan);
    hd.appendChild(hdLabel);
    list.appendChild(hd);
    // Product items
    grp.items.forEach(p => {
      const row = document.createElement('div');
      row.className = 'prod-item' + (p.out_of_stock ? ' oos' : '');
      row.dataset.prodid = p.id;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'prod-select-cb';
      cb.style.cssText = 'accent-color:var(--brand);margin-right:8px;flex-shrink:0';
      cb.checked = _selectedProds.has(p.id);
      cb.addEventListener('change', (function(pid){ return function(){ toggleProdSelect(pid, this); }; })(p.id));
      const icon = document.createElement('div');
      icon.className = 'pi-icon';
      icon.textContent = p.icon || '';
      const info = document.createElement('div');
      info.className = 'pi-info';
      info.innerHTML = '<div class="pi-name">' + p.name + (p.out_of_stock ? '<span class="oos-tag">OOS</span>' : '') + '</div>' +
        '<div class="pi-meta">' + (p.catIcon||'') + ' ' + (p.catName||'') + ' · ₹' + Number(p.price).toFixed(2) + '</div>';
      const price = document.createElement('div');
      price.className = 'pi-price';
      price.textContent = '₹' + Number(p.price).toFixed(2);
      const actions = document.createElement('div');
      actions.className = 'pi-actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', (function(pid){ return function(){ editProduct(pid); }; })(p.id));
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn del';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', (function(pid){ return function(){ deleteProduct(pid); }; })(p.id));
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      row.appendChild(cb);
      row.appendChild(icon);
      row.appendChild(info);
      row.appendChild(price);
      row.appendChild(actions);
      list.appendChild(row);
    });
  });
}
function newProduct(){ editingProductId=null; editingIngredients=[]; editingIcon='🍔'; document.getElementById('prod-modal-title').textContent='Add Product'; renderProdModalBody(null); document.getElementById('prod-editor-overlay').classList.add('show'); }
function editProduct(id){ const p=products.find(x=>x.id===id); if(!p) return; editingProductId=id; editingIngredients=[...(p.ingredients||[])]; editingIcon=p.icon; document.getElementById('prod-modal-title').textContent='Edit Product'; renderProdModalBody(p); document.getElementById('prod-editor-overlay').classList.add('show'); }
function closeProdEditor(){ document.getElementById('prod-editor-overlay').classList.remove('show'); editingProductId=null; }
function renderProdModalBody(p){
  document.getElementById('prod-modal-body').innerHTML=`
    <div class="form-row">
      <div class="form-group" style="margin-bottom:0"><label class="form-label">Name</label><input class="form-input" id="pe-name" placeholder="Classic Smash" value="${p?p.name:''}"/></div>
      <div class="form-group" style="margin-bottom:0"><label class="form-label">Price (₹)</label><input class="form-input" id="pe-price" type="number" min="0" step="0.5" placeholder="0.00" value="${p?p.price:''}"/></div>
    </div>
    <div class="form-group" style="margin-top:14px"><label class="form-label">Category</label>
      <select class="form-input" id="pe-cat">${categories.map(c=>`<option value="${c.id}"${p&&p.category_id===c.id?' selected':''}>${c.icon} ${c.name}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label class="form-label">Icon</label>
      <div class="icon-picker" id="prod-icon-picker">${FOOD_ICONS.map(ic=>`<div class="ip-opt${ic===editingIcon?' selected':''}" onclick="selectProdIcon('${ic}')">${ic}</div>`).join('')}</div>
    </div>
    <div class="form-group"><label class="form-label">Ingredients</label>
      <div class="ing-list" id="ing-list">${renderIngTags()}</div>
      <div class="ing-add"><input id="ing-input" placeholder="Add ingredient…" onkeydown="if(event.key==='Enter')addIngredient()"/><button onclick="addIngredient()">+ Add</button></div>
    </div>
    <div class="form-group"><div class="toggle-row"><span class="toggle-label">Out of Stock</span><button class="toggle${p&&p.out_of_stock?' on':''}" id="oos-toggle" onclick="this.classList.toggle('on')"></button></div></div>`;
}
function renderIngTags(){ return editingIngredients.map((ing,i)=>`<div class="ing-tag">${ing}<button onclick="removeIng(${i})">×</button></div>`).join(''); }
function removeIng(i){ editingIngredients.splice(i,1); const el=document.getElementById('ing-list'); if(el) el.innerHTML=renderIngTags(); }
function addIngredient(){ const inp=document.getElementById('ing-input'); if(!inp||!inp.value.trim()) return; editingIngredients.push(inp.value.trim()); inp.value=''; const el=document.getElementById('ing-list'); if(el) el.innerHTML=renderIngTags(); }
function selectProdIcon(ic){ editingIcon=ic; document.querySelectorAll('#prod-icon-picker .ip-opt').forEach(el=>el.classList.toggle('selected',el.textContent===ic)); }
async function saveProduct(){
  const name=document.getElementById('pe-name')?.value.trim(),price=parseFloat(document.getElementById('pe-price')?.value),catId=document.getElementById('pe-cat')?.value,oos=document.getElementById('oos-toggle')?.classList.contains('on');
  if(!name||isNaN(price)){ showToast('Please fill name and price'); return; }
  const btn=document.getElementById('prod-save-btn'); btn.disabled=true; btn.innerHTML='<div class="spinner"></div>';
  const {error}=editingProductId?await sb.from('products').update({name,price,category_id:catId,icon:editingIcon,ingredients:editingIngredients,out_of_stock:oos}).eq('id',editingProductId):await sb.from('products').insert({name,price,category_id:catId,icon:editingIcon,ingredients:editingIngredients,out_of_stock:oos});
  btn.disabled=false; btn.textContent='Save Product';
  if(error){ showToast('Save failed: '+error.message); return; }
  closeProdEditor(); await loadProducts(); renderProductList(); buildOrderMenu();
  showToast(editingProductId?'Product updated ✓':'Product added ✓');
}
async function deleteProduct(id){ if(!confirm('Delete this product?')) return; await sb.from('products').delete().eq('id',id); await loadProducts(); renderProductList(); buildOrderMenu(); showToast('Deleted'); }

// ══ CATEGORIES ══
async function renderCatList(){
  await loadCategories();
  const list=document.getElementById('cat-list-mgr');
  if(!categories.length){ list.innerHTML='<div class="empty-state"><div class="es-ic">🏷️</div><p>No categories yet.</p></div>'; return; }
  list.innerHTML=categories.map(c=>{ const count=products.filter(p=>p.category_id===c.id).length;
    return `<div class="cat-item"><div class="ci-icon">${c.icon}</div><div class="ci-info"><div class="ci-name">${c.name}</div><div class="ci-meta">${count} product${count!==1?'s':''}</div></div>
    <div class="pi-actions"><button class="icon-btn" onclick="editCat('${c.id}')">✏️</button><button class="icon-btn del" onclick="deleteCat('${c.id}')">🗑</button></div></div>`;
  }).join('');
}
function newCategory(){ editingCatId=null; editingCatIcon='🏷️'; document.getElementById('cat-modal-title').textContent='Add Category'; renderCatModalBody(null); document.getElementById('cat-editor-overlay').classList.add('show'); }
function editCat(id){ const c=categories.find(x=>x.id===id); if(!c) return; editingCatId=id; editingCatIcon=c.icon; document.getElementById('cat-modal-title').textContent='Edit Category'; renderCatModalBody(c); document.getElementById('cat-editor-overlay').classList.add('show'); }
function closeCatEditor(){ document.getElementById('cat-editor-overlay').classList.remove('show'); editingCatId=null; }
function renderCatModalBody(c){ document.getElementById('cat-modal-body').innerHTML=`
  <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ce-name" placeholder="e.g. Burgers" value="${c?c.name:''}"/></div>
  <div class="form-group"><label class="form-label">Icon</label><div class="icon-picker" id="cat-icon-picker">${FOOD_ICONS.map(ic=>`<div class="ip-opt${ic===editingCatIcon?' selected':''}" onclick="selectCatIcon('${ic}')">${ic}</div>`).join('')}</div></div>`; }
function selectCatIcon(ic){ editingCatIcon=ic; document.querySelectorAll('#cat-icon-picker .ip-opt').forEach(el=>el.classList.toggle('selected',el.textContent===ic)); }
async function saveCat(){
  const name=document.getElementById('ce-name')?.value.trim(); if(!name){ showToast('Please enter a name'); return; }
  const btn=document.getElementById('cat-save-btn'); btn.disabled=true; btn.innerHTML='<div class="spinner"></div>';
  const {error}=editingCatId?await sb.from('categories').update({name,icon:editingCatIcon}).eq('id',editingCatId):await sb.from('categories').insert({name,icon:editingCatIcon});
  btn.disabled=false; btn.textContent='Save Category';
  if(error){ showToast('Save failed'); return; }
  closeCatEditor(); await loadCategories(); await loadProducts(); renderCatList(); buildOrderMenu();
  showToast(editingCatId?'Category updated ✓':'Category added ✓');
}
async function deleteCat(id){ if(products.filter(p=>p.category_id===id).length){ showToast('Remove products first'); return; } if(!confirm('Delete?')) return; await sb.from('categories').delete().eq('id',id); await loadCategories(); renderCatList(); buildOrderMenu(); showToast('Deleted'); }

// ══ CART DRAWER ══
function openCartDrawer(){ document.getElementById('cart-drawer').classList.add('open'); document.getElementById('drawer-overlay').classList.add('open'); }
function closeCartDrawer(){ document.getElementById('cart-drawer').classList.remove('open'); document.getElementById('drawer-overlay').classList.remove('open'); }
