// pos-order.js — order taking, checkout, payment
// ══ ORDER TYPE SYSTEM ════════════════════════════════════════════
let _orderType = 'take';
let _tableNumber = null;
let _selectedPayMethod = 'upi';

function setOrderType(type) {
  _orderType = type;
  _tableNumber = null;
  // Update top bar buttons
  ['dine','take','stall'].forEach(t => {
    const top = document.getElementById('tot-' + t);
    if (top) top.classList.toggle('active', t === type);
    const cart = document.getElementById('ot-' + t);
    if (cart) cart.classList.toggle('active', t === type);
  });
  // Show/hide table picker in top bar
  const topTablePill = document.getElementById('top-table-pill');
  if (topTablePill) topTablePill.style.display = type === 'dine' ? 'flex' : 'none';
  closeTablePicker();
  if (type === 'dine') buildTableNumBtns();
  // Old cart pane table row
  const tr = document.getElementById('table-num-row');
  if (tr) tr.classList.toggle('show', type === 'dine');
  if (type === 'dine') buildTableNumBtns();
  updateCartTitle();
}

function buildTableNumBtns() {
  const tables = loadTableConfig();
  // Populate the dropdown grid
  const grid = document.getElementById('tpd-grid');
  const cartContainer = document.getElementById('table-num-btns');
  if (grid) {
    grid.innerHTML = '';
    tables.forEach((tbl, i) => {
      const n = i + 1;
      const btn = document.createElement('button');
      btn.className = 'tpd-btn' + (_tableNumber == n ? ' active' : '');
      btn.textContent = tbl.name || n;
      btn.onclick = function() {
        _tableNumber = n;
        _tableName = tbl.name || ('Table ' + n);
        grid.querySelectorAll('.tpd-btn').forEach(b => b.classList.toggle('active', b === btn));
        updateCartTitle();
        updateTablePill();
        closeTablePicker();
      };
      grid.appendChild(btn);
    });
  }
  // Also populate cart pane (legacy)
  if (cartContainer) {
    cartContainer.innerHTML = '';
    tables.forEach((tbl, i) => {
      const n = i + 1;
      const btn = document.createElement('button');
      btn.className = 'tnum-btn' + (_tableNumber == n ? ' active' : '');
      btn.textContent = tbl.name || n;
      btn.onclick = function() {
        _tableNumber = n;
        _tableName = tbl.name || ('Table ' + n);
        cartContainer.querySelectorAll('.tnum-btn').forEach(b => b.classList.toggle('active', b === btn));
        updateCartTitle();
        updateTablePill();
      };
      cartContainer.appendChild(btn);
    });
  }
}

function openTablePicker() {
  const drop = document.getElementById('table-picker-drop');
  if (drop) drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
}
function closeTablePicker() {
  const drop = document.getElementById('table-picker-drop');
  if (drop) drop.style.display = 'none';
}
function updateTablePill() {
  const pill = document.getElementById('top-table-pill');
  const label = document.getElementById('top-table-label');
  if (!pill || !label) return;
  if (_tableNumber) {
    label.textContent = _tableName || ('T' + _tableNumber);
    pill.classList.add('selected');
  } else {
    label.textContent = 'Table';
    pill.classList.remove('selected');
  }
}

