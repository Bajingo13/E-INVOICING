import { requireAnyRole } from './authClient.js'; // <-- ADD THIS

'use strict';

// -------------------- 0. DEBUG & DOM HELPERS --------------------
const DBG = {
  log: (...args) => console.log('[E-INVOICING]', ...args),
  warn: (...args) => console.warn('[E-INVOICING]', ...args),
  error: (...args) => console.error('[E-INVOICING]', ...args)
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const safeSetValue = (selector, value) => { const el = $(selector); if (el) el.value = value; };
const safeSetText = (selector, text) => { const el = $(selector); if (el) el.textContent = text; };

function getInputValue(name) {
  const el = document.querySelector(`input[name="${name}"], select[name="${name}"]`) || document.getElementById(name);
  if (!el) return '';
  return el.type === 'checkbox' ? el.checked : el.value;
}

function setInputValue(name, value) {
  const el = document.querySelector(`input[name="${name}"], select[name="${name}"]`) || document.getElementById(name);
  if (!el) return;
  el.type === 'checkbox' ? el.checked = !!value : ('value' in el ? el.value = value : el.textContent = value);
}

function dateToYYYYMMDD(dateValue) {
  if (!dateValue) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear(); 
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// -------------------- 1. FORM PERSISTENCE --------------------
function saveFormState() {
  try {
    const formData = {
      inputs: {},
      items: [],
      extraColumns: [],
      currency: getInputValue('currency'),
      exchangeRate: getInputValue('exchangeRate'),
      vatType: getInputValue('vatType'),
      discount: getInputValue('discount'),
      ewt: getInputValue('withholdingTax'),
      footer: {
        atp_no: getInputValue('footerAtpNo'),
        atp_date: getInputValue('footerAtpDate'),
        bir_permit_no: getInputValue('footerBirPermit'),
        bir_date: getInputValue('footerBirDate'),
        serial_nos: getInputValue('footerSerialNos')
      }
    };

    // Save all simple inputs
    $$('input, select, textarea').forEach(el => {
      const name = el.name || el.id;
      if (name) formData.inputs[name] = el.value;
    });

    // Save extra columns headers
    $$('#items-table thead th').forEach((th, idx) => {
      if (idx >= 5) formData.extraColumns.push(th.textContent.trim());
    });

    // Save items rows
    $$('#items-body tr').forEach(row => {
      const item = {};
      row.querySelectorAll('input, textarea').forEach(el => {
        const name = el.name;
        if (name) item[name] = el.value;
      });
      formData.items.push(item);
    });

    localStorage.setItem('invoiceFormState', JSON.stringify(formData));
  } catch (err) {
    DBG.error('saveFormState error:', err);
  }
}

function restoreFormState() {
  try {
    const stored = localStorage.getItem('invoiceFormState');
    if (!stored) return;
    const formData = JSON.parse(stored);

    // Restore simple inputs
    for (const [name, value] of Object.entries(formData.inputs || {})) {
      setInputValue(name, value);
    }

    // Restore extra columns
    const theadRow = $("#items-table thead tr");
    if (theadRow && formData.extraColumns?.length) {
      formData.extraColumns.forEach(col => {
        const colKey = col.toLowerCase().replace(/\s+/g, "_");
        const th = document.createElement('th');
        th.textContent = col;
        th.setAttribute('data-colkey', colKey);
        theadRow.appendChild(th);
      });
    }

    // Restore items rows
    const tbody = $("#items-body");
    if (tbody && formData.items?.length) {
      tbody.innerHTML = '';
      formData.items.forEach(item => {
        addRow();
        const row = tbody.lastElementChild;
        for (const [name, value] of Object.entries(item)) {
          const el = row.querySelector(`[name="${name}"]`);
          if (el) el.value = value;
        }
      });
    }

    calculateTotals();
    adjustColumnWidths();
  } catch (err) {
    DBG.error('restoreFormState error:', err);
  }
}

// Save form on any change
document.addEventListener('input', saveFormState);
document.addEventListener('change', saveFormState);


/* -------------------- NOTIFICATIONS -------------------- */
let notifications = [];

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    if (!res.ok) return [];

    const data = await res.json();
    notifications = data || [];

    const badge = document.getElementById('notifBadge');
    if (!badge) return;

    const unreadCount = notifications.filter(n => !n.is_read).length;

    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }

    return notifications;
  } catch (err) {
    console.error('Failed to load notifications:', err);
    return [];
  }
}

/* ===================== RBAC APPROVAL UI ===================== */
window.addEventListener('DOMContentLoaded', async () => {
  const approveDropdown = document.querySelector('.dropdown[data-dropdown]');
  if (!approveDropdown) return;

  try {
    const meRes = await fetch('/auth/me', { credentials: 'include' });
    if (!meRes.ok) return approveDropdown.remove();

    const { user } = await meRes.json();
    if (!user) return approveDropdown.remove();

    const params = new URLSearchParams(window.location.search);
    const invoiceNo = params.get('invoice_no');

    if (!invoiceNo) return approveDropdown.remove();

    const invRes = await fetch(`/api/invoices/${invoiceNo}`);
    if (!invRes.ok) return approveDropdown.remove();

    const invoice = await invRes.json();

    const canApprove =
      user.permissions?.includes('invoice_approve') &&
      invoice.status === 'submitted' &&
      invoice.created_by !== user.id;

    if (!canApprove) approveDropdown.remove();
  } catch (err) {
    console.error('RBAC approve UI error:', err);
    approveDropdown.remove();
  }
});

