import { requireAnyRole } from './authClient.js'; // <-- ADD THIS

'use strict';

/* -------------------- 0. DEBUG & DOM HELPERS (MOVED TO TOP) -------------------- */
const DBG = {
  log: (...args) => console.log('[E-INVOICING]', ...args),
  warn: (...args) => console.warn('[E-INVOICING]', ...args),
  error: (...args) => console.error('[E-INVOICING]', ...args)
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const safeSetValue = (selector, value) => { const el = $(selector); if (el) el.value = value; };
const safeSetText = (selector, text) => { const el = $(selector); if (el) el.textContent = text; };

/* -------------------- 1. UTILITIES -------------------- */
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
      case 0: // DESCRIPTION
        return `<td><textarea class="input-full item-desc" name="desc[]" rows="1" style="overflow:hidden; resize:none;"></textarea></td>`;
      case 1: // ACCOUNT
        return `<td class="Acc-col" style="position:relative;">
                  <input type="text" name="account[]" class="input-full account-input" placeholder="+ Create New Account" autocomplete="off">
                  <div class="account-dropdown" style="display:none; position:absolute; background:white; border:1px solid #ccc; max-height:150px; overflow:auto; z-index:999;"></div>
                </td>`;
      case 2: // QTY
        return `<td><input type="number" class="input-short" name="qty[]" value="0" oninput="updateAmount(this)"></td>`;
      case 3: // RATE
        return `<td><input type="number" class="input-short" name="rate[]" value="0" oninput="updateAmount(this)"></td>`;
      case 4: // AMOUNT
        return `<td><input type="number" class="input-short" name="amt[]" value="0" readonly></td>`;
      default: // EXTRA COLUMNS
        return `<td><input type="text" name="${colName}[]"></td>`;
    }
  }).join('');

  tbody.appendChild(row);

  // Populate account combo box
  const selInput = row.querySelector('.account-input');
  if (selInput && window._coaAccounts) setupAccountCombo(selInput, window._coaAccounts);

  // Auto-resize description textarea
  const descTextarea = row.querySelector('.item-desc');
  if (descTextarea) {
    autoResize(descTextarea);
    descTextarea.addEventListener('input', () => autoResize(descTextarea));
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

/* -------------------- 13. SAVE INVOICE (ENTERPRISE FLOW) -------------------- */

let __SAVE_LOCK__ = false; // 🚫 prevent double save

async function saveToDatabase() {

  if (__SAVE_LOCK__) {
    DBG.warn('Save blocked: already saving');
    return false;
  }

  __SAVE_LOCK__ = true;

  try {

    const billTo = getInputValue('billTo');
    const invoiceNo = getInputValue('invoiceNo');
    const date = getInputValue('date');

    if (!billTo || !invoiceNo || !date) {
      alert("Fill Bill To, Invoice No, Date.");
      return false;
    }

    calculateTotals();

    const params = new URLSearchParams(window.location.search);

    // 🧠 ENTERPRISE EDIT DETECTION
    const isEdit =
      params.get('edit') === 'true' ||
      params.get('invoice_no') !== null;

    const ths = $("#items-table thead tr").children;
    const extraColumns = Array.from(ths)
      .slice(5)
      .map(th => th.textContent.trim().toLowerCase().replace(/\s+/g,"_"));

    const rows = $$('#items-body tr');

    const items = rows.map(row => {

      const item = {
        description: row.querySelector('[name="desc[]"]')?.value || "",
        quantity: parseFloat(row.querySelector('[name="qty[]"]')?.value) || 0,
        unit_price: parseFloat(row.querySelector('[name="rate[]"]')?.value) || 0,
        amount: parseFloat(row.querySelector('[name="amt[]"]')?.value) || 0,
        account_id:
          row.querySelector('[name="account[]"]')?.dataset.accountId || ""
      };

      extraColumns.forEach(col => {
        item[col] = row.querySelector(`[name="${col}[]"]`)?.value || '';
      });

      return item;
    });

    const payload = {
      invoice_no: invoiceNo,
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
      }
    };

    const endpoint = isEdit
      ? `/api/invoices/${encodeURIComponent(invoiceNo)}`
      : '/api/invoices';

    const method = isEdit ? 'PUT' : 'POST';

    DBG.log(`[SAVE] ${method} ${endpoint}`);

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error || err.message || 'Save failed');
    }

    DBG.log('Invoice saved successfully');
    return true;

  } catch (err) {
    DBG.error('saveToDatabase error:', err);
    alert('Failed to save invoice: ' + err.message);
    return false;
  } finally {
    __SAVE_LOCK__ = false;
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

}

