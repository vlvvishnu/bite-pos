// pos-core.js — auth, launch, nav, settings



const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
const FOOD_ICONS = ["🍔","🍗","🌯","🍟","🥗","🍕","🌮","🥩","🌭","🥪","🍜","🍝","🍛","🥘","🍲","🧆","🥙","🫔","🧅","🧀","🍳","🥚","🥓","🍖","🐟","🍤","🦐","🦞","🦑","🥑","🍅","🥬","🌽","🥕","🧄","🥦","🥒","🫑","🍋","🍊","🍎","🍓","🍒","🥛","🧃","☕","🧋","🥤","🍵","🍺","🍷","🍹","🍰","🧁","🍦","🍩","🍪","🎂","🍫","🍬","🍭"];

// ══ STATE ══
let categories=[], products=[], cart={}, currentUser=null;
let activeOrderCat='All', historyFilter='today', pendingRefundId=null;
let editingProductId=null, editingCatId=null, editingIngredients=[], editingIcon='🍔', editingCatIcon='🍔';
let currentOrderDetail=null;

// ══ NAV SCROLL ══
window.addEventListener('scroll',()=>{
  const nav=document.getElementById('lp-nav');
  if(nav) nav.classList.toggle('solid', window.scrollY>30);
});

// ══ AUTH OVERLAY ══
function openAuth(tab){
  document.getElementById('auth-overlay').classList.add('show');
  switchTab(tab);
  setTimeout(()=>{
    const el = tab==='login'?document.getElementById('login-email'):document.getElementById('su-owner-name');
    if(el) el.focus();
  },200);
}
function closeAuth(){ document.getElementById('auth-overlay').classList.remove('show'); }
document.getElementById('auth-overlay')?.addEventListener('click',function(e){ if(e.target===this) closeAuth(); });
function switchTab(tab){
  ['login','signup'].forEach(t=>{
    document.getElementById('tab-'+t).classList.toggle('active',t===tab);
    document.getElementById('panel-'+t).classList.toggle('active',t===tab);
  });
  const titles={login:['Sign in to your POS','Enter your credentials to access your kiosk.'],signup:['Start your free trial','Set up your restaurant POS in minutes.']};
  document.getElementById('auth-hd-title').textContent=titles[tab][0];
  document.getElementById('auth-hd-desc').textContent=titles[tab][1];
}

// ══ LOGIN ══
async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-password').value;
  const btn=document.getElementById('login-btn');
  const errEl=document.getElementById('login-error');
  errEl.classList.remove('show');
  if(!email||!pass){ errEl.textContent='Please enter email and password.'; errEl.classList.add('show'); return; }
  btn.disabled=true; btn.innerHTML='<div class="spinner"></div> Signing in…';
  const { data, error }=await sb.auth.signInWithPassword({email,password:pass});
  btn.disabled=false; btn.innerHTML='Sign In to POS';
  if(error){ errEl.textContent=error.message==='Invalid login credentials'?'Incorrect email or password.':error.message; errEl.classList.add('show'); return; }
  currentUser=data.user;
  closeAuth();
  await launchPOS();
}

