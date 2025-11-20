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
  const el = document.querySelector(`input[name="${name}"], select[name="${name}"]`);
  if (!el) return '';
  if (el.type === 'checkbox') return el.checked;
  return el.value;
}

function setInputValue(name, value) {
  const el = document.querySelector(`input[name="${name}"], select[name="${name}"]`);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = !!value;
  else el.value = value;
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

// Call on page load
async function loadNextInvoiceNo() {
  try {
    const res = await fetch('/api/next-invoice-no');
    const data = await res.json();
    document.getElementById('invoice_no').value = data.invoiceNo || '';
  } catch (err) {
    console.error('Failed to fetch next invoice number', err);
  }
}
window.addEventListener('DOMContentLoaded', loadNextInvoiceNo);

/* -------------------- 3. INVOICE TITLE FROM URL -------------------- */

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
  if (!invoiceNo) {
    DBG.warn('No invoice number present; stored locally only');
    return;
  }

  try {
    const res = await fetch('/api/invoice/save-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceNo, invoiceTitle })
    });
    const json = await res.json();
    DBG.log('Invoice title synced:', json);
  } catch (err) {
    DBG.warn('Failed to save invoice title:', err);
  }
}

/* -------------------- 4. LOAD INVOICE FOR EDITING -------------------- */