window.addEventListener('DOMContentLoaded', async () => {

  // ======= RBAC PROTECTION =======
  const allowed = await requireAnyRole(['super', 'approver', 'submitter']);
  if (!allowed) return;

  // ======= 1️⃣ AUTO-FILL DATES =======
  autofillDates();

  // ======= 2️⃣ LOAD ACCOUNTS =======
  await loadAccounts();

  // ======= 3️⃣ LOAD COMPANY INFO =======
  await loadCompanyInfo();

  // ======= 4️⃣ LOAD NEXT INVOICE NO =======
  await loadNextInvoiceNo();

  // ======= 5️⃣ SET INVOICE TITLE =======
  setInvoiceTitleFromURL();

  // ======= 6️⃣ LOAD INVOICE FOR EDIT (if editing) =======
  await loadInvoiceForEdit();

  // ======= 7️⃣ LOAD EWT OPTIONS =======
  await loadEWTOptions();
  
    // ======= 9️⃣ ADJUST COLUMN WIDTHS =======
  adjustColumnWidths();
});

// ===== 8️⃣ CONTACTS AUTOCOMPLETE + MODAL CREATION =====
// ===== ELEMENTS =====
const billToInput = document.getElementById("billTo");
const billToIdInput = document.getElementById("billToId");
const billToDropdown = document.getElementById("billToDropdown");
const tinInput = document.getElementById("tin");
const addressInput = document.getElementById("address");
const termsInput = document.getElementById("terms");
const contactCard = document.getElementById("contactCard");
const billToClearBtn = document.getElementById("billToClearBtn");
const modal = document.getElementById("contactModal");

let contacts = [];
let selectedContact = null;
let isEditing = false;

// ===== LOAD CONTACTS =====
async function loadContacts() {
  try {
    const res = await fetch('/api/contacts');
    if (!res.ok) throw new Error('Failed to fetch contacts');
    contacts = await res.json();
  } catch (err) {
    console.error('Failed to load contacts:', err);
    contacts = [];
  }
}
loadContacts();

// ===== HELPERS =====
function getSelectedContact() {
  const id = billToIdInput.value;
  if (!id) return null;
  return contacts.find(c => String(c.id) === String(id)) || null;
}

// ===== DROPDOWN =====
function renderDropdown(list, searchValue = '') {
  if (selectedContact) return; // locked, don't show dropdown

  billToDropdown.innerHTML = '';
  list.forEach(c => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:6px 10px; cursor:pointer; display:flex; justify-content:space-between; align-items:center';

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.textContent = c.business;
    name.style.fontWeight = 'bold';
    left.appendChild(name);
    if (c.tin) {
      const tin = document.createElement('div');
      tin.textContent = c.tin;
      tin.style.cssText = 'font-size:10px; color:#666';
      left.appendChild(tin);
    }

    const right = document.createElement('div');
    (c.type || '').split(',').forEach(t => {
      if (!t.trim()) return;
      const tag = document.createElement('span');
      tag.textContent = t.trim();
      tag.style.cssText = 'font-size:10px; margin-left:4px; padding:2px 6px; border-radius:4px; background:#e9ecef; font-weight:bold';
      right.appendChild(tag);
    });

    item.appendChild(left);
    item.appendChild(right);
    item.addEventListener('click', () => selectContact(c));

    billToDropdown.appendChild(item);
  });

  if (searchValue && !list.length) {
    const createItem = document.createElement('div');
    createItem.textContent = `➕ Create "${searchValue}" as a new contact`;
    createItem.style.cssText = 'padding:6px 10px; cursor:pointer; font-weight:bold; color:#0d6efd';
    createItem.addEventListener('click', () => openContactModal(searchValue));
    billToDropdown.appendChild(createItem);
  }

  billToDropdown.style.display = billToDropdown.children.length ? 'block' : 'none';
}