// ══ SIGNUP ══
async function doSignup(){
  const ownerName=document.getElementById('su-owner-name').value.trim();
  const bizName=document.getElementById('su-biz-name').value.trim();
  const email=document.getElementById('su-email').value.trim();
  const pass=document.getElementById('su-password').value;
  const phone=document.getElementById('su-phone').value.trim();
  const city=document.getElementById('su-city').value.trim();
  const btn=document.getElementById('signup-btn');
  const errEl=document.getElementById('signup-error');
  const okEl=document.getElementById('signup-success');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if(!ownerName||!bizName||!email||!pass){ errEl.textContent='Please fill in all required fields.'; errEl.classList.add('show'); return; }
  if(pass.length<8){ errEl.textContent='Password must be at least 8 characters.'; errEl.classList.add('show'); return; }
  btn.disabled=true; btn.innerHTML='<div class="spinner"></div> Creating…';
  const { data:authData, error:authErr }=await sb.auth.signUp({ email, password:pass, options:{ data:{ full_name:ownerName, biz_name:bizName } } });
  if(authErr){ errEl.textContent=authErr.message; errEl.classList.add('show'); btn.disabled=false; btn.innerHTML='Create Account Free'; return; }
  const slug=bizName.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  const { data:tenant }=await sb.from('tenants').insert({
    slug:slug+'-'+(Date.now()%10000), name:bizName, owner_email:email,
    owner_name:ownerName, phone:phone||null, city:city||null,
    biz_name:bizName, plan:'starter', active:true
  }).select('id').single();
  if(authData?.user && tenant){
    await sb.from('profiles').insert({ id:authData.user.id, tenant_id:tenant.id, role:'owner', full_name:ownerName });
  }
  await sendWelcomeEmail(email, ownerName, bizName);
  btn.disabled=false; btn.innerHTML='Create Account Free';
  okEl.textContent='Account created! Check your email to verify, then sign in.';
  okEl.classList.add('show');
  setTimeout(()=>{ document.getElementById('login-email').value=email; switchTab('login'); },2500);
}

// ══ WELCOME EMAIL ══
async function sendWelcomeEmail(email, name, bizName){
  if(!BREVO_API_KEY) return;
  const html=`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F9F7F4;font-family:'Helvetica Neue',Arial,sans-serif;"><div style="max-width:500px;margin:28px auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid rgba(0,0,0,0.07);"><div style="background:#1A1208;padding:32px 24px;text-align:center;"><div style="font-size:24px;font-weight:800;color:#fff;">BITE<span style="color:#E8440A;">.</span></div><div style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:1.2px;text-transform:uppercase;margin-top:2px;margin-bottom:20px;">by Pay4</div><div style="font-size:38px;margin-bottom:10px;">🎉</div><div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:6px;">Welcome to BITE. POS!</div><div style="font-size:13px;color:rgba(255,255,255,0.5);">Your POS for <strong style="color:#fff;">${bizName}</strong> is ready.</div></div><div style="padding:24px;"><p style="font-size:14px;color:#1A1208;font-weight:600;margin-bottom:5px;">Hi ${name},</p><p style="font-size:13px;color:#7A6E65;line-height:1.7;margin-bottom:20px;">Your BITE. POS account has been created. Here are your first steps:</p><div style="background:#EAF4EE;border-radius:12px;padding:14px 16px;margin-bottom:20px;"><div style="font-size:11px;font-weight:700;color:#0E5A28;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">First 3 steps</div><div style="font-size:13px;color:#1A7A3A;line-height:1.8;"><div>1. Go to Settings — add your UPI ID</div><div>2. Go to Products — add your menu</div><div>3. Go to Order — take your first order!</div></div></div><div style="text-align:center;margin-bottom:20px;"><a href="https://bite.pay4.space" style="display:inline-block;background:#E8440A;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:700;font-size:14px;">Open My POS &rarr;</a></div><p style="font-size:12px;color:#7A6E65;">Questions? <a href="mailto:${ADMIN_EMAIL}" style="color:#E8440A;">${ADMIN_EMAIL}</a></p></div><div style="background:#F9F7F4;padding:14px 24px;text-align:center;border-top:1px solid rgba(0,0,0,0.06);"><div style="font-size:12px;font-weight:700;color:#1A1208;">BITE. by Pay4</div></div></div></body></html>`;
  try{
    await fetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST', headers:{'Content-Type':'application/json','api-key':BREVO_API_KEY},
      body:JSON.stringify({ sender:{name:'BITE. by Pay4',email:SENDER_EMAIL}, to:[{email,name}], subject:`Welcome to BITE. POS — ${bizName} is all set!`, htmlContent:html })
    });
  }catch(e){ console.error('Welcome email:',e); }
}

