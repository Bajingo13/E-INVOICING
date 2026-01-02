'use strict';

/* -------------------- 0. DEBUG & DOM HELPERS -------------------- */
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
    safeSetValue('input[name="invoiceNo"]', data.invoiceNo || '');
  } catch (err) { DBG.error('Failed to fetch next invoice number', err); }
}

/* -------------------- 4. INVOICE TITLE -------------------- */
function setInvoiceTitleFromURL() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const typeMap = { sales: 'SALES INVOICE', commercial: 'COMMERCIAL INVOICE', credit: 'CREDIT MEMO', debit: 'DEBIT MEMO' };
  const invoiceTitle = typeMap[type] || 'SERVICE INVOICE';

  safeSetText('.invoice-title', invoiceTitle);

  // ✅ update hidden input as well
  const invoiceTypeInput = document.getElementById('invoice_type');
  if (invoiceTypeInput) invoiceTypeInput.value = invoiceTitle;

  localStorage.setItem('selectedInvoiceType', invoiceTitle);
}


/* -------------------- 5. LOAD INVOICE FOR EDIT -------------------- */
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

    // **NEW FIELDS**
    setInputValue('invoiceMode', data.invoice_mode || 'standard');
    setInputValue('invoiceCategory', data.invoice_category || 'service');
    safeSetText('.invoice-title', data.invoice_title || 'SERVICE INVOICE');

    const theadRow = $("#items-table thead tr");
    if (theadRow) {
      theadRow.innerHTML = `<th>DESCRIPTION</th><th>ACCOUNT</th><th>QTY</th><th>RATE</th><th>AMOUNT</th>`;
      (data.extra_columns || []).forEach(col => {
        const th = document.createElement("th");
        th.textContent = col.replace(/_/g, " ").toUpperCase();
        theadRow.appendChild(th);
      });
    }

    const tbody = $("#items-body");
    if (tbody) {
      tbody.innerHTML = "";
      (data.items || []).forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td><input type="text" class="input-full" name="desc[]" value="${item.description || ""}"></td>
          <td><select name="account[]" class="input-full"></select></td>
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
    }

    if (window._coaAccounts) {
      $$('select[name="account[]"]').forEach(select => populateAccountSelect(select, window._coaAccounts));
      (data.items || []).forEach((item, i) => {
        const sel = tbody.rows[i].querySelector('select[name="account[]"]');
        if (sel) sel.value = item.account_id || '';
      });
    }

    if (data.tax_summary) {
      const ts = data.tax_summary || {};
      safeSetValue('#subtotal', ts.subtotal || 0);
      safeSetValue('#vatableSales', ts.vatable_sales || 0);
      safeSetValue('#vatAmount', ts.vat_amount || 0);
      safeSetValue('#withholdingTax', ts.withholding || ts.withholdingTax || 0);
      safeSetValue('#totalPayable', ts.total_payable || ts.total || 0);
    }

    adjustColumnWidths();
  } catch (err) { DBG.error('Error loading invoice for edit:', err); }
}

/* -------------------- 6. CHART OF ACCOUNTS -------------------- */
async function loadAccounts() {
  try {
    const res = await fetch('/api/coa');
    if (!res.ok) throw new Error('Failed to fetch accounts');
    const accounts = await res.json();
    window._coaAccounts = accounts;
    $$('select[name="account[]"]').forEach(select => populateAccountSelect(select, accounts));
  } catch (err) { DBG.error('loadAccounts error:', err); }
}

function populateAccountSelect(selectEl, accounts) {
  if (!selectEl) return;

  selectEl.innerHTML = '';
  const createOption = document.createElement('option');
  createOption.value = '_create_';
  createOption.textContent = '+ Create New Account';
  selectEl.appendChild(createOption);

  accounts.forEach(acc => {
    if (!acc.title) return;
    const opt = document.createElement('option');
    opt.value = acc.id;
    opt.textContent = `${acc.code || ''} - ${acc.title}`;
    selectEl.appendChild(opt);
  });

  selectEl.addEventListener('change', function() {
    if (this.value === '_create_') window.location.href = 'http://localhost:3000/COA.HTML';
  });
}

