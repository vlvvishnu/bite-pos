// pos-manage.js — table management, QR generation
// ══ TABLE MANAGEMENT ════════════════════════════════════════════
function saveTableCount(val) {
  const n = Math.max(1, Math.min(100, parseInt(val)||10));
  const existing = loadTableConfig();
  const tables = Array.from({length: n}, (_, i) => ({
    name: (existing[i] && existing[i].name) || ('T' + (i+1))
  }));
  localStorage.setItem('bite_tables_config', JSON.stringify(tables));
  localStorage.setItem('bite_table_count', n);
  renderTableNamesEditor();
  buildTableNumBtns();
}

function renderTableNamesEditor() {
  const el = document.getElementById('table-names-editor');
  if (!el) return;
  const tables = loadTableConfig();
  el.innerHTML = '';
  tables.forEach((t, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)';
    const numSpan = document.createElement('span');
    numSpan.textContent = (i+1);
    numSpan.style.cssText = 'font-size:11px;font-weight:700;color:var(--muted);min-width:20px';
    const input = document.createElement('input');
    input.className = 'sr-input';
    input.value = t.name || ('T' + (i+1));
    input.placeholder = 'Table ' + (i+1);
    input.style.cssText = 'flex:1;padding:5px 8px;font-size:12px';
    input.addEventListener('change', (function(idx){ return function(e) {
      const tables = loadTableConfig();
      if (tables[idx]) tables[idx].name = e.target.value.trim() || ('T' + (idx+1));
      localStorage.setItem('bite_tables_config', JSON.stringify(tables));
      buildTableNumBtns();
    }; })(i));
    const qrBtn = document.createElement('button');
    qrBtn.className = 'icon-btn';
    qrBtn.textContent = '📲';
    qrBtn.title = 'Generate QR for this table';
    qrBtn.addEventListener('click', (function(idx){ return function() { generateSingleTableQR(idx+1); }; })(i));
    row.appendChild(numSpan);
    row.appendChild(input);
    row.appendChild(qrBtn);
    el.appendChild(row);
  });
}

function populateTableSettings() {
  const count = loadTableConfig().length;
  const el = document.getElementById('set-table-count-main');
  if (el) el.value = count;
  renderTableNamesEditor();
}

// ══ QR GENERATION ═══════════════════════════════════════════════
function generateSingleTableQR(tableNum) {
  const s = loadSettings();
  const waNum = localStorage.getItem('bite_pay4_wa_number') || '919000000000';
  const tableName = loadTableConfig()[tableNum-1]?.name || ('T' + tableNum);
  const code = (s.waCode || 'REST') + '-T' + tableNum;
  const waLink = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(code);
  showSingleQRModal('Table ' + tableName, waLink, code);
}

function generateAllTableQRs() {
  const s = loadSettings();
  if (!s.waCode) { showToast('Set WhatsApp Code in WA settings first'); return; }
  const waNum = localStorage.getItem('bite_pay4_wa_number') || '919000000000';
  const tables = loadTableConfig();
  const cards = tables.map((t, i) => ({
    label: 'Table ' + (t.name || (i+1)),
    link: 'https://wa.me/' + waNum + '?text=' + encodeURIComponent((s.waCode||'R') + '-T' + (i+1)),
    code: (s.waCode||'R') + '-T' + (i+1)
  }));
  showQRGridModal('All Table QR Codes', cards);
}

function generateTakeawayQR() {
  const s = loadSettings();
  const waNum = localStorage.getItem('bite_pay4_wa_number') || '919000000000';
  const code = (s.waCode || 'REST') + '-TAKE';
  const link = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(code);
  showSingleQRModal('Takeaway Counter', link, code);
}

function generateStallQR() {
  const s = loadSettings();
  const waNum = localStorage.getItem('bite_pay4_wa_number') || '919000000000';
  const code = (s.waCode || 'REST') + '-STALL';
  const link = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(code);
  showSingleQRModal('Stall Counter', link, code);
}

function showSingleQRModal(label, link, code) {
  const grid = document.getElementById('qr-cards-grid');
  if (grid) {
    grid.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'qr-card-preview';
    card.style.cssText = 'max-width:200px;margin:0 auto;text-align:center';
    card.innerHTML = '<div style="font-weight:700;margin-bottom:6px">' + label + '</div>' +
      '<div id="single-qr-box" style="width:140px;height:140px;margin:0 auto 8px"></div>' +
      '<div style="font-size:10px;color:var(--muted)">' + code + '</div>';
    grid.appendChild(card);
    document.getElementById('qr-modal-overlay')?.classList.add('show');
    setTimeout(() => {
      const el = document.getElementById('single-qr-box');
      if (el && typeof QRCode !== 'undefined') {
        new QRCode(el, { text: link, width:140, height:140, colorDark:'#1A1208', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M });
      }
    }, 100);
  }
}

function showQRGridModal(title, cards) {
  const grid = document.getElementById('qr-cards-grid');
  if (!grid) return;
  grid.innerHTML = '';
  cards.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = 'qr-card-preview';
    div.style.textAlign = 'center';
    div.innerHTML = '<div style="font-weight:700;font-size:12px;margin-bottom:6px">' + card.label + '</div>' +
      '<div id="qr-card-' + i + '" style="width:90px;height:90px;margin:0 auto 5px"></div>' +
      '<div style="font-size:9px;color:var(--muted)">' + card.code + '</div>';
    grid.appendChild(div);
    setTimeout(() => {
      const el = document.getElementById('qr-card-' + i);
      if (el && typeof QRCode !== 'undefined') {
        new QRCode(el, { text: card.link, width:90, height:90, colorDark:'#1A1208', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M });
      }
    }, 80 * (i+1));
  });
  document.getElementById('qr-modal-overlay')?.classList.add('show');
}