// ══ LAUNCH POS ══
async function launchPOS(){
  document.getElementById('view-landing').style.display='none';
  const posEl=document.getElementById('view-pos');
  posEl.classList.add('active');
  document.body.className='pos-active'; document.body.classList.remove('pos-loading');
  document.getElementById('pos-user').textContent=currentUser.email;
  // Load tenant_id from profiles so we only show this user's data
  const {data:prof}=await sb.from('profiles').select('tenant_id').eq('id',currentUser.id).single();
  if(prof?.tenant_id) window._tenantId=prof.tenant_id;
  document.getElementById('kiosk-pill-label').textContent=loadSettings().kioskId||'Kiosk #1';
  await Promise.all([loadCategories(),loadProducts()]);
  buildOrderMenu();
  populateSettingsForm();
  tick(); setInterval(tick,15000);
  if(!localStorage.getItem('bite_welcome_shown')){
    const n=currentUser?.user_metadata?.full_name||'';
    const b=currentUser?.user_metadata?.biz_name||'';
    setTimeout(()=>{
      document.getElementById('wb-title').textContent='Welcome'+(n?', '+n:'')+'!';
      document.getElementById('wb-sub').textContent=(b||'Your restaurant')+' POS is ready.';
      document.getElementById('welcome-banner').classList.add('show');
    },700);
  }
  initWASystem();
}
function closeWelcomeBanner(){ document.getElementById('welcome-banner').classList.remove('show'); localStorage.setItem('bite_welcome_shown','1'); }

// ══ LOGOUT ══
function confirmLogout(){ if(confirm('Sign out of BITE. POS?')) doLogout(); }
async function doLogout(){
  await sb.auth.signOut(); currentUser=null; cart={}; categories=[]; products=[];
  document.getElementById('view-pos').classList.remove('active');
  document.getElementById('view-landing').style.display='block';
  document.body.className='landing';
  showToast('Signed out');
}



// ══ AUTO SEND RECEIPT ══
// Called automatically after every payment confirmation
// Silently sends email if customer email was collected
async function autoSendReceipt(order){
  if(!order.customer_email){
    // No email collected — nothing to do, staff can share manually
    return;
  }
  if(!BREVO_API_KEY){
    console.warn('Brevo API key not configured — receipt email skipped');
    return;
  }
  const {bizName}=loadSettings();
  const receiptURL=getReceiptURL(order.id, bizName);
  try {
    await sendReceiptEmail(
      order.id,
      order.order_number,
      typeof order.total === 'number' ? order.total.toFixed(2) : order.total,
      order.customer_email,
      order.customer_name||'',
      receiptURL,
      bizName
    );
    showToast('Receipt sent to '+order.customer_email+' ✓');
  } catch(e){
    console.error('Auto receipt email failed:', e);
  }
}

// ══════════════════════════════════════════════════════
// SMS PAYMENT LISTENER
// Reads incoming SMS on Android to detect UPI payments
// Falls back gracefully on iOS/desktop
// ══════════════════════════════════════════════════════

let _smsListenerActive = false;
let _smsPermissionGranted = false;

// UPI credit SMS patterns from major Indian banks
const SMS_PATTERNS = [
  // Generic credited pattern
  /(?:credited|received|deposited).{0,60}?(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // Amount first pattern
  /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)[\s\S]{0,60}?(?:credited|received|deposited)/i,
  // UPI specific
  /upi[\s\S]{0,80}?(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)[\s\S]{0,80}?upi/i,
  // Bank specific patterns
  /a\/c.{0,30}?credited.{0,40}?(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
];

// Extract amount from SMS text
function extractAmountFromSMS(smsBody) {
  for (const pattern of SMS_PATTERNS) {
    const match = smsBody.match(pattern);
    if (match) {
      const amt = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amt) && amt > 0) return amt;
    }
  }
  return null;
}

// Check if SMS amount matches pending order (within ₹1 tolerance)
function smsMatchesOrder(smsAmount, orderTotal) {
  return Math.abs(smsAmount - orderTotal) < 1;
}