// ===== CONTACT CARD =====
function showContactCard(c) {
  if (!contactCard) return;

  document.getElementById('cardBusiness').textContent = c.business;
  document.getElementById('cardCode').textContent = `Account #: ${c.code || '—'}`;
  document.getElementById('cardAddress').textContent = c.address || '—';
  document.getElementById('cardBalance').textContent = (c.balance || 0).toFixed(2);

  const initials = c.business
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  document.getElementById('contactAvatar').textContent = initials;

  document.getElementById('editContactBtn').addEventListener('click', e => {
  e.preventDefault();
  openContactModal(null, selectedContact);
});


  contactCard.style.display = 'block';
}

// ===== SELECT CONTACT =====
function selectContact(c) {
  selectedContact = c;
  billToInput.value = c.business;
  billToInput.readOnly = true;
  billToInput.classList.add('locked');
  billToIdInput.value = c.id;
  tinInput.value = c.tin || '';
  addressInput.value = c.address || '';
  if (termsInput) termsInput.value = c.terms || '';
  billToDropdown.style.display = 'none';
  billToClearBtn.style.display = 'block';
  showContactCard(c);
}

// ===== CLEAR CONTACT =====
function clearSelectedContact() {
  selectedContact = null;
  billToInput.value = '';
  billToInput.readOnly = false;
  billToInput.classList.remove('locked');
  billToIdInput.value = '';
  tinInput.value = '';
  addressInput.value = '';
  if (termsInput) termsInput.value = '';
  contactCard.style.display = 'none';
  billToClearBtn.style.display = 'none';
  billToInput.focus();
}

// ===== INPUT EVENTS =====
billToInput.addEventListener('input', () => {
  if (selectedContact) return;
  const value = billToInput.value.trim().toLowerCase();
  if (!value) {
    billToIdInput.value = '';
    billToDropdown.style.display = 'none';
    return;
  }
  const filtered = contacts.filter(c => c.business && c.business.toLowerCase().includes(value));
  renderDropdown(filtered, billToInput.value);
});

billToInput.addEventListener('click', () => {
  if (selectedContact) {
    contactCard.style.display = contactCard.style.display === 'block' ? 'none' : 'block';
  } else {
    renderDropdown(contacts);
  }
});

billToClearBtn.addEventListener('click', clearSelectedContact);

// ===== CLICK OUTSIDE =====
document.addEventListener('click', e => {
  if (!e.target.closest('#billTo') &&
      !e.target.closest('#billToDropdown') &&
      !e.target.closest('#contactCard') &&
      !e.target.closest('#billToClearBtn') &&
      !e.target.closest('#contactModal')) {
    billToDropdown.style.display = 'none';
    contactCard.style.display = 'none';
  }
});

// ===== MODAL =====
async function openContactModal(name = '', contact = null) {
  isEditing = !!contact;
  modal.style.display = 'flex';
  document.getElementById('modalTitle').textContent = isEditing ? 'Edit Contact' : 'Create New Contact';

  // stop clicks inside modal-content from closing modal
  const modalContent = modal.querySelector('.modal-content');
  modalContent.addEventListener('click', e => e.stopPropagation());

  const fields = [
    'modalType','modalCode','modalBusiness','modalName',
    'modalAddress','modalVatReg','modalTIN','modalPhone','modalEmail'
  ];
  fields.forEach(id => document.getElementById(id).value = '');

  if (isEditing && contact) {
    document.getElementById('modalType').value = contact.type || 'Customer';
    document.getElementById('modalCode').value = contact.code || '';
    document.getElementById('modalBusiness').value = contact.business || '';
    document.getElementById('modalName').value = contact.name || '';
    document.getElementById('modalAddress').value = contact.address || '';
    document.getElementById('modalVatReg').value = contact.vatReg || '';
    document.getElementById('modalTIN').value = contact.tin || '';
    document.getElementById('modalPhone').value = contact.phone || '';
    document.getElementById('modalEmail').value = contact.email || '';
  } else {
    if (name) document.getElementById('modalBusiness').value = name;
    try {
      const res = await fetch('/api/contacts/next-code');
      if (!res.ok) throw new Error('Failed to get next contact code');
      const data = await res.json();
      document.getElementById('modalCode').value = data.nextCode;
    } catch (err) {
      console.error(err);
      alert('Failed to get next contact code');
    }
  }
}

// Close modal function
function closeContactModal() {
  modal.style.display = 'none';
}