async function loadInvoiceForEdit() {
  DBG.log('loadInvoiceForEdit()');
  try {
    const params = new URLSearchParams(window.location.search);
    const invoiceNo = params.get('invoice_no');
    const isEdit = params.get('edit') === 'true';
    if (!invoiceNo || !isEdit) { DBG.log('Not in edit mode'); return; }

    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
    if (!res.ok) throw new Error('Failed to fetch invoice');
    const data = await res.json();

    $$('input[name="footerAtpDate"]').forEach(input => input.value = dateToYYYYMMDD(data.footer?.atp_date));
    $$('input[name="footerBirDate"]').forEach(input => input.value = dateToYYYYMMDD(data.footer?.bir_date));

    setInputValue('billTo', data.bill_to || "");
    setInputValue('address1', data.address1 || "");
    setInputValue('address2', data.address2 || "");
    setInputValue('tin', data.tin || "");
    setInputValue('terms', data.terms || "");
    const invoiceNoInput = $('input[name="invoiceNo"]');
    if (invoiceNoInput) invoiceNoInput.value = data.invoice_no || "";
    const dateInput = $('input[name="date"]');
    if (dateInput) dateInput.value = dateToYYYYMMDD(data.date);

    const titleEl = document.querySelector('.invoice-title');
    if (titleEl && data.invoice_title) titleEl.textContent = data.invoice_title;

    const defaultCols = [
      { label: "Description", key: "description" },
      { label: "Qty", key: "quantity" },
      { label: "Rate", key: "unit_price" },
      { label: "Amt", key: "amount" }
    ];
    const extraColKeys = Array.isArray(data.extra_columns) ? data.extra_columns : [];
    const theadRow = document.querySelector("#items-table thead tr");
    if (theadRow) {
      theadRow.innerHTML = "";
      defaultCols.forEach(col => {
        const th = document.createElement("th"); th.textContent = col.label; theadRow.appendChild(th);
      });
      extraColKeys.forEach(colKey => {
        const th = document.createElement("th");
        th.textContent = colKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        theadRow.appendChild(th);
      });
    }

    const tbody = document.getElementById("items-body");
    if (tbody) {
      tbody.innerHTML = "";
      (data.items || []).forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td><input type="text" class="input-full" name="desc[]" value="${item.description || ""}"></td>
          <td><input type="number" class="input-short" name="qty[]" value="${item.quantity || 0}" oninput="updateAmount(this)"></td>
          <td><input type="number" class="input-short" name="rate[]" value="${item.unit_price || 0}" oninput="updateAmount(this)"></td>
          <td><input type="number" class="input-short" name="amt[]" value="${item.amount || 0}" readonly></td>
        `;
        extraColKeys.forEach(colKey => {
          const td = document.createElement("td");
          td.innerHTML = `<input type="text" name="${colKey}[]" value="${item[colKey] || ""}">`;
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
    }

    setInputValue('cash', !!data.payment?.cash);
    setInputValue('payDate', dateToYYYYMMDD(data.payment?.pay_date));
    setInputValue('checkNo', data.payment?.check_no || "");
    setInputValue('bank', data.payment?.bank || "");
    setInputValue('vatableSales', data.payment?.vatable_sales || 0);
    setInputValue('vatExempt', data.payment?.vat_exempt || 0);
    setInputValue('zeroRated', data.payment?.zero_rated || 0);
    setInputValue('vatAmount', data.payment?.vat_amount || 0);
    setInputValue('lessVat', data.payment?.less_vat || 0);
    setInputValue('netVat', data.payment?.net_vat || 0);
    setInputValue('withholding', data.payment?.withholding || 0);
    setInputValue('total', data.payment?.total || 0);
    setInputValue('due', data.payment?.due || 0);
    setInputValue('payable', data.payment?.payable || 0);

    setInputValue('footerAtpNo', data.footer?.atp_no || "");
    setInputValue('footerAtpDate', dateToYYYYMMDD(data.footer?.atp_date) || "");
    setInputValue('footerBirPermit', data.footer?.bir_permit_no || "");
    setInputValue('footerBirDate', dateToYYYYMMDD(data.footer?.bir_date) || "");
    setInputValue('footerSerialNos', data.footer?.serial_nos || "");

    if (data.logo) {
      const logoEl = document.getElementById("uploaded-logo");
      if (logoEl) { logoEl.src = data.logo; logoEl.style.display = "block"; }
    }

    adjustColumnWidths();
    DBG.log('Invoice loaded for edit:', invoiceNo);
  } catch (err) {
    DBG.error('Error loading invoice for edit:', err);
  }
}

/* -------------------- 5. SAVE INVOICE -------------------- */

async function saveToDatabase() {
  DBG.log('saveToDatabase() called');

  const billTo = document.querySelector('input[name="billTo"]')?.value.trim();
  const invoiceNo = document.querySelector('input[name="invoiceNo"]')?.value.trim();
  const date = document.querySelector('input[name="date"]')?.value.trim();
  const dueDate = document.querySelector('input[name="dueDate"]')?.value.trim();

  if (!billTo || !invoiceNo || !date) {
    alert("Please fill in required fields: Bill To, Invoice No, and Date.");
    return;
  }

  calculateTotals(); // keep totals current

  // Dynamic columns detection
  const allThs = document.querySelectorAll("#items-table thead th");
  const extraColumns = Array.from(allThs).slice(4).map(th =>
    th.textContent.trim().toLowerCase().replace(/\s+/g, "_"));

  // Items
  const items = Array.from(document.querySelectorAll("#items-body tr")).map(row => {
    const item = {
      description: row.querySelector('input[name="desc[]"]')?.value.trim() || "",
      quantity: parseInt(row.querySelector('input[name="qty[]"]')?.value) || 0,
      unit_price: parseFloat(row.querySelector('input[name="rate[]"]')?.value) || 0,
      amount: parseFloat(row.querySelector('input[name="amt[]"]')?.value) || 0
    };
    extraColumns.forEach(colKey => {
      const input = row.querySelector(`input[name="${colKey}[]"]`);
      item[colKey] = input?.value.trim() || "";
    });
    return item;
  });

  // Payment
  const payment = {
    cash: document.querySelector('input[name="cash"]')?.checked || false,
    check_payment: document.querySelector('input[name="check"]')?.checked || false,
    check_no: document.querySelector('input[name="checkNo"]')?.value.trim() || null,
    bank: document.querySelector('input[name="bank"]')?.value.trim() || null,
    vatable_sales: parseFloat(document.querySelector('input[name="vatableSales"]')?.value) || 0,
    total_sales: parseFloat(document.querySelector('input[name="totalSales"]')?.value) || 0,
    vat_exempt: parseFloat(document.querySelector('input[name="vatExempt"]')?.value) || 0,
    less_vat: parseFloat(document.querySelector('input[name="lessVat"]')?.value) || 0,
    zero_rated: parseFloat(document.querySelector('input[name="zeroRated"]')?.value) || 0,
    net_vat: parseFloat(document.querySelector('input[name="netVat"]')?.value) || 0,
    vat_amount: parseFloat(document.querySelector('input[name="vatAmount"]')?.value) || 0,
    withholding: parseFloat(document.querySelector('input[name="withholding"]')?.value) || 0,
    total: parseFloat(document.querySelector('input[name="total"]')?.value) || 0,
    due: parseFloat(document.querySelector('input[name="due"]')?.value) || 0,
    pay_date: document.querySelector('input[name="payDate"]')?.value || null,
    payable: parseFloat(document.querySelector('input[name="payable"]')?.value) || 0
  };

  const footer = {
    atp_no: document.querySelector('input[name="footerAtpNo"]')?.value.trim() || "",
    atp_date: document.querySelector('input[name="footerAtpDate"]')?.value.trim() || "",
    bir_permit_no: document.querySelector('input[name="footerBirPermit"]')?.value.trim() || "",
    bir_date: document.querySelector('input[name="footerBirDate"]')?.value.trim() || "",
    serial_nos: document.querySelector('input[name="footerSerialNos"]')?.value.trim() || ""
  };

  // Handle logo upload if new file selected
  let logoPath = document.getElementById('uploaded-logo')?.src || '';
  const logoFile = document.getElementById('logo-upload')?.files?.[0];
  if (logoFile) {
    const formData = new FormData();
    formData.append("logo", logoFile);
    formData.append("invoice_no", invoiceNo);
    try {
      const uploadRes = await fetch("/upload-logo", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok && uploadData.filename) logoPath = uploadData.filename;
      else DBG.warn("Logo upload failed:", uploadData.error || uploadData);
    } catch (err) { DBG.warn("Logo upload error:", err); }
  }

  const titleEl = document.querySelector('.invoice-title');
  const invoiceTitle = titleEl ? titleEl.textContent.trim() : (localStorage.getItem('selectedInvoiceType') || 'SERVICE INVOICE');

  // Build invoice object
  const invoiceData = {
    invoice_no: invoiceNo,
    invoice_type: invoiceTitle,
    bill_to: billTo,
    address1: document.querySelector('input[name="address1"]')?.value.trim() || "",
    address2: document.querySelector('input[name="address2"]')?.value.trim() || "",
    tin: document.querySelector('input[name="tin"]')?.value.trim() || "",
    terms: document.querySelector('input[name="terms"]')?.value.trim() || "",
    date,
    dueDate,
    total_amount_due: parseFloat(document.querySelector('input[name="totalAmountDue"]')?.value) || 0,
    invoice_title: invoiceTitle,
    items,
    payment,
    footer,
    logo: logoPath
  };

  // Recurrence detection
  const isRecurring = document.getElementById('recurringOptions')?.style.display === 'block';
  if (isRecurring) {
    invoiceData.recurrence_type = document.getElementById('recurrenceType')?.value || null;
    invoiceData.recurrence_start_date = document.getElementById('recurrenceStart')?.value || null;
    invoiceData.recurrence_end_date = document.getElementById('recurrenceEnd')?.value || null;
    invoiceData.recurrence_status = 'active';
  }

  DBG.log('Prepared invoiceData:', invoiceData.invoice_no, 'recurring=', !!isRecurring);

  // Determine route and method
  const params = new URLSearchParams(window.location.search);
  const invoiceNoParam = params.get("invoice_no");
  const isEdit = params.get("edit") === "true";
  let method = 'POST', url = '/api/invoices';
  if (isEdit && invoiceNoParam) { method = 'PUT'; url = `/api/invoices/${encodeURIComponent(invoiceNoParam)}`; }

  // Send to backend
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoiceData)
    });
    const result = await res.json();
    if (res.ok) {
      alert(isRecurring ? "Recurring invoice saved successfully!" :
        isEdit ? "Invoice updated successfully!" :
        "Invoice saved successfully!");
      window.location.href = `/Replica.html?invoice_no=${invoiceData.invoice_no}`;
    } else {
      alert(`Error saving invoice: ${result.error || "Unknown error"}`);
      DBG.error('Save error result:', result);
    }
  } catch (err) {
    alert("Error saving invoice. Check console.");
    DBG.error('Save to database failed:', err);
  } finally {
    const loader = $('#loader');
    if (loader) loader.style.display = 'none';
  }
}

/* -------------------- 6. ROW & COLUMN ACTIONS -------------------- */

function addRow() {
  const tbody = document.getElementById("items-body");
  if (!tbody) return;
  const headerCols = document.querySelectorAll("#items-table thead th");
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="text" class="input-full" name="desc[]"></td>
    <td><input type="number" class="input-short" name="qty[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="rate[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="amt[]" readonly></td>
  `;
  for (let i = 4; i < headerCols.length; i++) {
    const colKey = headerCols[i].textContent.trim().toLowerCase().replace(/\s+/g, "_");
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" name="${colKey}[]">`;
    row.appendChild(td);
  }
  tbody.appendChild(row);
  adjustColumnWidths();
}

function removeRow() {
  const tbody = document.getElementById("items-body");
  if (!tbody) return;

  if (tbody.rows.length <= 1) return alert("At least one row must remain.");

  // Remove the last row
  tbody.deleteRow(tbody.rows.length - 1);

  calculateTotals();
  adjustColumnWidths();
}

function addColumn() {
  const name = prompt("Enter new column name:");
  if (!name) return;
  const theadRow = document.querySelector("#items-table thead tr");
  if (!theadRow) return;
  const newTh = document.createElement("th"); newTh.textContent = name; theadRow.appendChild(newTh);
  const colKey = name.toLowerCase().replace(/\s+/g, "_");
  document.querySelectorAll("#items-table tbody tr").forEach(row => {
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" name="${colKey}[]">`;
    row.appendChild(td);
  });
  adjustColumnWidths();
}

function removeColumn() {
  const name = prompt("Enter exact column name to remove:");
  if (!name) return;
  const theadRow = document.querySelector("#items-table thead tr");
  if (!theadRow) return;
  const ths = Array.from(theadRow.querySelectorAll("th"));
  const index = ths.findIndex(th => th.textContent.trim().toLowerCase() === name.trim().toLowerCase());
  if (index < 4) return alert("Default columns cannot be removed.");
  if (index === -1) return alert(`Column "${name}" not found.`);
  ths[index].remove();
  document.querySelectorAll("#items-table tbody tr").forEach(row => row.querySelectorAll("td")[index]?.remove());
  adjustColumnWidths();
}

/* -------------------- 7. CALCULATIONS -------------------- */

function updateAmount(el) {
  if (!el) return;
  const row = el.closest("tr");
  if (!row) return;
  const qty = parseFloat(row.querySelector('input[name="qty[]"]')?.value) || 0;
  const rate = parseFloat(row.querySelector('input[name="rate[]"]')?.value) || 0;
  const amtEl = row.querySelector('input[name="amt[]"]');
  if (amtEl) amtEl.value = (qty * rate).toFixed(2);
  calculateTotals();
}

function calculateTotals() {
  let totalSales = 0;
  $$('input[name="amt[]"]').forEach(input => totalSales += parseFloat(input.value) || 0);

  // percentages/amounts: original code used getFieldValue which read inputs; keep same semantics
  const vatRate = getFieldValue('vatExempt') / 100;
  const lessVatRate = getFieldValue('lessVat') / 100;
  const zeroRatedRate = getFieldValue('zeroRated') / 100;
  const addVatRate = getFieldValue('addVat') / 100;
  const withholding = getFieldValue('withholding');

  const vatAmount = totalSales * vatRate;
  const lessVatAmount = totalSales * lessVatRate;
  const zeroRatedAmount = totalSales * zeroRatedRate;
  const addVatAmount = totalSales * addVatRate;

  const netVat = totalSales - vatAmount - lessVatAmount + addVatAmount;
  const payable = netVat;
  const due = payable - withholding;

  setFieldValue('totalSales', totalSales.toFixed(2));
  setFieldValue('vatAmount', vatAmount.toFixed(2));
  setFieldValue('netVat', netVat.toFixed(2));
  setFieldValue('due', due.toFixed(2));
  setFieldValue('payable', payable.toFixed(2));
  setFieldValue('totalAmountDue', due.toFixed(2));

  DBG.log('Totals updated', { totalSales, vatAmount, netVat, due });
}

function getFieldValue(name) {
  const el = document.querySelector(`input[name="${name}"], select[name="${name}"]`);
  if (!el) return 0;
  return parseFloat(el.value) || 0;
}

function setFieldValue(name, value) {
  const el = document.querySelector(`input[name="${name}"], select[name="${name}"]`);
  if (!el) return;
  el.value = value;
}

/* -------------------- 8. UI ADJUSTMENTS -------------------- */

function adjustColumnWidths() {
  const table = document.getElementById("items-table");
  if (!table) return;
  const ths = table.querySelectorAll("thead th");
  if (!ths.length) return;
  const colWidth = 100 / ths.length + "%";
  ths.forEach(th => th.style.width = colWidth);
  table.querySelectorAll("tbody tr").forEach(row => row.querySelectorAll("td").forEach(td => td.style.width = colWidth));
}

/* -------------------- 9. LOGO PREVIEW -------------------- */

function previewLogo(event) {
  const img = document.getElementById("uploaded-logo");
  const btn = document.getElementById("remove-logo-btn");
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
  const img = document.getElementById("uploaded-logo");
  const btn = document.getElementById("remove-logo-btn");
  const input = document.getElementById("logo-upload");
  if (img) { img.src = ""; img.style.display = "none"; }
  if (btn) btn.style.display = "none";
  if (input) input.value = "";
}

/* -------------------- 10. PREVIEW + PDF (pdf.js) -------------------- */

let pdfDoc = null;
let pageNum = 1;
let zoom = 1;
let currentPDFUrl = "";

async function openPdfPreview(url) {
  try {
    currentPDFUrl = url;
    const modal = document.getElementById("pdfPreviewModal");
    if (modal) modal.classList.add("show");
    pdfDoc = await pdfjsLib.getDocument(url).promise;
    pageNum = 1;
    zoom = 1;
    renderPage(pageNum);
  } catch (err) {
    DBG.error('openPdfPreview error', err);
  }
}

function renderPage(num) {
  if (!pdfDoc) return;
  pdfDoc.getPage(num).then((page) => {
    const canvas = document.getElementById("pdfCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const viewport = page.getViewport({ scale: zoom });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    page.render({ canvasContext: ctx, viewport });
    const pageInfo = document.getElementById("pageInfo");
    if (pageInfo) pageInfo.textContent = `${pageNum} / ${pdfDoc.numPages}`;
    const zoomLevel = document.getElementById("zoomLevel");
    if (zoomLevel) zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
  }).catch(err => DBG.error('renderPage error', err));
}

/* -------------------- 11. PREVIEW BUTTON + COLLECTOR -------------------- */

function collectInvoiceData() {
  return {
    invoice_no: document.querySelector('[name="invoice_no"]')?.value || '',
    bill_to: document.querySelector('[name="bill_to"]')?.value || '',
    address1: document.querySelector('[name="address1"]')?.value || '',
    address2: document.querySelector('[name="address2"]')?.value || '',
    invoice_date: document.querySelector('[name="invoice_date"]')?.value || '',
    due_date: document.querySelector('[name="due_date"]')?.value || '',
    tin: document.querySelector('[name="tin"]')?.value || '',
    terms: document.querySelector('[name="terms"]')?.value || '',
    company: {
      company_name: document.querySelector('[name="company_name"]')?.value || '',
      company_address: document.querySelector('[name="company_address"]')?.value || '',
      tel_no: document.querySelector('[name="company_tel"]')?.value || '',
      vat_tin: document.querySelector('[name="company_tin"]')?.value || ''
    },
    items: Array.from(document.querySelectorAll('#items-body tr')).map(row => ({
      description: row.querySelector('[name="desc[]"]')?.value || '',
      quantity: row.querySelector('[name="qty[]"]')?.value || '',
      unit_price: row.querySelector('[name="rate[]"]')?.value || '',
      amount: row.querySelector('[name="amt[]"]')?.value || ''
    })),
    payment: {
      total: document.querySelector('[name="total_amount"]')?.value || '',
      payable: document.querySelector('[name="total_due"]')?.value || ''
    }
  };
}

/* -------------------- 12. GLOBAL UI EVENT HANDLERS -------------------- */

function attachUIHandlers() {
  // Dropdown behavior (accessible)
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-dropdown]')) {
      $$('[data-dropdown]').forEach(dd => {
        dd.removeAttribute('open');
        const btn = dd.querySelector('[data-dropdown-button]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }
  });

  $$('[data-dropdown-button]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = button.closest('[data-dropdown]');
      if (!dropdown) return;
      const isOpen = dropdown.hasAttribute('open');
      $$('[data-dropdown]').forEach(dd => {
        if (dd !== dropdown) {
          dd.removeAttribute('open');
          const b = dd.querySelector('[data-dropdown-button]');
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
      if (isOpen) { dropdown.removeAttribute('open'); button.setAttribute('aria-expanded', 'false'); }
      else {
        dropdown.setAttribute('open', '');
        button.setAttribute('aria-expanded', 'true');
        const firstItem = dropdown.querySelector('.dropdown-item');
        if (firstItem) firstItem.focus();
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('[data-dropdown]').forEach(dd => {
        dd.removeAttribute('open');
        const btn = dd.querySelector('[data-dropdown-button]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }
  });

  // Dropdown item sample actions
  $$('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      alert('Action: ' + e.target.textContent.trim());
      const dd = e.target.closest('[data-dropdown]');
      if (dd) {
        dd.removeAttribute('open');
        const btn = dd.querySelector('[data-dropdown-button]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // Preview button (single handler)
  const previewBtn = document.getElementById('previewBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', async () => {
      // Save a local preview snapshot
      const invoiceData = collectInvoiceData();
      localStorage.setItem('invoicePreviewData', JSON.stringify(invoiceData));

      // Request temporary PDF and open preview
      try {
        const res = await fetch("/api/invoice/generate-pdf/temp", { method: "POST" });
        if (!res.ok) {
          const err = await res.text();
          DBG.warn('Preview PDF generate failed:', err);
          // fallback to client preview (Replica)
          window.open('/Replica.html?mode=preview', '_blank');
          return;
        }
        const data = await res.json();
        if (data?.pdfUrl) openPdfPreview(data.pdfUrl);
        else {
          DBG.warn('No pdfUrl returned; opening Replica preview');
          window.open('/Replica.html?mode=preview', '_blank');
        }
      } catch (err) {
        DBG.warn('Could not generate preview PDF, opening Replica preview', err);
        window.open('/Replica.html?mode=preview', '_blank');
      }
    });
  }

  // PDF modal controls (defensive)
  const closePreview = document.getElementById("closePreview");
  if (closePreview) closePreview.onclick = () => $('#pdfPreviewModal')?.classList.remove("show");
  const zoomIn = document.getElementById("zoomIn");
  if (zoomIn) zoomIn.onclick = () => { zoom += 0.2; renderPage(pageNum); };
  const zoomOut = document.getElementById("zoomOut");
  if (zoomOut) zoomOut.onclick = () => { zoom = Math.max(0.4, zoom - 0.2); renderPage(pageNum); };
  const downloadPDF = document.getElementById("downloadPDF");
  if (downloadPDF) downloadPDF.onclick = () => { if (currentPDFUrl) window.open(currentPDFUrl, "_blank"); };
  const printPDF = document.getElementById("printPDF");
  if (printPDF) printPDF.onclick = () => { if (currentPDFUrl) window.open(currentPDFUrl + "#print", "_blank"); };

  // Basic UI buttons
  const saveCloseBtn = document.getElementById('saveCloseBtn');
  if (saveCloseBtn) saveCloseBtn.addEventListener('click', () => alert('Save & close clicked'));

  // Logo upload
  const logoUpload = document.getElementById('logo-upload');
  if (logoUpload) logoUpload.addEventListener('change', previewLogo);
  const removeLogoBtn = document.getElementById('remove-logo-btn');
  if (removeLogoBtn) removeLogoBtn.addEventListener('click', removeLogo);

  // Save action
  const saveBtn = document.getElementById('saveBtn') || document.getElementById('saveInvoiceBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveToDatabase);

  DBG.log('UI handlers attached');
}

/* -------------------- 13. RECURRING MODE DETECTION -------------------- */

function handleRecurringModeOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const invoiceMode = params.get('invoiceMode'); // "standard" or "recurring"
  const recurringSection = document.getElementById('recurringOptions');
  const breadcrumbInvoice = document.getElementById('invoice-type');
  if (!recurringSection || !breadcrumbInvoice) return;
  if (invoiceMode === 'recurring') {
    recurringSection.style.display = 'block';
    breadcrumbInvoice.textContent = 'Recurring Invoice';
    DBG.log('Recurring invoice mode activated');
  } else {
    recurringSection.style.display = 'none';
    breadcrumbInvoice.textContent = 'Standard Invoice';
    DBG.log('Standard invoice mode activated');
  }
}

/* -------------------- 14. INIT -------------------- */

window.addEventListener('DOMContentLoaded', () => {
  DBG.log('DOM fully loaded — initializing');
  attachUIHandlers();
  loadCompanyInfo();
  setInvoiceTitleFromURL();
  loadInvoiceForEdit();
  handleRecurringModeOnLoad();
});