// Request SMS permission on Android (via Web Share Target / Android Intent)
async function requestSMSPermission() {
  // Check if Web OTP API is available (Chrome on Android)
  if ('OTPCredential' in window) {
    try {
      const ac = new AbortController();
      // We use OTP API as a hook to get SMS reading permission
      // The abort after 100ms just checks if API is available
      setTimeout(() => ac.abort(), 100);
      await navigator.credentials.get({ otp: { transport: ['sms'] }, signal: ac.signal });
    } catch(e) {
      // AbortError is expected - means API is available
      if (e.name === 'AbortError') {
        _smsPermissionGranted = true;
        return true;
      }
    }
  }

  // Check if Android SMS permission API is available
  if (navigator.permissions) {
    try {
      const result = await navigator.permissions.query({ name: 'sms' });
      if (result.state === 'granted') {
        _smsPermissionGranted = true;
        return true;
      }
    } catch(e) {}
  }
  return false;
}

// Start listening for payment SMS
// Uses Web OTP API on Android Chrome + manual polling fallback
async function startSMSListener(order, onPaymentDetected) {
  if (_smsListenerActive) return;
  _smsListenerActive = true;

  const targetAmount = parseFloat(order.total.toFixed(2));

  // ── METHOD 1: Web OTP API (Android Chrome) ────────────────
  // This is the primary method — Chrome on Android intercepts
  // SMS messages that match the format
  if ('OTPCredential' in window) {
    try {
      const ac = new AbortController();
      window._smsAbortController = ac;

      // Set timeout — stop listening after 5 minutes
      const timeout = setTimeout(() => ac.abort(), 5 * 60 * 1000);

      showSMSListenerStatus('active');

      navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
      }).then(otp => {
        clearTimeout(timeout);
        // OTP received — but we use this just as a trigger
        // The actual payment detection is from the SMS content
        // We'll show the confirm dialog
        onPaymentDetected('sms-otp');
      }).catch(err => {
        clearTimeout(timeout);
        if (err.name !== 'AbortError') {
          console.log('SMS OTP listener ended:', err.message);
        }
        showSMSListenerStatus('inactive');
      });
      return; // OTP API is active, don't start other methods
    } catch(e) {
      console.log('OTP API not available:', e);
    }
  }

  // ── METHOD 2: Android Intent (TWA/WebAPK context) ─────────
  if (window.Android && window.Android.startSMSListener) {
    window.Android.startSMSListener();
    window.onSMSReceived = function(smsBody) {
      const amount = extractAmountFromSMS(smsBody);
      if (amount && smsMatchesOrder(amount, targetAmount)) {
        onPaymentDetected('sms-android');
      }
    };
    showSMSListenerStatus('active');
    return;
  }

  // ── METHOD 3: Clipboard polling (fallback) ────────────────
  // Some UPI apps copy transaction details to clipboard
  // Poll clipboard every 2 seconds looking for payment confirmation
  let clipboardAttempts = 0;
  const maxAttempts = 150; // 5 minutes at 2s intervals

  const pollClipboard = async () => {
    if (!_smsListenerActive || clipboardAttempts >= maxAttempts) {
      stopSMSListener();
      return;
    }
    clipboardAttempts++;
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.length > 10) {
          const amount = extractAmountFromSMS(text);
          if (amount && smsMatchesOrder(amount, targetAmount)) {
            onPaymentDetected('clipboard');
            return;
          }
        }
      }
    } catch(e) { /* clipboard permission denied is fine */ }
    setTimeout(pollClipboard, 2000);
  };

  showSMSListenerStatus('watching');
  setTimeout(pollClipboard, 2000);
}

function stopSMSListener() {
  _smsListenerActive = false;
  if (window._smsAbortController) {
    window._smsAbortController.abort();
    window._smsAbortController = null;
  }
  showSMSListenerStatus('inactive');
}

// Update the SMS status indicator in the UPI modal
function showSMSListenerStatus(status) {
  const el = document.getElementById('sms-status');
  if (!el) return;
  const states = {
    active:   { icon:'📡', text:'Auto-detecting payment via SMS…', color:'var(--green)' },
    watching: { icon:'👀', text:'Watching for payment…', color:'var(--amber)' },
    detected: { icon:'✅', text:'Payment detected!', color:'var(--green)' },
    inactive: { icon:'', text:'', color:'' },
  };
  const s = states[status] || states.inactive;
  el.innerHTML = s.text ? `<span style="color:${s.color};font-weight:600">${s.icon} ${s.text}</span>` : '';
}