/* -------------------- EXCHANGE RATE FETCHING -------------------- */
const currencySelect = document.getElementById('currency');
const exchangeRateInput = document.getElementById('exchangeRate');

if (currencySelect && exchangeRateInput) {

  async function updateExchangeRate() {
    const currency = currencySelect.value.toUpperCase();

    // PHP is base currency
    if (currency === 'PHP') {
      exchangeRateInput.value = 1;
      calculateTotals();
      return;
    }

    try {
      const res = await fetch(`/api/exchange-rate?to=${currency}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch exchange rate');
      }

      const data = await res.json();
      const rate = parseFloat(data.rate);

      if (!rate || isNaN(rate)) throw new Error('Invalid exchange rate received');

      exchangeRateInput.value = rate.toFixed(4);
      calculateTotals();

    } catch (err) {
      console.error('Exchange rate error:', err);
      alert(`Failed to fetch exchange rate for ${currency}. Using fallback rate if available.`);

      // Optional: fallback to 1 to allow user to continue
      exchangeRateInput.value = 1;
      calculateTotals();
    }
  }

  // Update rate whenever currency changes
  currencySelect.addEventListener('change', updateExchangeRate);

  // Initial fetch on page load
  updateExchangeRate();
}

/* -------------------- AUTO-RESIZE TEXTAREA -------------------- */
const textarea = document.getElementById('address');
if (textarea) {
  function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  textarea.addEventListener('input', () => autoResizeTextarea(textarea));
  window.addEventListener('load', () => autoResizeTextarea(textarea));
}

// Auto-resize all item description textareas
function autoResize(el) {
  el.style.height = 'auto'; // reset height
  el.style.height = el.scrollHeight + 'px'; // expand to fit content
}

// Handle existing item descriptions on page load
document.querySelectorAll('.item-desc').forEach(textarea => {
  autoResize(textarea);

  // On input
  textarea.addEventListener('input', () => autoResize(textarea));
});
/* -------------------- 2. COMPANY INFO -------------------- */
async function loadCompanyInfo() {
  try {
    const res = await fetch('/api/company-info/');
    if (!res.ok) return;
    const company = await res.json();
    if (!company) return;

    safeSetValue('input[name="billTo"]', company.company_name || '');
    safeSetValue('input[name="address"]', company.company_address || '');
    safeSetValue('input[name="tin"]', company.vat_tin || '');
    safeSetText('#company-name', company.company_name || '');
    safeSetText('#company-address', company.company_address || '');
    safeSetText('#company-tel', company.tel_no || '');
    safeSetText('#company-tin', company.vat_tin || '');

    const logoEl = $('#invoice-logo');
    const previewLogoEl = $('#uploaded-logo');
    const removeBtn = $('#remove-logo-btn');

    if (company.logo_path) {
      if (logoEl) logoEl.src = company.logo_path;
      if (previewLogoEl) { previewLogoEl.src = company.logo_path; previewLogoEl.style.display = 'block'; }
      if (removeBtn) removeBtn.style.display = 'inline-block';
    } else {
      if (previewLogoEl) previewLogoEl.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'none';
    }
  } catch (err) { DBG.warn('Failed to load company info:', err); }
}

/* -------------------- 3. NEXT INVOICE NO -------------------- */
async function loadNextInvoiceNo() {
  try {
    const res = await fetch('/api/next-invoice-no');
    const data = await res.json();
    const invoiceInput = document.querySelector('input[name="invoiceNo"]');
    if (invoiceInput) invoiceInput.value = data.invoiceNo || '';
  } catch (err) {
    console.error('Failed to fetch next invoice number', err);
  }
}

/* -------------------- 4. INVOICE TITLE -------------------- */
function setInvoiceTitleFromURL() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const typeMap = { sales: 'SALES INVOICE', commercial: 'COMMERCIAL INVOICE', credit: 'CREDIT MEMO', debit: 'DEBIT MEMO' };
  const invoiceTitle = typeMap[type] || 'SERVICE INVOICE';

  safeSetText('.invoice-title', invoiceTitle);

  const invoiceTypeInput = document.getElementById('invoice_type');
  if (invoiceTypeInput) invoiceTypeInput.value = invoiceTitle;

  localStorage.setItem('selectedInvoiceType', invoiceTitle);
}


/* -------------------- 5. LOAD INVOICE FOR EDIT (WITH ACCOUNT COMBO) -------------------- */
async function loadInvoiceForEdit() {
  const params = new URLSearchParams(window.location.search);
  const invoiceNo = params.get('invoice_no');
  const isEdit = params.get('edit') === 'true';
  if (!invoiceNo || !isEdit) return;

  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
    if (!res.ok) throw new Error('Failed to fetch invoice');
    const data = await res.json();

    setInputValue('billTo', data.bill_to || '');
    setInputValue('address', data.address || '');
    setInputValue('tin', data.tin || '');
    setInputValue('terms', data.terms || '');
    setInputValue('invoiceNo', data.invoice_no || '');
    setInputValue('date', dateToYYYYMMDD(data.date));
    setInputValue('invoiceMode', data.invoice_mode || 'standard');
    setInputValue('invoiceCategory', data.invoice_category || 'service');
    safeSetText('.invoice-title', data.invoice_title || 'SERVICE INVOICE');

    // Header
    const theadRow = $("#items-table thead tr");
    if (theadRow) {
      theadRow.innerHTML = `<th>DESCRIPTION</th><th>ACCOUNT</th><th>QTY</th><th>RATE</th><th>AMOUNT</th>`;
      (data.extra_columns || []).forEach(col => {
        const th = document.createElement("th");
        th.textContent = col.replace(/_/g, " ").toUpperCase();
        theadRow.appendChild(th);
      });
    }

    // Body
    const tbody = $("#items-body");
    if (tbody) {
      tbody.innerHTML = "";
      (data.items || []).forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><textarea class="input-full item-desc" name="desc[]" rows="1" style="overflow:hidden; resize:none;">${item.description || ""}</textarea></td>
          <td class="Acc-col" style="position:relative;">
            <input type="text" name="account[]" class="input-full account-input" placeholder="+ Create New Account" autocomplete="off">
            <div class="account-dropdown" style="display:none; position:absolute; background:white; border:1px solid #ccc; max-height:150px; overflow:auto; z-index:999;"></div>
          </td>
          <td><input type="number" class="input-short" name="qty[]" value="${item.quantity || 0}" oninput="updateAmount(this)"></td>
          <td><input type="number" class="input-short" name="rate[]" value="${item.unit_price || 0}" oninput="updateAmount(this)"></td>
          <td><input type="number" class="input-short" name="amt[]" value="${item.amount || 0}" readonly></td>
        `;
        (data.extra_columns || []).forEach(col => {
          const td = document.createElement("td");
          td.innerHTML = `<input type="text" name="${col}[]" value="${item[col] || ""}">`;
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });

      // Setup account combo boxes for each row
      $$('input.account-input').forEach(input => {
        if (!input.dataset.initialized && window._coaAccounts) {
          setupAccountCombo(input, window._coaAccounts);
          input.dataset.initialized = true;

          // Pre-select current account
          const rowIndex = Array.from(tbody.rows).indexOf(input.closest('tr'));
          const item = data.items[rowIndex];
          const acc = window._coaAccounts.find(a => a.id == item.account_id);
          if (acc) {
            input.value = `${acc.code || ''} - ${acc.title}`;
            input.dataset.accountId = acc.id;
          }
        }
      });
    }

    if (data.tax_summary) {
      const ts = data.tax_summary || {};
      safeSetValue('#subtotal', ts.subtotal || 0);
      safeSetValue('#vatableSales', ts.vatable_sales || 0);
      safeSetValue('#vatAmount', ts.vat_amount || 0);
      safeSetValue('#withholdingTax', ts.withholding || ts.withholdingTax || 0);
      safeSetValue('#totalPayable', ts.total_payable || 0);
    }

    adjustColumnWidths();
  } catch (err) { DBG.error('Error loading invoice for edit:', err); }
}

/* -------------------- 6. CHART OF ACCOUNTS (COMBO BOX VERSION) -------------------- */
async function loadAccounts() {
  try {
    const res = await fetch('/api/coa');
    if (!res.ok) throw new Error('Failed to fetch accounts');
    const accounts = await res.json();
    window._coaAccounts = accounts;

    // Initialize existing account inputs
    $$('input.account-input').forEach(input => {
      if (!input.dataset.initialized) {
        setupAccountCombo(input, accounts);
        input.dataset.initialized = true;
      }
    });
  } catch (err) {
    DBG.error('loadAccounts error:', err);
  }
}

function setupAccountCombo(input, accounts) {
  const dropdown = input.nextElementSibling;
  dropdown.innerHTML = '';

  accounts.forEach(acc => {
    if (!acc.title) return;
    const div = document.createElement('div');
    div.textContent = `${acc.code || ''} - ${acc.title}`;
    div.dataset.value = acc.id;
    div.style.padding = '4px 8px';
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => {
      input.value = div.textContent;
      input.dataset.accountId = div.dataset.value;
      dropdown.style.display = 'none';
    });
    dropdown.appendChild(div);
  });

  input.addEventListener('input', () => {
    const val = input.value.toLowerCase();
    Array.from(dropdown.children).forEach(div => {
      div.style.display = div.textContent.toLowerCase().includes(val) ? 'block' : 'none';
    });
    dropdown.style.display = dropdown.children.length ? 'block' : 'none';
  });

  input.addEventListener('focus', () => {
    dropdown.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
  });
}
/* -------------------- 7. ADD / REMOVE ROW (COMBO BOX ACCOUNT) -------------------- */
function addRow() {
  const tbody = $("#items-body");
  if (!tbody) return;
  const ths = $("#items-table thead tr").children;
  const row = document.createElement("tr");

  row.innerHTML = Array.from(ths).map((th, i) => {
    const colName = th.textContent.trim().toLowerCase().replace(/\s+/g, "_");
    switch(i) {
      case 0: return `<td><textarea class="input-full item-desc" name="desc[]" rows="1" style="overflow:hidden; resize:none;"></textarea></td>`;
      case 1:
        return `<td class="Acc-col" style="position:relative;">
          <input type="text" name="account[]" class="input-full account-input" placeholder="+ Create New Account" autocomplete="off">
          <div class="account-dropdown" style="display:none; position:absolute; background:white; border:1px solid #ccc; max-height:150px; overflow:auto; z-index:999;"></div>
        </td>`;
      case 2: return `<td><input type="number" class="input-short" name="qty[]" value="0" oninput="updateAmount(this)"></td>`;
      case 3: return `<td><input type="number" class="input-short" name="rate[]" value="0" oninput="updateAmount(this)"></td>`;
      case 4: return `<td><input type="number" class="input-short" name="amt[]" value="0" readonly></td>`;
      default: return `<td><input type="text" name="${colName}[]"></td>`;
    }
  }).join('');

  tbody.appendChild(row);

  const descTextarea = row.querySelector('.item-desc');
  if (descTextarea) {
    autoResize(descTextarea);
    descTextarea.addEventListener('input', () => { autoResize(descTextarea); saveFormState(); });
  }

  adjustColumnWidths();
}

