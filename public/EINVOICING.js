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
  // Try by name (input/select), then by id
  const elByName = document.querySelector(`input[name="${name}"], select[name="${name}"]`);
  if (elByName) {
    if (elByName.type === 'checkbox') return elByName.checked;
    return elByName.value;
  }
  const elById = document.getElementById(name);
  if (!elById) return '';
  if (elById.type === 'checkbox') return elById.checked;
  // Return value or textContent for non-input elements
  return elById.value ?? elById.textContent ?? '';
}

function setInputValue(name, value) {
  const elByName = document.querySelector(`input[name="${name}"], select[name="${name}"]`);
  if (elByName) {
    if (elByName.type === 'checkbox') elByName.checked = !!value;
    else elByName.value = value;
    return;
  }
  const elById = document.getElementById(name);
  if (!elById) return;
  if (elById.type === 'checkbox') elById.checked = !!value;
  else if ('value' in elById) elById.value = value;
  else elById.textContent = value;
}

/* -------------------- 2. COMPANY INFO -------------------- */
async function loadCompanyInfo() {
  DBG.log('loadCompanyInfo() start');
  try {
    const res = await fetch('/get-company-info');
    if (!res.ok) { DBG.warn('company info fetch not ok'); return; }
    const company = await res.json();
    if (!company) return;

    safeSetValue('input[name="billTo"]', company.company_name || '');
    safeSetValue('input[name="address1"]', company.company_address || '');
    safeSetValue('input[name="address2"]', '');
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

    DBG.log('loadCompanyInfo() done', company.company_name);
  } catch (err) {
    DBG.warn('Failed to load company info:', err);
  }
}

/* -------------------- 3. NEXT INVOICE NO -------------------- */
async function loadNextInvoiceNo() {
  try {
    const res = await fetch('/api/next-invoice-no');
    const data = await res.json();
    const el = document.getElementById('invoice_no');
    if (el) el.value = data.invoiceNo || '';
  } catch (err) {
    DBG.error('Failed to fetch next invoice number', err);
  }
}

/* -------------------- 4. INVOICE TITLE FROM URL -------------------- */
async function setInvoiceTitleFromURL() {
  DBG.log('setInvoiceTitleFromURL()');
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const typeMap = {
    sales: 'SALES INVOICE',
    commercial: 'COMMERCIAL INVOICE',
    credit: 'CREDIT MEMO',
    debit: 'DEBIT MEMO'
  };
  const invoiceTitle = typeMap[type] || 'SERVICE INVOICE';

  const titleEl = document.querySelector('.invoice-title');
  if (titleEl) titleEl.textContent = invoiceTitle;
  localStorage.setItem('selectedInvoiceType', invoiceTitle);

  const invoiceNoEl = document.querySelector('#invoice_no');
  const invoiceNo = invoiceNoEl ? invoiceNoEl.value.trim() : '';
  if (!invoiceNo) return;

  try {
    await fetch('/api/invoice/save-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceNo, invoiceTitle })
    });
  } catch (err) { DBG.warn('Failed to save invoice title:', err); }
}