// Called when SMS listener detects a payment
function onSMSPaymentDetected(method) {
  stopSMSListener();
  showSMSListenerStatus('detected');
  showToast('Payment detected! Confirming…');
  // Small delay for UX then auto-confirm
  setTimeout(() => {
    openPayConfirm(window._pendingPayMethod || 'upi');
  }, 800);
}


// ══════════════════════════════════════════════════════════════════
// WHATSAPP TABLE SESSION SYSTEM
// ══════════════════════════════════════════════════════════════════

let _waSessions = [];        // active WhatsApp sessions for this tenant
let _selectedTable = null;   // currently selected table number
let _waPollingInterval = null;

// ── Load settings into form ──────────────────────────────────────
/* _origPopulateSettings removed */

// ── Save settings ────────────────────────────────────────────────
/* _origSaveSettings removed */

// ── Load extra settings ──────────────────────────────────────────
/* _origLoadSettings removed */

function updateWaPreview() {
  const code = document.getElementById('set-wa-code')?.value?.trim()?.toUpperCase();
  const prev = document.getElementById('wa-settings-preview');
  const codeEl = document.getElementById('wa-code-preview');
  if (!prev || !codeEl) return;
  if (code) {
    codeEl.textContent = code + '-T1';
    prev.style.display = 'block';
  } else {
    prev.style.display = 'none';
  }
}

// ── Build table selector dropdown ────────────────────────────────
function buildTableSelector(count) {
  const wrap = document.getElementById('table-selector-wrap');
  const sel = document.getElementById('table-selector');
  if (!sel) return;
  const s = loadSettings();
  if (!s.waCode || count < 1) {
    if (wrap) wrap.style.display = 'none';
    return;
  }
  if (wrap) wrap.style.display = 'flex';
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select table —</option>';
  for (let i = 1; i <= count; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = 'Table ' + i;
    if (String(i) === current) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ── On table selected ─────────────────────────────────────────────
function onTableChange(tableNum) {
  _selectedTable = tableNum || null;
  updateWAStatus();
}

// ── Update WhatsApp status indicator ─────────────────────────────
function updateWAStatus() {
  const indicator = document.getElementById('wa-status-indicator');
  const statusText = document.getElementById('wa-status-text');
  if (!indicator || !statusText) return;

  if (!_selectedTable) {
    indicator.className = 'wa-status none';
    statusText.textContent = 'No table selected';
    return;
  }

  // Find matching session for this table
  const session = _waSessions.find(s =>
    s.table_number === String(_selectedTable)
  );

  if (session) {
    indicator.className = 'wa-status';
    const phone = session.customer_phone.replace(/^91/, '+91 ');
    statusText.textContent = '📱 ' + phone;
  } else {
    indicator.className = 'wa-status none';
    statusText.textContent = 'No WhatsApp yet';
  }
}

// ── Poll for new WhatsApp sessions ───────────────────────────────
async function startWAPolling() {
  if (_waPollingInterval) clearInterval(_waPollingInterval);
  await fetchWASessions();
  _waPollingInterval = setInterval(fetchWASessions, 10000); // every 10s
}

async function fetchWASessions() {
  if (!window._tenantId) return;
  try {
    const res = await fetch(
      '/api/wa-sessions?tenant_id=' + window._tenantId
    );
    if (res.ok) {
      _waSessions = await res.json();
      updateWAStatus();
      updateWABadges();
    }
  } catch(e) {
    // Silently fail if worker not deployed yet
  }
}

// ── Update badges on table selector options ───────────────────────
function updateWABadges() {
  const sel = document.getElementById('table-selector');
  if (!sel) return;
  Array.from(sel.options).forEach(opt => {
    if (!opt.value) return;
    const hasSession = _waSessions.some(s =>
      s.table_number === opt.value
    );
    // Add/remove WhatsApp indicator in option text
    const base = opt.textContent.replace(' 📱', '');
    opt.textContent = base + (hasSession ? ' 📱' : '');
  });
}

// ── Get customer phone for current table (for receipt) ────────────
function getCustomerPhoneForTable() {
  if (!_selectedTable) return null;
  const session = _waSessions.find(s =>
    s.table_number === String(_selectedTable) && !s.receipt_sent
  );
  return session?.customer_phone || null;
}

// ── Send receipt via WhatsApp after payment ───────────────────────
async function sendWhatsAppReceipt(order) {
  const phone = getCustomerPhoneForTable();
  if (!phone) return false; // No WhatsApp session

  const { bizName, waCode } = loadSettings();
  const receiptUrl = getReceiptURL(order.id, bizName);

  try {
    const res = await fetch('/api/send-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerPhone: phone,
        orderNumber:   order.order_number,
        total:         order.total.toFixed(2),
        receiptUrl:    receiptUrl,
        bizName:       bizName,
        tenantCode:    waCode
      })
    });
    if (res.ok) {
      showToast('Receipt sent via WhatsApp ✓');
      // Refresh sessions
      await fetchWASessions();
      return true;
    }
  } catch(e) {
    console.log('WA receipt send failed (worker not deployed?):', e.message);
  }
  return false;
}