function removeRow() {
  const tbody = $("#items-body");
  if (!tbody || tbody.rows.length <= 1) return alert("At least one row must remain.");
  tbody.deleteRow(tbody.rows.length - 1);
  calculateTotals();
  adjustColumnWidths();
}

/* -------------------- 8. EWT OPTIONS -------------------- */
async function loadEWTOptions() {
  const ewtSelect = document.getElementById('withholdingTax');
  if (!ewtSelect) return;

  try {
    const res = await fetch('/api/ewt');
    if (!res.ok) throw new Error('Failed to fetch EWT');
    const data = await res.json();

    window._ewtRates = data;
    ewtSelect.innerHTML = `<option value="0">-- Select EWT --</option>`;

    data.forEach(ewt => {
      const opt = document.createElement('option');
      opt.value = ewt.tax_rate;
      opt.textContent = `${ewt.code} (${ewt.tax_rate}%)`;
      ewtSelect.appendChild(opt);
    });

    ewtSelect.addEventListener('change', () => calculateTotals());
  } catch (err) {
    console.error('Failed to load EWT options:', err);
  }
}

/* -------------------- 9. AMOUNT & TOTALS (PER-ACCOUNT TAX) -------------------- */
function updateAmount(input) {
  const row = input.closest("tr");
  if (!row) return;
  const qty = parseFloat(row.querySelector('[name="qty[]"]')?.value) || 0;
  const rate = parseFloat(row.querySelector('[name="rate[]"]')?.value) || 0;
  const amtEl = row.querySelector('[name="amt[]"]');
  if (amtEl) amtEl.value = (qty * rate).toFixed(2); // remove exchange rate here
  calculateTotals(); // totals now handle exchange rate
}