/* -------------------- 5. LOAD INVOICE FOR EDIT -------------------- */
async function loadInvoiceForEdit() {
  DBG.log('loadInvoiceForEdit()');
  try {
    const params = new URLSearchParams(window.location.search);
    const invoiceNo = params.get('invoice_no');
    const isEdit = params.get('edit') === 'true';
    if (!invoiceNo || !isEdit) return;

    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
    if (!res.ok) throw new Error('Failed to fetch invoice');
    const data = await res.json();

    setInputValue('billTo', data.bill_to || "");
    setInputValue('address1', data.address1 || "");
    setInputValue('address2', data.address2 || "");
    setInputValue('tin', data.tin || "");
    setInputValue('terms', data.terms || "");
    setInputValue('invoiceNo', data.invoice_no || "");
    setInputValue('date', dateToYYYYMMDD(data.date));

    const titleEl = document.querySelector('.invoice-title');
    if (titleEl && data.invoice_title) titleEl.textContent = data.invoice_title;

    const theadRow = document.querySelector("#items-table thead tr");
    if (theadRow) {
      theadRow.innerHTML = "";
      ["Description","Account","Qty","Rate","Amt"].forEach(label=>{
        const th=document.createElement("th"); th.textContent=label; theadRow.appendChild(th);
      });
      (data.extra_columns||[]).forEach(col=>{
        const th=document.createElement("th");
        th.textContent = col.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase());
        theadRow.appendChild(th);
      });
    }

    const tbody = document.getElementById("items-body");
    if (tbody) {
      tbody.innerHTML = "";
      (data.items||[]).forEach(item=>{
        const row=document.createElement("tr");
        row.innerHTML=`
          <td><input type="text" class="input-full" name="desc[]" value="${item.description||""}"></td>
          <td><select name="account[]" class="input-full"><option value="">+ Create New Account</option></select></td>
          <td><input type="number" class="input-short" name="qty[]" value="${item.quantity||0}" oninput="updateAmount(this)"></td>
          <td><input type="number" class="input-short" name="rate[]" value="${item.unit_price||0}" oninput="updateAmount(this)"></td>
          <td><input type="number" class="input-short" name="amt[]" value="${item.amount||0}" readonly></td>
        `;
        (data.extra_columns||[]).forEach(col=>{
          const td=document.createElement("td");
          td.innerHTML=`<input type="text" name="${col}[]" value="${item[col]||""}">`;
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
    }

    if (data.logo) {
      const logoEl = document.getElementById("uploaded-logo");
      if (logoEl) { logoEl.src = data.logo; logoEl.style.display = "block"; }
    }

    adjustColumnWidths();
    DBG.log('Invoice loaded for edit:', invoiceNo);
  } catch (err) { DBG.error('Error loading invoice for edit:', err); }
}

/* -------------------- 6. SAVE INVOICE -------------------- */
async function saveToDatabase() {
  DBG.log('saveToDatabase() called');
  const billTo = getInputValue('billTo');
  // support both name 'invoiceNo' and id 'invoice_no'
  const invoiceNo = getInputValue('invoiceNo') || document.getElementById('invoice_no')?.value || '';
  const date = getInputValue('date');
  if (!billTo || !invoiceNo || !date) return alert("Fill Bill To, Invoice No, Date.");

  calculateTotals();

  const allThs = document.querySelectorAll("#items-table thead th");
  const extraColumns = Array.from(allThs).slice(5).map(th=>th.textContent.trim().toLowerCase().replace(/\s+/g,"_"));
  const items = Array.from(document.querySelectorAll("#items-body tr")).map(row=>{
    const item = {
      description: row.querySelector('[name="desc[]"]')?.value || "",
      quantity: parseInt(row.querySelector('[name="qty[]"]')?.value) || 0,
      unit_price: parseFloat(row.querySelector('[name="rate[]"]')?.value) || 0,
      amount: parseFloat(row.querySelector('[name="amt[]"]')?.value) || 0
    };
    extraColumns.forEach(col=>{
      const input = row.querySelector(`[name="${col}[]"]`);
      item[col] = input?.value || "";
    });
    return item;
  });

  const invoiceData = {
    invoice_no: invoiceNo,
    bill_to: billTo,
    date,
    items,
    invoice_title: getInputValue('invoiceTitle') || localStorage.getItem('selectedInvoiceType') || 'SERVICE INVOICE'
  };

  try {
    const params = new URLSearchParams(window.location.search);
    const isEdit = params.get("edit") === "true";
    let method = 'POST', url = '/api/invoices';
    if (isEdit) { method = 'PUT'; url = `/api/invoices/${encodeURIComponent(invoiceNo)}`; }
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(invoiceData) });
    const result = await res.json();
    if (res.ok) { alert(isEdit ? "Invoice updated!" : "Invoice saved!"); window.location.href = `/Replica.html?invoice_no=${invoiceNo}`; }
    else alert("Error: " + (result.error || "Unknown error"));
  } catch (err) { alert("Error saving invoice"); DBG.error(err); }
}

/* -------------------- 7. ROW & COLUMN ACTIONS -------------------- */
function addRow() {
  const tbody = $("#items-body");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="text" class="input-full" name="desc[]"></td>
    <td><select name="account[]" class="input-full"><option value="">+ Create New Account</option></select></td>
    <td><input type="number" class="input-short" name="qty[]"></td>
    <td><input type="number" class="input-short" name="rate[]"></td>
    <td><input type="number" class="input-short" name="amt[]" readonly></td>`;
  tbody.appendChild(row);
  adjustColumnWidths();
}

function removeRow() {
  const tbody = $("#items-body");
  if (!tbody) return;
  if (tbody.rows.length <= 1) return alert("At least one row must remain.");
  tbody.deleteRow(tbody.rows.length - 1);
  calculateTotals();
  adjustColumnWidths();
}

function addColumn() {
  const name = prompt("Enter new column name:");
  if (!name) return;
  const colKey = name.toLowerCase().replace(/\s+/g,"_");
  const theadRow = $("#items-table thead tr");
  const th = document.createElement("th");
  th.textContent = name;
  theadRow.appendChild(th);
  $$("#items-body tr").forEach(row=>{
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" name="${colKey}[]">`;
    row.appendChild(td);
  });
  adjustColumnWidths();
}