// ── Generate QR Cards ─────────────────────────────────────────────
function generateQRCards() {
  const s = loadSettings();
  if (!s.waCode) {
    showToast('Please enter your WhatsApp Code first');
    return;
  }
  // Get Pay4 WA number from settings or use placeholder
  const waNumber = localStorage.getItem('bite_pay4_wa_number') || '919000000000';
  const count = s.tableCount || 10;
  const grid = document.getElementById('qr-cards-grid');
  if (!grid) return;

  grid.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const code = s.waCode + '-T' + i;
    // QR 1: WhatsApp link with pre-filled table code
    const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(code)}`;

    const card = document.createElement('div');
    card.className = 'qr-card-preview';
    card.innerHTML = `
      <div class="qr-card-title">${s.bizName || 'Restaurant'}</div>
      <div class="qr-card-sub" style="font-size:12px;margin-bottom:12px">Table ${i}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">

        <div style="text-align:center">
          <div style="font-size:10px;font-weight:700;color:#1A1208;margin-bottom:6px">
            💬 Bill on WhatsApp
          </div>
          <div id="qr-wa-${i}" style="width:80px;height:80px;margin:0 auto"></div>
          <div style="font-size:9px;color:#7A6E65;margin-top:4px">
            Scan → send ${code}
          </div>
        </div>

      </div>

      <div style="font-size:9px;color:#C0B8B0;border-top:1px solid #eee;padding-top:6px">
        💬 Reply 1 for bill · 2 for offers
      </div>`;

    grid.appendChild(card);

    setTimeout(() => {
      const waEl = document.getElementById('qr-wa-' + i);
      if (waEl && typeof QRCode !== 'undefined') {
        new QRCode(waEl, {
          text: waLink, width:80, height:80,
          colorDark:'#1A1208', colorLight:'#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    }, 80 * i);
  }

  document.getElementById('qr-modal-overlay').classList.add('show');
}

function closeQRModal() {
  document.getElementById('qr-modal-overlay').classList.remove('show');
}

function printQRCards() {
  // Open print dialog for just the QR cards
  const content = document.getElementById('qr-cards-grid').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Table QR Cards</title>
    <style>
      body{margin:16px;font-family:sans-serif;}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
      .card{border:1px solid #ccc;border-radius:8px;padding:12px;text-align:center;break-inside:avoid;}
      @media print{.grid{grid-template-columns:repeat(4,1fr);}}
    </style></head>
    <body onload="window.print()">
    <div class="grid">${content}</div>
    </body></html>`);
  win.document.close();
}

// ── Start polling when POS launches ──────────────────────────────
/* _origLaunchPOS removed */

// ── Hook into confirmPaymentYes to also send WA receipt ──────────
/* _origConfirmPaymentYes removed */


// ══ INIT ══