// -------------------- CALCULATE TOTALS (with exchange rate) --------------------
function calculateTotals() {
  const rows = document.querySelectorAll('#items-body tr');
  const exchangeRate = parseFloat(exchangeRateInput.value) || 1;

  let subtotal = 0;
  let vatAmount = 0;
  let vatExemptAmount = 0;
  let zeroRatedAmount = 0;

  let vatExemptSales = 0;
  let zeroRatedSales = 0;

  rows.forEach(row => {
  const qty = parseFloat(row.querySelector('[name="qty[]"]')?.value) || 0;
  const rate = parseFloat(row.querySelector('[name="rate[]"]')?.value) || 0;
  const exchangeRate = parseFloat(exchangeRateInput.value) || 1;

  const amt = qty * rate * exchangeRate; // apply exchange rate here
  row.querySelector('[name="amt[]"]').value = amt.toFixed(2);

  subtotal += amt;
    const accountId = row.querySelector('[name="account[]"]')?.dataset.accountId || '';
    const account = window._coaAccounts?.find(acc => String(acc.id) === String(accountId));
    const taxType = account?.tax_type || 'vatable';
    const taxRate = parseFloat(account?.tax_rate || 0) / 100;

    switch (taxType) {
      case 'exempt':
        vatExemptSales += amt;
        vatExemptAmount += amt * taxRate; // usually 0
        break;
      case 'zero':
        zeroRatedSales += amt;
        zeroRatedAmount += amt * taxRate; // usually 0
        break;
      case 'vatable':
      default:
        vatAmount += amt * taxRate;
        break;
    }
  });

  // -------------------- DISCOUNT --------------------
  let discountRate = parseFloat(document.querySelector('#discount')?.value) || 0;
  if (discountRate > 1) discountRate /= 100;
  const discountAmount = subtotal * discountRate;
  const subtotalAfterDiscount = subtotal - discountAmount;

  // -------------------- EWT --------------------
  const ewtRate = parseFloat(document.querySelector('#withholdingTax')?.value) || 0;
  const ewtAmount = subtotalAfterDiscount * (ewtRate / 100);

  // -------------------- VAT TYPE HANDLING --------------------
  const vatType = document.querySelector('#vatType')?.value || 'inclusive';
  let vatable = 0;
  let finalTotal = 0;
  let displaySubtotal = 0;

  switch (vatType) {
    case 'inclusive':
      vatable = subtotal - vatExemptSales - zeroRatedSales - vatAmount;
      displaySubtotal = subtotalAfterDiscount;
      finalTotal = subtotalAfterDiscount - ewtAmount;
      break;
    case 'exclusive':
      vatable = subtotal - vatExemptSales - zeroRatedSales;
      displaySubtotal = subtotalAfterDiscount + vatAmount;
      finalTotal = subtotalAfterDiscount + vatAmount - ewtAmount;
      break;
    case 'exempt':
    case 'zero':
    default:
      vatable = subtotal - vatExemptSales - zeroRatedSales;
      displaySubtotal = subtotalAfterDiscount;
      finalTotal = subtotalAfterDiscount - ewtAmount;
      break;
  }

  // -------------------- UPDATE DOM --------------------
  safeSetValue('#subtotal', displaySubtotal.toFixed(2));
  safeSetValue('#vatableSales', vatable.toFixed(2));
  safeSetValue('#vatAmount', vatAmount.toFixed(2));
  safeSetValue('#vatExemptSales', vatExemptSales.toFixed(2));
  safeSetValue('#vatExemptAmount', vatExemptAmount.toFixed(2));
  safeSetValue('#vatZeroRatedSales', zeroRatedSales.toFixed(2));
  safeSetValue('#vatZeroRatedAmount', zeroRatedAmount.toFixed(2));
  safeSetValue('#withholdingTaxAmount', ewtAmount.toFixed(2));
  safeSetValue('#totalPayable', finalTotal.toFixed(2));
}