function loadTableConfig() {
  try {
    const saved = localStorage.getItem('bite_tables_config');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  const count = parseInt(localStorage.getItem('bite_table_count') || '10');
  return Array.from({length: count}, (_, i) => ({ name: 'T' + (i+1) }));
}

function updateCartTitle() {
  const el = document.querySelector('.cart-title');
  if (!el) return;
  if (_orderType === 'dine' && _tableNumber) {
    el.textContent = _tableName || ('Table ' + _tableNumber);
  } else if (_orderType === 'dine') el.textContent = 'Dine In';
  else if (_orderType === 'take') el.textContent = 'Takeaway';
  else el.textContent = 'Stall Order';
}

let _tableName = null;


// ══ 2-STEP CHECKOUT ══════════════════════════════════════════════
function goToStep1() {
  document.getElementById('co-step-1')?.classList.add('active');
  document.getElementById('co-step-2')?.classList.remove('active');
  if (document.getElementById('co-tab-1')) document.getElementById('co-tab-1').className = 'co-step-tab active';
  if (document.getElementById('co-tab-2')) document.getElementById('co-tab-2').className = 'co-step-tab';
}

function goToPaymentStep() {
  const phone = document.getElementById('co-phone')?.value?.trim();
  if (!phone) {
    const el = document.getElementById('co-phone');
    if (el) { el.style.borderColor = 'var(--red)'; el.focus(); }
    showToast('Phone number is required');
    return;
  }
  // Copy summary to step 2
  const s1 = document.getElementById('co-summary');
  const s2 = document.getElementById('co-summary-2');
  if (s2 && s1) s2.innerHTML = s1.innerHTML;
  selectPayMethod(_selectedPayMethod || 'upi');
  document.getElementById('co-step-1')?.classList.remove('active');
  document.getElementById('co-step-2')?.classList.add('active');
  if (document.getElementById('co-tab-1')) document.getElementById('co-tab-1').className = 'co-step-tab done';
  if (document.getElementById('co-tab-2')) document.getElementById('co-tab-2').className = 'co-step-tab active';
}

function selectPayMethod(method) {
  _selectedPayMethod = method;
  ['upi','cash','card','other'].forEach(m => {
    const btn = document.getElementById('pm-' + m);
    if (btn) { btn.classList.toggle('selected', m === method); btn.style.borderColor = ''; }
  });
  const upiWarn = document.getElementById('upi-warn-row');
  const s = loadSettings();
  if (method === 'upi' && !s.upiId) {
    if (document.getElementById('pm-upi')) document.getElementById('pm-upi').style.borderColor = 'var(--amber)';
    if (upiWarn) upiWarn.style.display = 'flex';
  } else {
    if (upiWarn) upiWarn.style.display = 'none';
  }
}

// ══ OVERRIDE openCheckout ════════════════════════════════════════
/* _origOpenCheckout removed — see overrideOpenCheckout below */

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


// ══ ORDER ══
function buildOrderMenu(){
  const strip=document.getElementById('cat-strip-order');
  const secs=document.getElementById('menu-sections-order');
  if(!strip||!secs) return;
  strip.innerHTML=['All',...categories.map(c=>c.name)].map(c=>
    `<button class="cat-btn${c===activeOrderCat?' active':''}" onclick="filterOrderCat('${c.replace(/'/g,"\\'")}')">${c==='All'?'All':(categories.find(x=>x.name===c)?.icon||'')+' '+c}</button>`).join('');
  secs.innerHTML=categories.filter(c=>activeOrderCat==='All'||c.name===activeOrderCat).map(cat=>{
    const prods=products.filter(p=>p.category_id===cat.id);
    if(!prods.length) return '';
    return `<div class="sec-label">${cat.icon} ${cat.name}</div><div class="items-grid">${prods.map(p=>{
      const qty=cart[p.id]?.qty||0,oos=p.out_of_stock;
      const ch=oos?'':(`addToCart('${p.id}')`);
      return `<div class="item-card${qty>0?' in-cart':''}${oos?' out-of-stock':''}" onclick="${ch}">
        ${qty>0?`<div class="cart-dot">${qty}</div>`:''}${oos?'<div class="oos-dot">Out</div>':''}
        <div class="ic">${p.icon}</div><div class="iname">${p.name}</div>
        <div class="idesc">${(p.ingredients||[]).slice(0,2).join(', ')}</div>
        <div class="ifooter"><div class="iprice">₹${Number(p.price).toFixed(2)}</div>
        ${oos?'<span style="font-size:10px;color:var(--faint)">Unavailable</span>':`<button class="add-btn" onclick="addToCart('${p.id}');event.stopPropagation()">+</button>`}
        </div></div>`;
    }).join('')}</div>`;
  }).join('');
}
function filterOrderCat(c){ activeOrderCat=c; buildOrderMenu(); }
function addToCart(id){
  const p=products.find(x=>x.id===id); if(!p) return;
  if(!cart[id]) cart[id]={...p,qty:0};
  cart[id].qty++; updateCart(); buildOrderMenu(); showToast(p.name+' added');
}
function changeCartQty(id,d){
  if(!cart[id]) return; cart[id].qty+=d;
  if(cart[id].qty<=0) delete cart[id];
  updateCart(); buildOrderMenu();
}
function getTax(){ return loadSettings().taxRate/100; }
function cartRowsHTML(){
  const entries=Object.values(cart);
  if(!entries.length) return '<div class="cart-empty"><span style="font-size:26px">🛒</span>Tap items to add</div>';
  return entries.map(i=>`<div class="cart-row">
    <div class="cr-info"><div class="cr-name">${i.name}</div><div class="cr-price">₹${Number(i.price).toFixed(2)} each</div></div>
    <div class="qty-ctrl"><button class="qb" onclick="changeCartQty('${i.id}',-1)">−</button><span class="qn">${i.qty}</span><button class="qb" onclick="changeCartQty('${i.id}',1)">+</button></div>
    <div class="cr-total">₹${(i.price*i.qty).toFixed(2)}</div></div>`).join('');
}
function updateCart(){
  const entries=Object.values(cart);
  const count=entries.reduce((s,i)=>s+i.qty,0);
  const sub=entries.reduce((s,i)=>s+i.price*i.qty,0);
  const tax=sub*getTax(); const total=sub+tax;
  const html=cartRowsHTML();
  const d1=document.getElementById('cart-items-desk'); if(d1) d1.innerHTML=html;
  const d2=document.getElementById('cart-items-mob'); if(d2) d2.innerHTML=html;
  ['d','m'].forEach(s=>{
    const sub_el=document.getElementById('subtotal-'+s); if(sub_el) sub_el.textContent='₹'+sub.toFixed(2);
    const tax_el=document.getElementById('tax-'+s); if(tax_el) tax_el.textContent='₹'+tax.toFixed(2);
    const tot_el=document.getElementById('total-'+s); if(tot_el) tot_el.textContent='₹'+total.toFixed(2);
    const btn=document.getElementById('pay-btn-'+s); if(btn) btn.disabled=count===0;
  });
  ['cart-count-desk','cart-count-mob','fab-badge'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=count; });
  const fab_tot=document.getElementById('fab-total'); if(fab_tot) fab_tot.textContent='₹'+total.toFixed(2);
  const fab=document.getElementById('fab-wrap'); if(fab&&window.innerWidth<=860) fab.style.display=count>0?'flex':'none';
}
function clearCart(){ cart={}; updateCart(); buildOrderMenu(); }