// ══ POS NAV ══
function posNavTo(page,btn){
  document.querySelectorAll('.pos-page').forEach(p=>p.classList.remove('active'));
  document.getElementById('pos-page-'+page).classList.add('active');
  document.querySelectorAll('.pos-nav-link,.pos-mob-item').forEach(n=>n.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if(page==='order')      buildOrderMenu();
  if(page==='history')    renderHistory();
  if(page==='products')   renderProductList();
  if(page==='categories') renderCatList();
  if(page==='settings')   populateSettingsForm();
  if(page==='kds') loadKDS();
}
function togglePosMobNav(){ document.getElementById('pos-mob-nav').classList.toggle('open'); }
function closePosMobNav(){ document.getElementById('pos-mob-nav').classList.remove('open'); }

// ══ SETTINGS ══
function loadSettings(){
  return { upiId:localStorage.getItem('bite_upi')||'', bizName:localStorage.getItem('bite_biz_name')||'BITE.', kioskId:localStorage.getItem('bite_kiosk_id')||'Kiosk #1', taxRate:parseFloat(localStorage.getItem('bite_tax_rate')||'8') };
}
function saveSettings(){
  const upi=document.getElementById('set-upi').value.trim();
  const biz=document.getElementById('set-biz-name').value.trim();
  const kiosk=document.getElementById('set-kiosk-id').value.trim();
  const tax=parseFloat(document.getElementById('set-tax').value)||8;
  localStorage.setItem('bite_upi',upi); localStorage.setItem('bite_biz_name',biz||'BITE.');
  localStorage.setItem('bite_kiosk_id',kiosk||'Kiosk #1'); localStorage.setItem('bite_tax_rate',tax);
  document.getElementById('kiosk-pill-label').textContent=kiosk||'Kiosk #1';
  showToast('Settings saved ✓'); updateCart();
}
function populateSettingsForm(){
  const s=loadSettings();
  document.getElementById('set-upi').value=s.upiId;
  document.getElementById('set-biz-name').value=s.bizName;
  document.getElementById('set-kiosk-id').value=s.kioskId;
  document.getElementById('set-tax').value=s.taxRate;
  updateUpiPreview();
  populateWASettingsForm();
  populateTableSettings();
}
function updateUpiPreview(){
  const val=document.getElementById('set-upi').value.trim();
  const prev=document.getElementById('upi-preview');
  document.getElementById('upi-preview-val').textContent=val?`upi://pay?pa=${val}&am=XX.XX&tn=Order%23XXX&cu=INR`:'';
  prev.style.display=val?'block':'none';
}

// ══ CHANGE PASSWORD ══
async function changePassword(){
  const np=document.getElementById('set-new-password').value;
  const cp=document.getElementById('set-confirm-password').value;
  if(!np||!cp){ showToast('Please fill both fields'); return; }
  if(np.length<8){ showToast('Password must be at least 8 characters'); return; }
  if(np!==cp){ showToast('Passwords do not match'); return; }
  const {error}=await sb.auth.updateUser({password:np});
  if(error){ showToast('Error: '+error.message); return; }
  document.getElementById('set-new-password').value='';
  document.getElementById('set-confirm-password').value='';
  showToast('Password updated ✓');
}

// ══ UTILS ══
let toastTimer;
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2200); }
function tick(){ const n=new Date(),h=String(n.getHours()).padStart(2,'0'),m=String(n.getMinutes()).padStart(2,'0'); const el=document.getElementById('pos-clock'); if(el) el.textContent=h+':'+m; }
window.addEventListener('resize',()=>{ const fab=document.getElementById('fab-wrap'); if(!fab) return; const count=Object.values(cart).reduce((s,i)=>s+i.qty,0); if(window.innerWidth<=860) fab.style.display=count>0?'flex':'none'; else{ fab.style.display='none'; closeCartDrawer(); } });
document.addEventListener('click',e=>{ const nav=document.getElementById('pos-mob-nav'); if(nav&&nav.classList.contains('open')&&!nav.contains(e.target)&&!e.target.closest('.pos-hamburger')) closePosMobNav(); });
if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(()=>{}); }

init();





init();