// -------------------- EVENT LISTENERS --------------------
document.getElementById('vatType')?.addEventListener('change', calculateTotals);
document.getElementById('discount')?.addEventListener('input', calculateTotals);

/* -------------------- 10. ADJUST COLUMN WIDTHS -------------------- */
function adjustColumnWidths() {
  const table = $("#items-table"); if (!table) return;
  const ths = table.querySelectorAll("thead th");
  const colWidth = (100 / ths.length).toFixed(2) + "%";
  ths.forEach(th => th.style.width = colWidth);
  $$("tbody tr", table).forEach(row => row.querySelectorAll("td").forEach(td => td.style.width = colWidth));
}

/* -------------------- 11. MODALS & EXTRA COLUMNS -------------------- */
function openModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }

function showAddColumnModal() {
  $('#newColumnName').value = 'Column Title';
  $('#addColumnMessage').textContent = '';
  openModal('addColumnModal');
}

function showRemoveColumnModal() {
  $('#removeColumnName').value = 'Column Title';
  $('#removeColumnMessage').textContent = '';
  openModal('removeColumnModal');
}

window.addEventListener('DOMContentLoaded', () => {
  $('#addColumnConfirm')?.addEventListener('click', () => {
    const name = $('#newColumnName').value.trim();
    const msg = $('#addColumnMessage'); msg.textContent = '';
    if (!name) { msg.textContent = "Column name cannot be empty!"; return; }

    const colKey = name.toLowerCase().replace(/\s+/g, "_");
    const th = document.createElement("th");
    th.textContent = name;
    th.setAttribute("data-colkey", colKey);
    $("#items-table thead tr").appendChild(th);

    const rows = $$("#items-body tr");
    if (rows.length === 0) addRow();
    rows.forEach(row => {
      const td = document.createElement("td");
      td.innerHTML = `<input type="text" name="${colKey}[]">`;
      row.appendChild(td);
    });

    adjustColumnWidths();
    closeModal('addColumnModal');
  });

  $('#removeColumnConfirm')?.addEventListener('click', () => {
    const nameRaw = $('#removeColumnName').value.trim();
    const msg = $('#removeColumnMessage');
    msg.textContent = '';

    if (!nameRaw) {
      msg.textContent = "Column name cannot be empty!";
      return;
    }

    const nameKey = nameRaw.toLowerCase().replace(/\s+/g, "_");

    const ths = Array.from($("#items-table thead tr th"));
    const index = ths.findIndex(th => {
      const key = th.getAttribute("data-colkey");
      const text = (th.textContent || "").trim().toLowerCase().replace(/\s+/g, "_");
      return (key === nameKey) || (text === nameKey);
    });

    if (index === -1) {
      msg.textContent = `Column "${nameRaw}" not found!`;
      return;
    }
    if (index <= 4) {
      msg.textContent = "Default columns cannot be removed.";
      return;
    }

    ths[index].remove();
    $$("#items-body tr").forEach(row => row.querySelectorAll("td")[index]?.remove());
    adjustColumnWidths();
    closeModal('removeColumnModal');
  });

  window.addEventListener('click', e => {
    ['addColumnModal','removeColumnModal'].forEach(id => {
      const m = document.getElementById(id);
      if (m && e.target === m) m.style.display = 'none';
    });
  });
});

/* -------------------- 12. LOGO -------------------- */
function previewLogo(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = $('#uploaded-logo'); const btn = $('#remove-logo-btn');
    if (img) { img.src = e.target.result; img.style.display = 'block'; }
    if (btn) btn.style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  const img = $('#uploaded-logo'); const btn = $('#remove-logo-btn'); const input = $('#logo-upload');
  if (img) { img.src = ''; img.style.display = 'none'; }
  if (btn) btn.style.display = 'none';
  if (input) input.value = '';
}