/* -------------------- 7. ADD / REMOVE ROW -------------------- */
function addRow() {
  const tbody = $("#items-body");
  if (!tbody) return;
  const ths = $("#items-table thead tr").children;
  const row = document.createElement("tr");

  row.innerHTML = Array.from(ths).map((th, i) => {
    const colName = th.textContent.trim().toLowerCase().replace(/\s+/g, "_");
    switch(i) {
      case 0: return `<td><input type="text" class="input-full" name="desc[]"></td>`;
      case 1: return `<td><select name="account[]" class="input-full"></select></td>`;
      case 2: return `<td><input type="number" class="input-short" name="qty[]" value="0" oninput="updateAmount(this)"></td>`;
      case 3: return `<td><input type="number" class="input-short" name="rate[]" value="0" oninput="updateAmount(this)"></td>`;
      case 4: return `<td><input type="number" class="input-short" name="amt[]" value="0" readonly></td>`;
      default: return `<td><input type="text" name="${colName}[]"></td>`;
    }
  }).join('');

  tbody.appendChild(row);

  const sel = row.querySelector('select[name="account[]"]');
  if (sel && window._coaAccounts) populateAccountSelect(sel, window._coaAccounts);

  adjustColumnWidths();
}

function removeRow() {
  const tbody = $("#items-body");
  if (!tbody || tbody.rows.length <= 1) return alert("At least one row must remain.");
  tbody.deleteRow(tbody.rows.length - 1);
  calculateTotals();
  adjustColumnWidths();
}

/* -------------------- 8. AMOUNT & TOTALS -------------------- */
function updateAmount(input) {
  const row = input.closest("tr");
  if (!row) return;
  const qty = parseFloat(row.querySelector('[name="qty[]"]')?.value) || 0;
  const rate = parseFloat(row.querySelector('[name="rate[]"]')?.value) || 0;
  const amtEl = row.querySelector('[name="amt[]"]');
  if (amtEl) amtEl.value = (qty * rate).toFixed(2);
  calculateTotals();
}

function calculateTotals() {
  let total = 0;
  $$('input[name="amt[]"]').forEach(a => total += parseFloat(a.value) || 0);
  const discountPercent = parseFloat($('#discount')?.value) || 0;
  const discountFraction = (discountPercent > 1 ? discountPercent / 100 : discountPercent);
  const totalAfterDiscount = total - (total * discountFraction);

  const vatType = $('#vatType')?.value || 'inclusive';
  let vatable = 0, vat = 0, withholding = 0, finalTotal = 0;

  if (vatType === 'inclusive') {
    vatable = totalAfterDiscount / 1.12;
    vat = totalAfterDiscount - vatable;
    withholding = vatable * 0.02;
    finalTotal = totalAfterDiscount - withholding;
  } else if (vatType === 'exclusive') {
    vatable = totalAfterDiscount;
    vat = vatable * 0.12;
    withholding = vatable * 0.02;
    finalTotal = vatable + vat - withholding;
  } else {
    vatable = totalAfterDiscount;
    finalTotal = totalAfterDiscount;
  }

  safeSetValue('#subtotal', total.toFixed(2));
  safeSetValue('#vatableSales', vatable.toFixed(2));
  safeSetValue('#vatAmount', vat.toFixed(2));
  safeSetValue('#withholdingTax', withholding.toFixed(2));
  safeSetValue('#totalPayable', finalTotal.toFixed(2));
}

$('#discount')?.addEventListener('change', calculateTotals);