function removeColumn() {
  const name = prompt("Enter exact column name to remove:");
  if (!name) return;
  const thead = $("#items-table thead tr");
  const ths = Array.from(thead.querySelectorAll("th"));
  const index = ths.findIndex(th => th.textContent.trim().toLowerCase() === name.trim().toLowerCase());
  if (index === -1) return alert("Column not found.");
  if (index <= 4) return alert("Default columns cannot be removed.");
  ths[index].remove();
  $$("#items-body tr").forEach(row => row.querySelectorAll("td")[index]?.remove());
  adjustColumnWidths();
}

/* -------------------- 8. CALCULATIONS -------------------- */
function updateAmount(input) {
  const row = input.closest("tr");
  if (!row) return;
  const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
  const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;
  const amtEl = row.querySelector('[name="amt[]"]');
  if (amtEl) amtEl.value = (qty * rate).toFixed(2);
  calculateTotals();
}

function calculateTotals() {
  let total = 0;
  $$('input[name="amt[]"]').forEach(a => {
    total += parseFloat(a.value) || 0;
  });

  const vatType = document.getElementById('vatType')?.value || 'inclusive';

  let vatable = 0, vat = 0, withholding = 0, finalTotal = 0;

  if (vatType === 'inclusive') {
    vatable = total / 1.12;
    vat = total - vatable;
    withholding = vatable * 0.02;
    finalTotal = total - withholding;

  } else if (vatType === 'exclusive') {
    vatable = total;
    vat = vatable * 0.12;
    withholding = vatable * 0.02;
    finalTotal = vatable + vat - withholding;

  } else if (vatType === 'nonvat') {
    vatable = total;
    vat = 0;
    withholding = 0;
    finalTotal = total;
  }

  // Update VISIBLE TABLE (inputs)
  safeSetValue("#vatableSales", vatable.toFixed(2));
  safeSetValue("#vatAmount", vat.toFixed(2));
  safeSetValue("#subtotal", total.toFixed(2));
  safeSetValue("#withholdingTax", withholding.toFixed(2));
  safeSetValue("#totalPayable", finalTotal.toFixed(2));

  // Update HIDDEN DATABASE FIELDS if present
  safeSetValue("#vatable_sales_val", vatable.toFixed(2));
  safeSetValue("#vat_amount_val", vat.toFixed(2));
  safeSetValue("#withholding_val", withholding.toFixed(2));
  safeSetValue("#total_val", finalTotal.toFixed(2));
}


/* -------------------- 9. UI ADJUSTMENTS -------------------- */
function adjustColumnWidths() {
  const table = $("#items-table");
  if (!table) return;
  const ths = table.querySelectorAll("thead th");
  if (!ths.length) return;
  const colWidth = 100 / ths.length + "%";
  ths.forEach(th => th.style.width = colWidth);
  $$("tbody tr", table).forEach(row => row.querySelectorAll("td").forEach(td => td.style.width = colWidth));
}

/* -------------------- 10. LOGO -------------------- */
function previewLogo(event) {
  const img = $("#uploaded-logo");
  const btn = $("#remove-logo-btn");
  const file = event?.target?.files?.[0];
  if (!img || !btn || !file) return;
  const reader = new FileReader();
  reader.onload = e => {
    img.src = e.target.result;
    img.style.display = "block";
    btn.style.display = "inline-block";
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  const img = $("#uploaded-logo");
  const btn = $("#remove-logo-btn");
  const input = $("#logo-upload");
  if (img) { img.src = ""; img.style.display = "none"; }
  if (btn) btn.style.display = "none";
  if (input) input.value = "";
}

/* -------------------- 11. INIT UI -------------------- */
function attachUIHandlers(){
  const saveBtn = $("#saveBtn") || $("#saveInvoiceBtn");
  if (saveBtn) saveBtn.addEventListener('click', saveToDatabase);
  const logoUpload = $("#logo-upload");
  if (logoUpload) logoUpload.addEventListener('change', previewLogo);
  const removeLogoBtn = $("#remove-logo-btn");
  if (removeLogoBtn) removeLogoBtn.addEventListener('click', removeLogo);
}

window.addEventListener('DOMContentLoaded', () => {
  DBG.log('DOM loaded — init');
  attachUIHandlers();
  loadNextInvoiceNo();
  loadCompanyInfo();
  setInvoiceTitleFromURL();
  loadInvoiceForEdit();
});