function getFooterValue(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? el.value : null;
}

/* -------------------- 13. SAVE INVOICE -------------------- */
async function saveToDatabase() {
  const billTo = getInputValue('billTo');
  const invoiceNo = getInputValue('invoiceNo');
  const date = getInputValue('date');

  if (!billTo || !date) {
    return alert("Fill Bill To and Date.");
  }

  calculateTotals();

  const params = new URLSearchParams(window.location.search);
  const isEdit = params.get('edit') === 'true' && params.get('invoice_no');

  const ths = $("#items-table thead tr").children;
  const extraColumns = Array.from(ths)
    .slice(5)
    .map(th => th.textContent.trim().toLowerCase().replace(/\s+/g, "_"));

  const rows = $$('#items-body tr');
  const items = rows.map(row => {
    const item = {
      description: row.querySelector('[name="desc[]"]')?.value || "",
      quantity: parseFloat(row.querySelector('[name="qty[]"]')?.value) || 0,
      unit_price: parseFloat(row.querySelector('[name="rate[]"]')?.value) || 0,
      amount: parseFloat(row.querySelector('[name="amt[]"]')?.value) || 0,
      account_id: row.querySelector('[name="account[]"]')?.dataset.accountId || ""
    };
    extraColumns.forEach(col => {
      item[col] = row.querySelector(`[name="${col}[]"]`)?.value || '';
    });
    return item;
  });

  const payload = {
    bill_to: billTo,
    address: getInputValue('address'),
    tin: getInputValue('tin'),
    date,
    terms: getInputValue('terms'),
    invoice_title: $('.invoice-title')?.textContent || 'SERVICE INVOICE',
    invoice_mode: getInputValue('invoiceMode'),
    invoice_category: getInputValue('invoiceCategory'),
    invoice_type: getInputValue('invoice_type'),
    currency: currencySelect?.value || 'PHP',
    exchange_rate: parseFloat(exchangeRateInput?.value) || 1,
    items,
    extra_columns: extraColumns,
    tax_summary: {
      subtotal: parseFloat($('#subtotal')?.value) || 0,
      vatable_sales: parseFloat($('#vatableSales')?.value) || 0,
      vat_amount: parseFloat($('#vatAmount')?.value) || 0,
      withholding: parseFloat($('#withholdingTaxAmount')?.value) || 0,
      total_payable: parseFloat($('#totalPayable')?.value) || 0
    },
    footer: {
      atp_no: getFooterValue('footerAtpNo'),
      atp_date: getFooterValue('footerAtpDate'),
      bir_permit_no: getFooterValue('footerBirPermit'),
      bir_date: getFooterValue('footerBirDate'),
      serial_nos: getFooterValue('footerSerialNos')
    }
  };

  let url = '/api/invoices';
  let method = 'POST';

  if (isEdit) {
    // ✅ UPDATE EXISTING INVOICE
    url = `/api/invoices/${encodeURIComponent(invoiceNo)}`;
    method = 'PUT';
    payload.invoice_no = invoiceNo;
  }

  DBG.log('Saving invoice payload:', payload);

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error || err.message || `${res.status} ${res.statusText}`;
      DBG.error('saveToDatabase server error:', err);
      throw new Error(msg);
    }

    alert('Invoice saved successfully!');
    localStorage.removeItem('invoiceFormState');
    window.location.reload();
  } catch (err) {
    DBG.error('saveToDatabase error:', err);
    alert('Failed to save invoice: ' + err.message);
  }
}

/* -------------------- 14. INIT -------------------- */
// ======= 1️⃣ AUTO-FILL DATES FUNCTION =======
function autofillDates() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const issueDate = document.getElementById('issueDate');
  if (issueDate && !issueDate.value) issueDate.value = today;

  const invoiceDate = document.getElementsByName('date')[0];
  if (invoiceDate && !invoiceDate.value) invoiceDate.value = today;

  const footerAtpDate = document.getElementsByName('footerAtpDate')[0];
  if (footerAtpDate && !footerAtpDate.value) footerAtpDate.value = today;

  const footerBirDate = document.getElementsByName('footerBirDate')[0];
  if (footerBirDate && !footerBirDate.value) footerBirDate.value = today;
}

 const params = new URLSearchParams(window.location.search);
const invoiceNo = params.get('invoice_no');

if (!invoiceNo) {
  // NEW invoice: restore draft if exists
  const stored = localStorage.getItem('invoiceFormState');
  if (stored) {
    restoreFormState();
  }
} else {
  // EDIT invoice: ignore localStorage
  localStorage.removeItem('invoiceFormState');
  await loadInvoiceForEdit(); // already in your code
}