// ===== SAVE MODAL =====
document.getElementById('modalSave').addEventListener('click', async e => {
  e.preventDefault();

  const payload = {
    type: document.getElementById('modalType').value,
    code: document.getElementById('modalCode').value,
    business: document.getElementById('modalBusiness').value,
    name: document.getElementById('modalName').value,
    address: document.getElementById('modalAddress').value,
    vatReg: document.getElementById('modalVatReg').value,
    tin: document.getElementById('modalTIN').value,
    phone: document.getElementById('modalPhone').value,
    email: document.getElementById('modalEmail').value
  };

  if (!payload.code || !payload.business || !payload.name) {
    return alert('Required fields missing');
  }

  try {
    let res, savedContact;

    if (isEditing && selectedContact) {
      res = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to update contact');
      savedContact = await res.json();

      const index = contacts.findIndex(c => c.id === selectedContact.id);
      if (index !== -1) contacts[index] = { ...contacts[index], ...payload };
      selectContact(contacts[index]);

    } else {
      res = await fetch('/api/contacts', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to create contact');
      savedContact = await res.json();

      contacts.push({ id: savedContact.id, ...payload });
      selectContact({ id: savedContact.id, ...payload });
    }

    closeContactModal();

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// Cancel button
document.getElementById('modalCancel').addEventListener('click', e => {
  e.preventDefault();
  closeContactModal();
});

// Clicking outside modal closes it
modal.addEventListener('click', closeContactModal);

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

/* -------------------- ENTERPRISE SAVE ACTION HANDLER -------------------- */

async function handleSaveCloseAction(action) {

  const invoiceNo = getInputValue('invoiceNo');

  // ✅ SAVE ONLY ONCE
  const saved = await saveToDatabase();
  if (!saved) return;

  if (action === 'preview') {

    window.location.href =
      `InvoicePreviewViewer.html?invoice_no=${encodeURIComponent(invoiceNo)}`;
    return;
  }

  if (action === 'addAnother') {
    window.location.href = '/Dashboard.html';
    return;
  }

  if (action === 'submitApproval') {

    const user = await fetch('/auth/me', { credentials: 'include' })
      .then(r => r.json());

    if (user?.user?.role !== 'submitter') {
      alert('Only Submitter can submit for approval');
      return;
    }

    try {

      const res = await fetch(
        `/api/invoices/${encodeURIComponent(invoiceNo)}/submit`,
        { method: 'POST' }
      );

      if (!res.ok) throw new Error('Submit failed');

      alert('Invoice submitted for approval!');
      window.location.href = '/Dashboard.html';

    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to submit for approval');
    }
  }
}

/* -------------------- LIVE PREVIEW -------------------- */

const form = document.getElementById('invoiceForm');
const previewBtn = document.getElementById('previewBtn');
const iframe = document.getElementById('invoicePreviewFrame');

// Load Replica.html into iframe (once)
async function loadPreviewHTML() {
  if (!iframe) throw new Error('Preview iframe not found');
  if (iframe.dataset.loaded === 'true') return;

  const res = await fetch('Replica.html');
  if (!res.ok) throw new Error('Failed to fetch Replica.html');

  const html = await res.text();
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.dataset.loaded = 'true'; // ✅ assignment is correct
}

// Get all data from the form
function getInvoiceData() {
  if (!form) return {};
  
  const rows = Array.from(form.querySelectorAll('#items-body tr'));
  const items = rows.map(row => {
    const desc = row.querySelector('[name="desc[]"]')?.value || '';
    const qty = parseFloat(row.querySelector('[name="qty[]"]')?.value) || 0;
    const price = parseFloat(row.querySelector('[name="rate[]"]')?.value) || 0;
    const amount = parseFloat(row.querySelector('[name="amt[]"]')?.value) || 0;

    return { description: desc, qty, price, amount };
  });

  return {
    invoice_no: form.querySelector('#invoice_no')?.value || '',
    date: form.querySelector('[name="date"]')?.value || '',
    billTo: form.querySelector('#billTo')?.value || '',
    address: form.querySelector('#address')?.value || '',
    tin: form.querySelector('#tin')?.value || '',
    terms_table: form.querySelector('#terms')?.value || '',
    exchange_rate: form.querySelector('#exchangeRate')?.value || '',
    items,
    vatableSales: form.querySelector('#vatableSales')?.value || '0.00',
    vatAmount: form.querySelector('#vatAmount')?.value || '0.00',
    vatExemptSales: form.querySelector('#vatExemptSales')?.value || '0.00',
    zeroRatedSales: form.querySelector('#zeroRatedSales')?.value || '0.00',
    subtotal: form.querySelector('#subtotal')?.value || '0.00',
    discount: form.querySelector('#discount')?.value || '0.00',
    withholdingTax: form.querySelector('#withholdingTaxAmount')?.value || '0.00',
    totalPayable: form.querySelector('#totalPayable')?.value || '0.00',
    footer_bir_permit: form.querySelector('[name="footerBirPermit"]')?.value || '',
    footer_bir_date: form.querySelector('[name="footerBirDate"]')?.value || '',
    footer_serial_nos: form.querySelector('[name="footerSerialNos"]')?.value || ''
  };
}

// Format number as PHP currency
function formatCurrency(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

// Update the iframe content
function updatePreview() {
  if (!iframe || !iframe.contentDocument) return;

  const data = getInvoiceData();
  const doc = iframe.contentDocument;

  // ---------- HEADER ----------
  const headerFields = [
    'invoice_no',
    'invoice_date',
    'billTo',
    'address',
    'tin',
    'terms_table',
    'exchange_rate'
  ];

  headerFields.forEach(id => {
    const el = doc.getElementById(id);
    if (el) {
      // exchange_rate may be a number
      if (id === 'exchange_rate') {
        el.textContent = data.exchange_rate ?? '';
      } else {
        el.textContent = data[id] ?? '';
      }
    }
  });

  // ---------- ITEMS TABLE ----------
  const tbody = doc.getElementById('itemRows');
  if (tbody) {
    tbody.innerHTML = '';

    data.items.forEach(item => {
      const tr = doc.createElement('tr');

      const descTd = doc.createElement('td');
      descTd.textContent = item.description || '';
      tr.appendChild(descTd);

      const qtyTd = doc.createElement('td');
      qtyTd.textContent = item.qty ?? 0;
      tr.appendChild(qtyTd);

      const priceTd = doc.createElement('td');
      priceTd.textContent = formatCurrency(item.price ?? 0);
      tr.appendChild(priceTd);

      const amountTd = doc.createElement('td');
      amountTd.textContent = formatCurrency(item.amount ?? 0);
      tr.appendChild(amountTd);

      tbody.appendChild(tr);
    });
  }

  // ---------- TAX SUMMARY ----------
  const taxFields = [
    { id: 'vatableSales', value: data.vatableSales },
    { id: 'vatAmount', value: data.vatAmount },
    { id: 'vatExemptSales', value: data.vatExemptSales },
    { id: 'zeroRatedSales', value: data.zeroRatedSales },
    { id: 'subtotal', value: data.subtotal },
    { id: 'discount', value: data.discount },
    { id: 'withholdingTax', value: parseFloat(data.withholdingTax) || 0 },
    { id: 'withholdingTaxAmount', value: data.withholdingTax },
    { id: 'totalPayable', value: data.totalPayable }
  ];

  taxFields.forEach(f => {
    const el = doc.getElementById(f.id);
    if (!el) return;

    if (f.id === 'discount') {
      el.value = f.value ?? 0;
    } else if (f.id === 'withholdingTax') {
      el.value = f.value ?? 0;
    } else if (f.id === 'withholdingTaxAmount') {
      el.textContent = formatCurrency(f.value ?? 0);
    } else {
      el.textContent = formatCurrency(f.value ?? 0);
    }
  });

  // ---------- FOOTER ----------
  const footerFields = [
    { id: 'footer-bir-permit', value: data.footer_bir_permit },
    { id: 'footer-bir-date', value: data.footer_bir_date },
    { id: 'footer-serial-nos', value: data.footer_serial_nos }
  ];

  footerFields.forEach(f => {
    const el = doc.getElementById(f.id);
    if (el) el.textContent = f.value ?? '';
  });
}


// Toggle iframe preview
async function showPreviewToggle() {
  if (!iframe) return;

  const visible = iframe.style.display && iframe.style.display !== 'none';
  if (visible) {
    iframe.style.display = 'none';
    previewBtn.setAttribute('aria-pressed', 'false');
    return;
  }

  try {
    await loadPreviewHTML();
    updatePreview();
    iframe.style.display = 'block';
    previewBtn.setAttribute('aria-pressed', 'true');
  } catch (err) {
    console.error('Failed to load preview', err);
    alert('Failed to load preview: ' + err.message);
  }
}

// Event listeners
if (previewBtn) previewBtn.addEventListener('click', showPreviewToggle);
if (form) form.addEventListener('input', updatePreview);


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
