// ╔══════════════════════════════════════════════════════════════════╗
// ║  BITE. POS — Cloudflare Worker                                  ║
// ║  Handles: BREVO_KEY injection + Meta WhatsApp webhook           ║
// ║  Deploy: add this as _worker.js in your GitHub repo root        ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// Environment variables to set in Cloudflare Pages:
//   BREVO_API_KEY          — your Brevo API key
//   META_VERIFY_TOKEN      — any random string e.g. "bite_pos_2024"
//   META_ACCESS_TOKEN      — WhatsApp Cloud API permanent token
//   META_PHONE_NUMBER_ID   — your WhatsApp Business phone number ID
//   SUPABASE_URL           — your Supabase project URL
//   SUPABASE_SERVICE_KEY   — Supabase service role key (not anon!)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Inject Brevo key into HTML ──────────────────────────────────
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const response = await env.ASSETS.fetch(request);
      const html = await response.text();
      const injected = html.replace(
        "window.__BREVO_KEY__ || ''",
        `'${env.BREVO_API_KEY || ''}'`
      );
      return new Response(injected, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    // ── Meta WhatsApp Webhook verification (GET) ────────────────────
    if (url.pathname === '/webhook/whatsapp' && request.method === 'GET') {
      const mode      = url.searchParams.get('hub.mode');
      const token     = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // ── Meta WhatsApp Webhook incoming messages (POST) ──────────────
    if (url.pathname === '/webhook/whatsapp' && request.method === 'POST') {
      try {
        const body = await request.json();
        await handleIncomingWhatsApp(body, env);
        return new Response('OK', { status: 200 });
      } catch (e) {
        console.error('Webhook error:', e);
        return new Response('OK', { status: 200 }); // Always 200 to Meta
      }
    }

    // ── Send receipt via WhatsApp ───────────────────────────────────
    if (url.pathname === '/api/send-receipt' && request.method === 'POST') {
      try {
        const { customerPhone, orderNumber, total, receiptUrl,
                bizName, tenantCode } = await request.json();

        if (!customerPhone || !orderNumber) {
          return new Response(JSON.stringify({ error: 'Missing params' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const result = await sendWhatsAppMessage(env, customerPhone, {
          type: 'receipt',
          orderNumber, total, receiptUrl, bizName, tenantCode
        });

        // Mark receipt sent in Supabase
        await updateSessionReceiptSent(env, customerPhone);

        return new Response(JSON.stringify({ success: true, result }),
          { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ── Get active WhatsApp sessions for a tenant ───────────────────
    if (url.pathname === '/api/wa-sessions' && request.method === 'GET') {
      try {
        const tenantId = url.searchParams.get('tenant_id');
        if (!tenantId) return new Response('[]',
          { headers: { 'Content-Type': 'application/json' } });

        const sessions = await getActiveSessions(env, tenantId);
        return new Response(JSON.stringify(sessions),
          { headers: { 'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*' } });
      } catch (e) {
        return new Response('[]',
          { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ── CORS preflight ──────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // ── Default: serve static assets ───────────────────────────────
    return env.ASSETS.fetch(request);
  }
};

// ══════════════════════════════════════════════════════════════════
// Handle incoming WhatsApp message from Meta webhook
// ══════════════════════════════════════════════════════════════════
async function handleIncomingWhatsApp(body, env) {
  const entry    = body.entry?.[0];
  const changes  = entry?.changes?.[0];
  const value    = changes?.value;
  const messages = value?.messages;

  if (!messages || messages.length === 0) return;

  const msg           = messages[0];
  const fromPhone     = msg.from;           // e.g. "919876543210"
  const msgText       = msg.text?.body?.trim()?.toUpperCase() || '';
  const msgId         = msg.id;

  // Mark message as read
  await markMessageRead(env, msgId);

  // Parse tenant code + table from message
  // Expected format: "BB-T3" or "BB-T12" or just "BB"
  // Regex: letters (tenant code) optionally followed by -T + number (table)
  const parsed = parseRestaurantCode(msgText);

  // Handle menu replies: "1" for bill, "2" for offers
  if (msgText === '1' || msgText === '2') {
    await handleMenuReply(fromPhone, msgText, env);
    return;
  }

  if (!parsed) {
    // Unknown code — send generic reply
    await sendWhatsAppMessage(env, fromPhone, {
      type: 'unknown',
      text: msgText
    });
    return;
  }

  const { tenantCode, tableNumber } = parsed;

  // Look up tenant by their WhatsApp code in Supabase
  const tenant = await getTenantByCode(env, tenantCode);

  if (!tenant) {
    await sendWhatsAppMessage(env, fromPhone, {
      type: 'not_found',
      code: tenantCode
    });
    return;
  }

  // Save session to Supabase
  await saveWhatsAppSession(env, {
    tenantId:    tenant.id,
    tenantCode:  tenantCode,
    bizName:     tenant.biz_name || tenant.name,
    customerPhone: fromPhone,
    tableNumber:   tableNumber || null,
    windowOpenedAt: new Date().toISOString()
  });

  // 1. Send warm greeting immediately (FREE — customer initiated)
  await sendWhatsAppMessage(env, fromPhone, {
    type: 'welcome_menu',
    bizName:     tenant.biz_name || tenant.name,
    tableNumber: tableNumber,
    tenantId:    tenant.id
  });

  // 2. Fetch and send their bills (small delay for UX)
  await new Promise(r => setTimeout(r, 1200));
  await sendBillsList(fromPhone, tenant, env);
}


// ══════════════════════════════════════════════════════════════════
// Fetch all orders for this customer+tenant and send as a list
// ══════════════════════════════════════════════════════════════════
async function sendBillsList(fromPhone, tenant, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;

  const bizName   = tenant.biz_name || tenant.name || 'Restaurant';
  const phone     = tenant.phone || '';
  const tenantId  = tenant.id;

  // Get this customer's session to find their orders
  const sessRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/whatsapp_sessions` +
    `?customer_phone=eq.${fromPhone}` +
    `&tenant_id=eq.${tenantId}` +
    `&order=window_opened_at.desc&limit=5`,
    { headers: supabaseHeaders(env) }
  );
  const sessions = await sessRes.json() || [];

  // Collect all order IDs linked to this customer's sessions
  const orderIds = sessions
    .map(s => s.order_id)
    .filter(Boolean);

  let orders = [];

  // Also search orders by customer_phone directly (if collected at checkout)
  const cleanPhone = fromPhone.replace(/^91/, '');  // strip country code for search
  const ordersRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders` +
    `?tenant_id=eq.${tenantId}` +
    `&or=(customer_phone.eq.${fromPhone},customer_phone.eq.+91${cleanPhone},customer_phone.eq.${cleanPhone})` +
    `&order=created_at.desc&limit=10`,
    { headers: supabaseHeaders(env) }
  );
  const phoneOrders = await ordersRes.json() || [];
  orders = [...phoneOrders];

  // Also get session-linked orders not already in list
  if (orderIds.length > 0) {
    for (const oid of orderIds) {
      if (!orders.find(o => o.id === oid)) {
        const oRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${oid}&limit=1`,
          { headers: supabaseHeaders(env) }
        );
        const oData = await oRes.json();
        if (oData?.[0]) orders.push(oData[0]);
      }
    }
  }

  // Sort by date descending
  orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const receiptBase = 'https://bite.pay4.space/receipt.html';
  const supportPhone = tenant.phone || '';

  if (orders.length === 0) {
    // No orders found — just send contact info
    const msg =
`📋 *Your Bills at ${bizName}*

We couldn't find any orders linked to your number yet.

If you just placed an order, your bill will appear here automatically after payment! 🧾

${supportPhone ?
`📞 *Questions?* Call us: ${supportPhone}` :
`❓ Ask your server for assistance.`}`;

    await sendWhatsAppMessage(env, fromPhone, {
      type: 'bills_list',
      text: msg
    });
    return;
  }

  // Format the bills list
  let billLines = orders.map((o, i) => {
    const date = new Date(o.created_at);
    const dateStr = date.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
    const status = o.status === 'paid' ? '✅' : o.status === 'refunded' ? '↩️' : '⏳';
    const link = `${receiptBase}?id=${o.id}`;
    return `${status} *Order #${o.order_number}*
   ₹${Number(o.total).toFixed(2)} · ${dateStr} ${timeStr}
   🔗 ${link}`;
  }).join('

');

  const totalSpent = orders
    .filter(o => o.status === 'paid')
    .reduce((s, o) => s + Number(o.total), 0);

  const msg =
`🧾 *Your Bills at ${bizName}*
${orders.length} order${orders.length > 1 ? 's' : ''} · Total spent: ₹${totalSpent.toFixed(2)}

${billLines}

${supportPhone ?
`─────────────────
❓ *Grievances or queries?*
📞 Call ${bizName}: *${supportPhone}*

We're happy to help! 😊` :
`─────────────────
❓ Ask your server for any help 😊`}`;

  await sendWhatsAppMessage(env, fromPhone, {
    type: 'bills_list',
    text: msg
  });
}

// ══════════════════════════════════════════════════════════════════
// Handle menu replies: 1 = bill, 2 = offers
// ══════════════════════════════════════════════════════════════════
async function handleMenuReply(fromPhone, choice, env) {
  // Find the most recent open session for this phone
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/whatsapp_sessions` +
    `?customer_phone=eq.${fromPhone}` +
    `&receipt_sent=eq.false` +
    `&order=window_opened_at.desc&limit=1`,
    { headers: supabaseHeaders(env) }
  );
  const sessions = await res.json();
  const session = sessions?.[0];

  if (choice === '1') {
    // Re-send bills list
    if (!session) {
      await sendWhatsAppMessage(env, fromPhone, {
        type: 'text',
        text: "Please scan the QR code at your table first! 🪑"
      });
      return;
    }
    // Get tenant and send full bills list
    const tenantRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${session.tenant_id}&limit=1`,
      { headers: supabaseHeaders(env) }
    );
    const tenants = await tenantRes.json();
    const tenant  = tenants?.[0];
    if (tenant) {
      await sendBillsList(fromPhone, tenant, env);
    }

  } else if (choice === '2') {
    // Offers request
    if (!session) {
      await sendWhatsAppMessage(env, fromPhone, {
        type: 'text',
        text: "Please scan the QR code at your table first to get personalised offers! 🎁"
      });
      return;
    }

    // Get tenant for offers
    const tenantRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${session.tenant_id}&limit=1`,
      { headers: supabaseHeaders(env) }
    );
    const tenants = await tenantRes.json();
    const tenant  = tenants?.[0];
    const bizName = tenant?.biz_name || tenant?.name || 'us';

    await sendWhatsAppMessage(env, fromPhone, {
      type: 'text',
      text:
`🎁 *Offers from ${bizName}*

Here's what we have for you today:

⭐ *Come back this week* — mention this message and get *10% off* your next order!

📲 *Refer a friend* — bring a friend and both of you get a *free drink*!

We'd love to see you again soon! 😊`
    });
  }
}

// ══════════════════════════════════════════════════════════════════
// Parse "BB-T3" → { tenantCode: "BB", tableNumber: "3" }
// Parse "BB"    → { tenantCode: "BB", tableNumber: null }
// ══════════════════════════════════════════════════════════════════
function parseRestaurantCode(text) {
  // Remove spaces, uppercase already done
  const clean = text.replace(/\s+/g, '');

  // Format: CODE-T<number>  e.g. BB-T3, SPICE-T12
  const withTable = clean.match(/^([A-Z0-9]+)-T(\d+)$/);
  if (withTable) {
    return { tenantCode: withTable[1], tableNumber: withTable[2] };
  }

  // Format: CODE only  e.g. BB, SPICE
  const codeOnly = clean.match(/^([A-Z0-9]{2,10})$/);
  if (codeOnly) {
    return { tenantCode: codeOnly[1], tableNumber: null };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════
// Send WhatsApp message via Meta Cloud API
// ══════════════════════════════════════════════════════════════════
async function sendWhatsAppMessage(env, toPhone, payload) {
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID) {
    console.warn('Meta credentials not configured — skipping WhatsApp send');
    return null;
  }

  // Ensure phone has country code, remove + prefix
  const phone = toPhone.replace(/^\+/, '').replace(/\s+/g, '');

  let messageBody;

  if (payload.type === 'welcome' || payload.type === 'welcome_menu') {
    const table = payload.tableNumber ? ` (Table ${payload.tableNumber})` : '';
    messageBody = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: {
        body:
`👋 Hi! Hope you enjoyed your food at *${payload.bizName}*${table}! 😊

Fetching your bills... just a moment 🧾`
      }
    };
  } else if (payload.type === 'bills_list') {
    messageBody = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: payload.text }
    };
  } else if (payload.type === 'receipt') {
    messageBody = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: {
        body:
`✅ *Payment Confirmed!*

*${payload.bizName || 'Restaurant'}*
Order #${payload.orderNumber}
Amount: ₹${payload.total}

📄 View your receipt:
${payload.receiptUrl}

Thank you for visiting! Come again 😊`
      }
    };
  } else if (payload.type === 'unknown') {
    messageBody = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: {
        body:
`👋 Hi! Please scan the QR code at your table to get your bill on WhatsApp.

If you need help, ask a staff member. 😊`
      }
    };
  } else if (payload.type === 'not_found') {
    messageBody = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: {
        body: `We couldn't find restaurant code "${payload.code}". Please scan the QR code at your table again.`
      }
    };
  } else {
    // Generic text
    messageBody = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: payload.text || 'Hello!' }
    };
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageBody)
    }
  );

  const data = await res.json();
  if (!res.ok) console.error('Meta API error:', JSON.stringify(data));
  return data;
}

// ══════════════════════════════════════════════════════════════════
// Mark message as read
// ══════════════════════════════════════════════════════════════════
async function markMessageRead(env, messageId) {
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID) return;
  await fetch(
    `https://graph.facebook.com/v19.0/${env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      })
    }
  ).catch(() => {});
}

// ══════════════════════════════════════════════════════════════════
// Supabase helpers
// ══════════════════════════════════════════════════════════════════
function supabaseHeaders(env) {
  return {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
  };
}

async function getTenantByCode(env, code) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null;
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/tenants?whatsapp_code=eq.${code}&limit=1`,
    { headers: supabaseHeaders(env) }
  );
  const data = await res.json();
  return data?.[0] || null;
}

async function saveWhatsAppSession(env, session) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;

  // Upsert — if same phone + tenant already has open session, update it
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/whatsapp_sessions`,
    {
      method: 'POST',
      headers: {
        ...supabaseHeaders(env),
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        tenant_id:       session.tenantId,
        tenant_code:     session.tenantCode,
        customer_phone:  session.customerPhone,
        table_number:    session.tableNumber,
        window_opened_at: session.windowOpenedAt,
        receipt_sent:    false
      })
    }
  );
}

async function getActiveSessions(env, tenantId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return [];

  // Get sessions opened in last 23 hours (still within free window)
  const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/whatsapp_sessions` +
    `?tenant_id=eq.${tenantId}` +
    `&window_opened_at=gte.${cutoff}` +
    `&receipt_sent=eq.false` +
    `&order=window_opened_at.desc`,
    { headers: supabaseHeaders(env) }
  );
  return await res.json() || [];
}

async function updateSessionReceiptSent(env, customerPhone) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/whatsapp_sessions` +
    `?customer_phone=eq.${customerPhone}&receipt_sent=eq.false`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(env),
      body: JSON.stringify({ receipt_sent: true })
    }
  );
}