window.addEventListener('DOMContentLoaded', async () => {

  const allowed = await requireAnyRole(['super', 'approver', 'submitter']);
  if (!allowed) return;

  // ======= 1️⃣ AUTO-FILL DATES =======
  autofillDates();

  // ======= 2️⃣ LOAD ACCOUNTS =======
  await loadAccounts();

  // ======= 3️⃣ LOAD COMPANY INFO =======
  await loadCompanyInfo();

  // ======= 4️⃣ LOAD NEXT INVOICE NO =======
if (!isEdit) {
  await loadNextInvoiceNo();
}

  // ======= 5️⃣ SET INVOICE TITLE =======
  setInvoiceTitleFromURL();

  // ======= 6️⃣ LOAD INVOICE FOR EDIT (if editing) =======
  await loadInvoiceForEdit();

  // ======= 7️⃣ LOAD EWT OPTIONS =======
  await loadEWTOptions();

  // ======= 8️⃣ CONTACTS AUTOCOMPLETE =======
  const billToInput = document.getElementById("billTo");
  const billToIdInput = document.getElementById("billToId");
  const billToDropdown = document.getElementById("billToDropdown");
  const tinInput = document.getElementById("tin");
  const addressInput = document.getElementById("address");
  const termsInput = document.getElementById("terms");

  let contacts = [];

  (async function loadContacts() {
    try {
      const res = await fetch('/api/contacts?type=Customer');
      if (!res.ok) throw new Error('Failed to fetch contacts');
      contacts = await res.json();
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }

    if (!billToInput || !billToDropdown) return;

   billToInput.addEventListener('input', () => {
  const value = billToInput.value.toLowerCase();
  billToDropdown.innerHTML = '';

  if (!value) {
    billToDropdown.style.display = 'none';
    billToIdInput.value = '';
    return;
  }

  const filtered = contacts.filter(c => {
    if (!c.business) return false;
    return c.business.toLowerCase().includes(value);
  });

  filtered.forEach(c => {
    const item = document.createElement('div');
    item.textContent = c.business;
    item.style.padding = '4px 8px';
    item.style.cursor = 'pointer';

    item.addEventListener('click', () => {
      billToInput.value = c.business;
      billToIdInput.value = c.id;

      tinInput.value = c.tin || '';
      addressInput.value = c.address || '';
      if (termsInput) termsInput.value = c.terms || '';

      billToDropdown.style.display = 'none';
    });

    billToDropdown.appendChild(item);
  });

  billToDropdown.style.display = filtered.length ? 'block' : 'none';
});


    document.addEventListener('click', e => {
      if (!e.target.closest('#billTo') && !e.target.closest('#billToDropdown')) {
        billToDropdown.style.display = 'none';
      }
    });
  })();

  // ======= 9️⃣ ADJUST COLUMN WIDTHS =======
  adjustColumnWidths();
});


/* -------------------- 15. SAVE & CLOSE / APPROVE DROPDOWN -------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const saveCloseBtn = document.getElementById('saveCloseBtn');

  const dropdownContainer = document.createElement('div');
  dropdownContainer.classList.add('dropdown-container');
  dropdownContainer.style.position = 'absolute';
  dropdownContainer.style.display = 'none';
  dropdownContainer.style.background = '#fff';
  dropdownContainer.style.border = '1px solid #ccc';
  dropdownContainer.style.borderRadius = '5px';
  dropdownContainer.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
  dropdownContainer.style.padding = '5px 0';
  dropdownContainer.style.zIndex = 1000;

  const options = [
    { text: 'Save & Preview', action: 'preview' },
    { text: 'Save & Add Another', action: 'addAnother' },
    { text: 'Submit for Approval', action: 'submitApproval' }
  ];

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt.text;
    btn.style.display = 'block';
    btn.style.width = '100%';
    btn.style.padding = '8px 15px';
    btn.style.border = 'none';
    btn.style.background = 'white';
    btn.style.textAlign = 'left';
    btn.style.cursor = 'pointer';
    btn.addEventListener('mouseenter', () => btn.style.background = '#f0f0f0');
    btn.addEventListener('mouseleave', () => btn.style.background = 'white');
    btn.addEventListener('click', () => handleSaveCloseAction(opt.action));
    dropdownContainer.appendChild(btn);
  });

  document.body.appendChild(dropdownContainer);

  if (saveCloseBtn) {
    saveCloseBtn.addEventListener('click', (e) => {
      const rect = saveCloseBtn.getBoundingClientRect();
      dropdownContainer.style.top = `${rect.bottom + window.scrollY}px`;
      dropdownContainer.style.left = `${rect.left + window.scrollX}px`;
      dropdownContainer.style.display = dropdownContainer.style.display === 'none' ? 'block' : 'none';
    });
  } else {
    DBG.warn('saveCloseBtn not found in DOM');
  }

  document.addEventListener('click', (e) => {
    if (!dropdownContainer.contains(e.target) && e.target !== saveCloseBtn) {
      dropdownContainer.style.display = 'none';
    }
  });
});

async function handleSaveCloseAction(action) {
  await saveToDatabase();

  if (action === 'addAnother') {
    window.location.href = '/Dashboard.html';
  } else if (action === 'submitApproval') {
    const invoiceNo = getInputValue('invoiceNo');

    // IMPORTANT: submit only allowed for submitter
    const user = await fetch('/auth/me', { credentials: 'include' }).then(r => r.json());
    if (!user?.user?.role || user.user.role !== 'submitter') {
      return alert('Only Submitter can submit for approval');
    }

    try {
      const res = await fetch(`/api/invoices/${invoiceNo}/submit`, { method: 'POST' });
      if (!res.ok) throw new Error('Submit failed');
      alert('Invoice submitted for approval!');
      window.location.reload();
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to submit for approval');
    }
  }
}

/* -------------------- PREVIEW IFRAME HANDLING (on-demand) -------------------- */
function loadPreviewHTML() {
  const iframe = document.getElementById('invoicePreviewFrame');
  if (!iframe) return Promise.reject(new Error('Preview iframe not present'));

  return fetch('Replica.html')
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch preview HTML');
      return res.text();
    })
    .then(html => {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) throw new Error('Preview iframe document not accessible');
      doc.open();
      doc.write(html);
      doc.close();
      return true;
    });
}