// ══ CHECKOUT ══
function openCheckout(){
  const entries=Object.values(cart);
  const sub=entries.reduce((s,i)=>s+i.price*i.qty,0);
  const tax=sub*getTax(); const total=sub+tax;
  document.getElementById('co-summary').innerHTML=`
    ${entries.map(i=>`<div class="co-summary-row"><span>${i.qty}× ${i.name}</span><span>₹${(i.price*i.qty).toFixed(2)}</span></div>`).join('')}
    <div class="co-summary-row"><span>Tax (${loadSettings().taxRate}%)</span><span>₹${tax.toFixed(2)}</span></div>
    <div class="co-summary-row total"><span>Total</span><span>₹${total.toFixed(2)}</span></div>`;
  ['co-name','co-email','co-phone'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('checkout-overlay').classList.add('show');
  // Focus email field after short delay
  setTimeout(()=>{ const el=document.getElementById('co-email'); if(el) el.focus(); },200);
}
function closeCheckout(){ document.getElementById('checkout-overlay').classList.remove('show'); }

// ══ PLACE ORDER ══
async function placeOrder(){
  const entries=Object.values(cart); if(!entries.length) return;
  const btn=document.getElementById('co-place-btn');
  btn.disabled=true; btn.innerHTML='<div class="spinner"></div>';
  const sub=entries.reduce((s,i)=>s+i.price*i.qty,0);
  const tax=sub*getTax(); const total=sub+tax;
  const custName=document.getElementById('co-name')?.value.trim();
  const custEmail=document.getElementById('co-email')?.value.trim();
  const custPhone=document.getElementById('co-phone')?.value.trim();
  const { data:orderData, error:orderErr }=await sb.from('orders')
    .insert({ subtotal:sub.toFixed(2),tax:tax.toFixed(2),total:total.toFixed(2),status:'pending',
              tenant_id:window._tenantId||null,
              customer_name:custName||null,customer_email:custEmail||null,customer_phone:custPhone||null,
              kiosk_id:loadSettings().kioskId })
    .select('id,order_number').single();
  if(orderErr){ showToast('Error: '+orderErr.message); btn.disabled=false; btn.textContent='Place Order & Pay →'; return; }
  await sb.from('order_items').insert(entries.map(i=>({
    order_id:orderData.id,product_id:i.id,product_name:i.name,product_icon:i.icon,
    unit_price:Number(i.price).toFixed(2),qty:i.qty
  })));
  btn.disabled=false; btn.textContent='Place Order & Pay →';
  closeCheckout();
    try {
    await sb.from('orders').update({ payment_method:_selectedPayMethod||'upi', order_type:_orderType||'take', table_number:_tableNumber?String(_tableNumber):null }).eq('id', orderData.id);
  } catch(e) {}
  const fullOrder={id:orderData.id,order_number:orderData.order_number,total,subtotal:sub,tax,
    customer_name:custName,customer_email:custEmail,customer_phone:custPhone,items:entries};
  clearCart(); showUpiModal(fullOrder);
}

// ══ UPI ══
// ══ PAYMENT TIMER ══
let _upiTimerInterval=null;
function startUpiTimer(){
  let secs=0;
  const el=document.getElementById('upi-timer-val');
  clearInterval(_upiTimerInterval);
  _upiTimerInterval=setInterval(()=>{
    secs++;
    const m=String(Math.floor(secs/60)).padStart(2,'0');
    const s=String(secs%60).padStart(2,'0');
    if(el) el.textContent=m+':'+s;
  },1000);
}
function stopUpiTimer(){ clearInterval(_upiTimerInterval); _upiTimerInterval=null; }

function showUpiModal(order){
  const {upiId,bizName}=loadSettings();
  const body=document.getElementById('upi-body');
  document.getElementById('upi-overlay').classList.add('show');
  window._pendingOrder=order;
  window._pendingPayMethod='upi';
  if(!upiId){
    body.innerHTML=`<div class="no-upi-msg"><div style="font-size:32px;margin-bottom:10px">⚙️</div>
      <strong>UPI ID not configured</strong><br><br>Order #${order.order_number} placed for ₹${order.total.toFixed(2)}<br><br>
      Go to <strong>Settings</strong> to add your UPI ID.<br><br>
      <button class="upi-cash-btn" onclick="openPayConfirm('cash')">💵 Mark as Cash Payment</button>
      <button class="upi-nopay-btn" onclick="closeUpiModal();showSuccessModal(window._pendingOrder,'pending')">Skip for now</button></div>`;
    return;
  }
  const upiStr=`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(bizName)}&am=${order.total.toFixed(2)}&tn=${encodeURIComponent('Order #'+order.order_number)}&cu=INR`;
  body.innerHTML=`
    <div class="upi-amount">₹${order.total.toFixed(2)}</div>
    <div class="upi-order">Order #${order.order_number}</div>
    <div class="upi-waiting"><span class="upi-waiting-dot"></span> Waiting for payment…</div>
    <div id="sms-status" style="font-size:12px;text-align:center;margin-bottom:4px;min-height:18px;"></div>
    <div class="upi-qr-wrap"><div id="qr-canvas"></div></div>
    <div class="upi-id-label">Scan with any UPI app</div>
    <div class="upi-id-val">${upiId}</div>
    <div class="upi-timer">Waiting: <span id="upi-timer-val">00:00</span></div>
    <button class="upi-done-btn" onclick="openPayConfirm('upi')">
      ✓ Confirm UPI Payment Received
    </button>
    <button class="upi-cash-btn" onclick="openPayConfirm('cash')">
      💵 Accept as Cash Instead
    </button>
    <button class="upi-nopay-btn" onclick="closeUpiModal();showSuccessModal(window._pendingOrder,'pending');autoSendReceipt(window._pendingOrder||{})">
      Save order, collect later
    </button>`;
  startUpiTimer();
  // Start SMS listener for auto-detection
  startSMSListener(order, onSMSPaymentDetected);
  setTimeout(()=>{ const el=document.getElementById('qr-canvas'); if(el&&typeof QRCode!=='undefined') new QRCode(el,{text:upiStr,width:185,height:185,colorDark:'#1A1208',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M}); },100);
}
function closeUpiModal(){ stopUpiTimer(); stopSMSListener(); document.getElementById('upi-overlay').classList.remove('show'); }

// ══ PAYMENT CONFIRM DIALOG ══
function openPayConfirm(method){
  window._pendingPayMethod=method;
  const order=window._pendingOrder;
  const icon=method==='upi'?'📱':'💵';
  const title=method==='upi'?'Confirm UPI Payment':'Confirm Cash Payment';
  const sub=method==='upi'
    ?'Did you receive a payment notification on your UPI app?'
    :'Confirm you have received cash from the customer.';
  document.getElementById('pcc-icon').textContent=icon;
  document.getElementById('pcc-title').textContent=title;
  document.getElementById('pcc-amount').textContent='₹'+order.total.toFixed(2);
  document.getElementById('pcc-sub').textContent=sub;
  document.getElementById('pcc-yes-btn').textContent=method==='upi'?'✓ Yes, I received ₹'+order.total.toFixed(2):'✓ Cash received ₹'+order.total.toFixed(2);
  document.getElementById('pay-confirm-overlay').classList.add('show');
}
function closePayConfirm(){ document.getElementById('pay-confirm-overlay').classList.remove('show'); }
async function confirmPaymentYes(){
  closePayConfirm();
  closeUpiModal();
  const order=window._pendingOrder;
  const method=window._pendingPayMethod||'upi';
  // Update order with payment method
  await sb.from('orders').update({payment_method:method}).eq('id',order.id);
  const finalOrder={...order, payment_method:method};
  showSuccessModal(finalOrder,'paid');
  // Auto-send receipt email the moment payment is confirmed
  autoSendReceipt(finalOrder);
  if (window._pendingOrder) sendWhatsAppReceipt(window._pendingOrder).catch(function(){});
}

// ══ SUCCESS ══
function getReceiptURL(orderId,bizName){ return `${RECEIPT_BASE}?id=${orderId}&biz=${encodeURIComponent(bizName||'BITE.')}`; }
function showSuccessModal(order, payStatus){
  if(!order) return;
  const {bizName}=loadSettings();
  const receiptURL=getReceiptURL(order.id,bizName);
  // Set icon and message based on payment status
  const iconEl=document.getElementById('ss-pay-icon');
  const subEl=document.getElementById('ss-pay-sub');
  if(iconEl){
    if(payStatus==='paid' && order.payment_method==='cash'){ iconEl.textContent='💵'; if(subEl) subEl.textContent='Cash payment received ✓'; }
    else if(payStatus==='paid'){ iconEl.textContent='✅'; if(subEl) subEl.textContent='UPI payment confirmed ✓'; }
    else{ iconEl.textContent='🕐'; if(subEl) subEl.textContent='Order saved — collect payment later.'; }
  }
  document.getElementById('ss-body').innerHTML=`
    <div class="ss-icon" id="ss-pay-icon">✅</div>
    <div class="ss-title">Order Confirmed!</div>
    <div class="ss-sub" id="ss-pay-sub">Payment received and saved.</div>
    <div class="ss-center"><div class="ss-order-badge">#${order.order_number}</div></div>
    <div class="ss-center" style="margin-bottom:12px">
      <div class="ss-qr-wrap"><div id="ss-qr-canvas"></div></div>
      <div class="ss-receipt-url">${receiptURL}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">Customer scans to open receipt</div>
    </div>
    <div class="ss-share-btns">
      <button class="ss-share-btn wa" onclick="shareReceiptWhatsApp('${receiptURL}',${order.order_number},'${order.total.toFixed(2)}','${(order.customer_phone||'')}')">💬 WhatsApp</button>
      <button class="ss-share-btn mail" id="ss-mail-btn" ${!order.customer_email?'disabled':''}
        onclick="sendReceiptEmail('${order.id}',${order.order_number},'${order.total.toFixed(2)}','${(order.customer_email||'')}','${(order.customer_name||'')}','${receiptURL}','${bizName}')">
        ✉️ ${order.customer_email?'Email':'No Email'}</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <a class="ss-share-btn print" href="${PRINT_BASE}?id=${order.id}" target="_blank">🖨️ Print Bill</a>
      <a class="ss-share-btn bills" href="${window.location.origin}/bills.html?biz=${encodeURIComponent(bizName)}" target="_blank">📋 All Bills</a>
    </div>
    <button class="ss-share-btn copy" style="width:100%;margin-bottom:12px" onclick="copyReceiptLink('${receiptURL}')">🔗 Copy Link</button>
    <button class="ss-new-btn" onclick="closeSuccessModal()">Start New Order</button>`;
  document.getElementById('success-overlay').classList.add('show');
  setTimeout(()=>{ const el=document.getElementById('ss-qr-canvas'); if(el&&typeof QRCode!=='undefined') new QRCode(el,{text:receiptURL,width:140,height:140,colorDark:'#1A1208',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M}); },150);
}
function closeSuccessModal(){ document.getElementById('success-overlay').classList.remove('show'); }
function shareReceiptWhatsApp(url,orderNum,total,phone){
  const msg=encodeURIComponent(`Hi! Your order #${orderNum} for ₹${total} is confirmed.\n\nView your receipt:\n${url}`);
  window.open(phone?`https://wa.me/${phone.replace(/\D/g,'')}?text=${msg}`:`https://wa.me/?text=${msg}`,'_blank');
}
function copyReceiptLink(url){
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(()=>showToast('Link copied ✓'));
  else{ const t=document.createElement('textarea');t.value=url;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);showToast('Link copied ✓'); }
}
async function sendReceiptEmail(orderId,orderNum,total,email,name,receiptURL,bizName){
  if(!email){ showToast('No email collected'); return; }
  if(!BREVO_API_KEY){ showToast('Brevo API key not set'); return; }
  const btn=document.getElementById('ss-mail-btn')||document.getElementById('od-mail-btn');
  if(btn){ btn.disabled=true; btn.innerHTML='<div class="spinner" style="width:14px;height:14px"></div>'; }
  const html=`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F9F7F4;font-family:'Helvetica Neue',Arial,sans-serif;"><div style="max-width:460px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);"><div style="background:#1A1208;padding:24px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#fff;">BITE<span style="color:#E8440A;">.</span></div><div style="font-size:32px;font-weight:800;color:#fff;margin:12px 0 4px;">#${orderNum}</div><div style="display:inline-block;background:#EAF4EE;color:#0E5A28;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">✓ Confirmed</div></div><div style="padding:20px 22px;"><p style="font-size:14px;color:#1A1208;margin-bottom:16px;">Hi ${name||'there'}! Total: <strong style="color:#E8440A;">₹${total}</strong></p><a href="${receiptURL}" style="display:block;background:#E8440A;color:#fff;text-align:center;padding:13px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:12px;">View Receipt &rarr;</a></div><div style="background:#F9F7F4;padding:12px;text-align:center;border-top:1px solid rgba(0,0,0,0.06);"><div style="font-size:12px;font-weight:700;color:#1A1208;">${bizName||'BITE.'}</div></div></div></body></html>`;
  try{
    const res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':BREVO_API_KEY},body:JSON.stringify({sender:{name:bizName||'BITE.',email:SENDER_EMAIL},to:[{email,name:name||'Customer'}],subject:`Receipt — Order #${orderNum}`,htmlContent:html})});
    if(res.ok){ showToast(`Sent to ${email} ✓`); if(btn){ btn.disabled=false; btn.innerHTML='✉️ Sent ✓'; } }
    else{ showToast('Email failed'); if(btn){ btn.disabled=false; btn.innerHTML='✉️ Email'; } }
  }catch(e){ showToast('Email error'); if(btn){ btn.disabled=false; btn.innerHTML='✉️ Email'; } }
}