/* -------------------- 9. ADJUST COLUMN WIDTHS -------------------- */
function adjustColumnWidths() {
  const table = $("#items-table"); if (!table) return;
  const ths = table.querySelectorAll("thead th");
  const colWidth = (100 / ths.length).toFixed(2) + "%";
  ths.forEach(th => th.style.width = colWidth);
  $$("tbody tr", table).forEach(row => row.querySelectorAll("td").forEach(td => td.style.width = colWidth));
}

/* -------------------- 10. MODALS & EXTRA COLUMNS -------------------- */
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
    const th = document.createElement("th"); th.textContent = name;
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
    const name = $('#removeColumnName').value.trim().toLowerCase();
    const msg = $('#removeColumnMessage'); msg.textContent = '';
    if (!name) { msg.textContent = "Column name cannot be empty!"; return; }

    const ths = Array.from($("#items-table thead tr th"));
    const index = ths.findIndex(th => th.textContent.trim().toLowerCase() === name);
    if (index === -1) { msg.textContent = `Column "${name}" not found!`; return; }
    if (index <= 4) { msg.textContent = "Default columns cannot be removed."; return; }

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

/* -------------------- 11. LOGO -------------------- */
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
// ===============================
// Footer helpers
// ===============================
function getFooterValue(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? el.value : null;
}


/* -------------------- 12. SAVE INVOICE -------------------- */
async function saveToDatabase() {
const billToSelect = document.getElementById('billTo');
const billToId = billToSelect?.value || '';
const billToName = billToSelect?.selectedOptions?.[0]?.textContent || '';

const payload = {
  invoice_no: invoiceNo,
  bill_to: billToName,    // save name for printable
  bill_to_id: billToId,   // keep ID for reference
  address: getInputValue('address'),
  tin: getInputValue('tin'),
  date,
  terms: getInputValue('terms'),
  invoice_title: $('.invoice-title')?.textContent || 'SERVICE INVOICE',
  items,
  extra_columns: extraColumns,
  tax_summary: {
    subtotal: parseFloat($('#subtotal')?.value) || 0,
    vatable_sales: parseFloat($('#vatableSales')?.value) || 0,
    vat_amount: parseFloat($('#vatAmount')?.value) || 0,
    withholding: parseFloat($('#withholdingTax')?.value) || 0,
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

  const invoiceNo = getInputValue('invoiceNo');
  const date = getInputValue('date');
  if (!billTo || !invoiceNo || !date) return alert("Fill Bill To, Invoice No, Date.");

  calculateTotals();

  const ths = $("#items-table thead tr").children;
  const extraColumns = Array.from(ths).slice(5).map(th => th.textContent.trim().toLowerCase().replace(/\s+/g,"_"));

  const rows = $$('#items-body tr');
  const items = rows.map(row => {
    const item = {
      description: row.querySelector('[name="desc[]"]')?.value || "",
      quantity: parseFloat(row.querySelector('[name="qty[]"]')?.value) || 0,
      unit_price: parseFloat(row.querySelector('[name="rate[]"]')?.value) || 0,
      amount: parseFloat(row.querySelector('[name="amt[]"]')?.value) || 0,
      account_id: row.querySelector('[name="account[]"]')?.value || ""
    };
    extraColumns.forEach(col => item[col] = row.querySelector(`[name="${col}[]"]`)?.value || '');
    return item;
  });

  DBG.log('Saving invoice payload:', payload);

  try {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });

    if (!res.ok) { 
      let errBody = null;
      try { errBody = await res.json(); } catch (e) {}
      const message = (errBody && (errBody.error || errBody.message)) || `${res.status} ${res.statusText}`;
      DBG.error('saveToDatabase server error:', errBody || res.statusText);
      alert('Failed to save invoice: ' + message);
      throw new Error('Failed to save invoice: ' + message);
    }

    alert('Invoice saved successfully!');
    window.location.reload();
  } catch (err) { DBG.error('saveToDatabase error:', err); alert('Failed to save invoice'); }
}