function updatePreview(data) {
  const iframe = document.getElementById('invoicePreviewFrame');
  if (!iframe) { DBG.warn('Preview iframe not present. Skipping updatePreview.'); return; }
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  if (!doc || !doc.body.innerHTML.trim()) { DBG.warn('Preview not ready yet.'); return; }

  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '' : num.toLocaleString('en-PH', { style:'currency', currency:'PHP' });
  };

  const getById = id => doc.getElementById(id) || { textContent: '' };
  getById('customerName').textContent = data.customerName || '';
  getById('invoiceNumber').textContent = data.invoiceNumber || '';
  getById('invoiceDate').textContent = data.date || '';

  const itemsContainer = doc.getElementById('invoiceItems');
  if (itemsContainer) {
    itemsContainer.innerHTML = '';
    (data.items || []).forEach(item => {
      const row = doc.createElement('tr');
      row.innerHTML = `
        <td>${item.description}</td>
        <td>${item.qty}</td>
        <td>${formatCurrency(item.price)}</td>
        <td>${formatCurrency(item.amount)}</td>
      `;
      itemsContainer.appendChild(row);
    });
  }

  const totalElem = doc.getElementById('totalAmount');
  if (totalElem) totalElem.textContent = formatCurrency(data.total);
}

const form = document.getElementById('invoiceForm');
const previewBtn = document.getElementById('previewBtn');

function getInvoiceData() {
  if (!form) return { customerName: '', invoiceNumber: '', date: '', items: [], total: 0 };
  return {
    customerName: form.querySelector('[name="billTo"]')?.value || '',
    invoiceNumber: form.querySelector('[name="invoiceNo"]')?.value || '',
    date: form.querySelector('[name="date"]')?.value || '',
    items: Array.from(form.querySelectorAll('tr')).filter(r => r.querySelector('[name="desc[]"]')).map(row => ({
      description: row.querySelector('[name="desc[]"]')?.value || '',
      qty: row.querySelector('[name="qty[]"]')?.value || '',
      price: row.querySelector('[name="rate[]"]')?.value || '',
      amount: row.querySelector('[name="amt[]"]')?.value || ''
    })),
    total: Array.from(form.querySelectorAll('[name="amt[]"]'))
                 .reduce((sum, el) => sum + (parseFloat(el.value) || 0), 0)
  };
}

async function showPreviewToggle() {
  const iframe = document.getElementById('invoicePreviewFrame');
  if (!iframe) { DBG.warn('Preview iframe not present in DOM.'); return; }

  const visible = iframe.style.display && iframe.style.display !== 'none';
  if (visible) {
    iframe.style.display = 'none';
    previewBtn?.setAttribute('aria-pressed', 'false');
    return;
  }

  iframe.style.display = 'block';
  previewBtn?.setAttribute('aria-pressed', 'true');

  try {
    await loadPreviewHTML();
    updatePreview(getInvoiceData());
  } catch (err) {
    DBG.error('Failed to show preview:', err);
    alert('Failed to load preview: ' + (err.message || err));
    iframe.style.display = 'none';
    previewBtn?.setAttribute('aria-pressed', 'false');
  }
}

if (previewBtn) {
  previewBtn.addEventListener('click', () => {
    showPreviewToggle();
  });
} else {
  DBG.warn('previewBtn not found in DOM; preview disabled.');
}

if (form) {
  form.addEventListener('input', () => {
    const iframe = document.getElementById('invoicePreviewFrame');
    if (iframe && iframe.style.display && iframe.style.display !== 'none') {
      updatePreview(getInvoiceData());
    }
  });
} else {
  DBG.warn('invoiceForm not found in DOM; live preview and some selectors may not work.');
}

// ====== FIXED DROPDOWN (SAFE) ======
const invoiceDropdown = document.getElementById('invoiceDropdown');
const invoiceTypeInput = document.getElementById('invoice_type');
const createInvoiceBtn = document.getElementById('createInvoiceBtn');

if (invoiceDropdown && invoiceTypeInput && createInvoiceBtn) {
  invoiceDropdown.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', function(e) {
      e.preventDefault();
      const type = this.getAttribute('href')?.split('type=')[1] || '';
      invoiceTypeInput.value = type.toUpperCase().replace(/_/g, ' ');
      createInvoiceBtn.textContent = this.textContent;
      invoiceDropdown.classList.remove('show');
    });
  });
}

window.addRow = addRow;
window.removeRow = removeRow;
window.showAddColumnModal = showAddColumnModal;
window.showRemoveColumnModal = showRemoveColumnModal;
window.closeModal = closeModal;
window.previewLogo = previewLogo;
window.removeLogo = removeLogo;
window.saveToDatabase = saveToDatabase;
window.updateAmount = updateAmount;