/* -------------------- 13. INIT -------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  await loadAccounts();
  await loadCompanyInfo();
  await loadNextInvoiceNo();
  setInvoiceTitleFromURL();
  await loadInvoiceForEdit();

  // -------------------- LOAD CONTACTS FOR BILLING --------------------
  const billToSelect = document.getElementById("billTo");
  const tinInput = document.getElementById("tin");
  const addressInput = document.getElementById("address");
  const termsInput = document.getElementById("terms"); // optional

  let contacts = [];
  try {
    const res = await fetch('/api/contacts?type=Customer'); // adjust type if needed
    contacts = await res.json();

    // populate select
    billToSelect.innerHTML = '<option value="">-- Select Customer --</option>';
    contacts.forEach(c => {
      const option = document.createElement("option");
      option.value = c.id;
      option.textContent = c.name;
      billToSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load contacts:', err);
  }

  // auto-fill fields on selection
  billToSelect.addEventListener("change", () => {
    const selectedId = billToSelect.value;
    const contact = contacts.find(c => c.id == selectedId);
    if (contact) {
      tinInput.value = contact.tin || "";
      addressInput.value = contact.address || "";
      if (termsInput) termsInput.value = contact.terms || ""; // optional
    } else {
      tinInput.value = "";
      addressInput.value = "";
      if (termsInput) termsInput.value = "";
    }
  });
  // -------------------- END CONTACTS --------------------

  adjustColumnWidths();
});

/* -------------------- 14. SAVE & CLOSE / APPROVE DROPDOWN -------------------- */
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
    try {
      const res = await fetch(`/api/invoices/${invoiceNo}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Approval failed');
      alert('Invoice submitted for approval!');
      window.location.reload();
    } catch (err) {
      console.error('Approval error:', err);
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

// Toggle preview: only load and show when user clicks Preview
async function showPreviewToggle() {
  const iframe = document.getElementById('invoicePreviewFrame');
  if (!iframe) { DBG.warn('Preview iframe not present in DOM.'); return; }

  const visible = iframe.style.display && iframe.style.display !== 'none';
  if (visible) {
    iframe.style.display = 'none';
    previewBtn.setAttribute('aria-pressed', 'false');
    return;
  }

  // show and load preview HTML (if not loaded)
  iframe.style.display = 'block';
  previewBtn.setAttribute('aria-pressed', 'true');

  try {
    await loadPreviewHTML();
    // populate preview with current form data
    updatePreview(getInvoiceData());
  } catch (err) {
    DBG.error('Failed to show preview:', err);
    alert('Failed to load preview: ' + (err.message || err));
    iframe.style.display = 'none';
    previewBtn.setAttribute('aria-pressed', 'false');
  }
}

// Bind preview button and form input only if elements exist
if (previewBtn) {
  previewBtn.addEventListener('click', () => {
    showPreviewToggle();
  });
} else {
  DBG.warn('previewBtn not found in DOM; preview disabled.');
}

if (form) {
  form.addEventListener('input', () => {
    // update preview only when visible
    const iframe = document.getElementById('invoicePreviewFrame');
    if (iframe && iframe.style.display && iframe.style.display !== 'none') {
      updatePreview(getInvoiceData());
    }
  });
} else {
  DBG.warn('invoiceForm not found in DOM; live preview and some selectors may not work.');
}

const invoiceDropdown = document.getElementById('invoiceDropdown');
  const invoiceTypeInput = document.getElementById('invoice_type');
  const createInvoiceBtn = document.getElementById('createInvoiceBtn');

  invoiceDropdown.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', function(e) {
      e.preventDefault(); // prevent navigation
      const type = this.getAttribute('href').split('type=')[1];
      invoiceTypeInput.value = type.toUpperCase().replace(/_/g, ' '); // optional formatting
      createInvoiceBtn.textContent = this.textContent; // update button label
      invoiceDropdown.classList.remove('show'); // hide dropdown
    });
  });
