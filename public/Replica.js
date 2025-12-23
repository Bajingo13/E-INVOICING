// ===============================
// REPLICA.js — Invoice Renderer & Exporter
// ===============================

console.log("✅ REPLICA.js loaded");

// ============================ 
// Main Invoice Renderer 
// ============================
function renderInvoice(data) {
  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? "0.00" : num.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return isNaN(date) ? dateStr : date.toLocaleDateString("en-PH");
  };

  const fillById = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "";
  };

// -------------------- ITEMS TABLE --------------------
const buildTable = (items, extraColumns = []) => {
  const theadRow = document.getElementById("replica-thead-row");
  const colgroup = document.getElementById("invoice-colgroup");
  const tbody = document.getElementById("itemRows");

  theadRow.innerHTML = "";
  colgroup.innerHTML = "";
  tbody.innerHTML = "";

  // ✅ MAIN COLUMNS — ALWAYS FIXED
  const MAIN_COLUMNS = [
  { key: "description", label: "Item Description / Nature Of Service", width: 30 },
  { key: "quantity", label: "Quantity", width: 10 },
  { key: "unit_price", label: "Unit Price", width: 15 },
  { key: "amount", label: "Amount", width: 15 }
];

  // ✅ EXTRA COLUMNS — ONLY FROM SAVED INVOICE
  const extraFields = Array.isArray(extraColumns) ? extraColumns : [];

  // ---------- HEADER ----------
  [...MAIN_COLUMNS, ...extraFields.map(f => ({ key: f, label: f }))].forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label.replace(/_/g, " ").toUpperCase();
    theadRow.appendChild(th);
  });

  // ---------- COLGROUP (WIDTH NEVER EXPANDS) ----------
  MAIN_COLUMNS.forEach(col => {
    const c = document.createElement("col");
    c.style.width = col.width + "%";
    colgroup.appendChild(c);
  });

  if (extraFields.length) {
    const remaining = 100 - MAIN_COLUMNS.reduce((s, c) => s + c.width, 0);
    const extraWidth = remaining / extraFields.length;
    extraFields.forEach(() => {
      const c = document.createElement("col");
      c.style.width = extraWidth + "%";
      colgroup.appendChild(c);
    });
  }

  // ---------- ROWS ----------
  const TOTAL_ROWS = 20;

  for (let i = 0; i < TOTAL_ROWS; i++) {
    const item = items[i] || {};
    const tr = document.createElement("tr");

    MAIN_COLUMNS.forEach(col => {
      const td = document.createElement("td");

      // ✅ Only add class if non-empty
      if (col.key === "description") td.classList.add("desc");

      let val = item[col.key];
      if (col.key === "unit_price" || col.key === "amount") {
        val = val ? parseFloat(val).toLocaleString("en-PH", { style: "currency", currency: "PHP" }) : "";
      }

      td.innerHTML = val || "&nbsp;";
      tr.appendChild(td);
    });

    extraFields.forEach(f => {
      const td = document.createElement("td");
      td.innerHTML = item[f] ?? "&nbsp;";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  return extraFields;
};

  

  // -------------------- COMPANY INFO --------------------
  const company = data.company || {};
  fillById("company-name", company.company_name || "");
  fillById("company-address", company.company_address || "");
  fillById("company-tel", company.tel_no || "");
  fillById("company-tin", company.vat_tin || "");
  if (company.logo_path) {
    const logoEl = document.getElementById("invoice-logo");
    logoEl.src = company.logo_path;
    logoEl.style.display = "block";
  }

  // -------------------- INVOICE HEADER --------------------
  const invoice = data;
  fillById("invoice_no", invoice.invoice_no || "");
  fillById("invoice_date", invoice.date ? formatDate(invoice.date) : "");
  fillById("billTo", invoice.bill_to || "");
  fillById("address", invoice.address || "");
  fillById("tin", invoice.tin || "");
  fillById("terms_table", invoice.terms || "");

  // -------------------- ITEMS --------------------
  const extraFields = buildTable(
  invoice.items || [],
  invoice.extra_columns || []
);

  // -------------------- PAYMENT SUMMARY --------------------
  const payment = invoice.tax_summary || {};
  fillById("vatableSales", formatCurrency(payment.vatable_sales));
  fillById("vatAmount", formatCurrency(payment.vat_amount));
  fillById("vatExemptSales", formatCurrency(payment.vat_exempt_sales));
  fillById("zeroRatedSales", formatCurrency(payment.zero_rated_sales));
  fillById("subtotal", formatCurrency(payment.subtotal));
  fillById("discount", formatCurrency(payment.discount));
  fillById("withholdingTax", formatCurrency(payment.withholding));
  fillById("totalPayable", formatCurrency(payment.total_payable));

  // -------------------- FOOTER --------------------
  const footer = invoice.footer || {};
  fillById("footer-atp-no", footer.atp_no || "");
  fillById("footer-atp-date", footer.atp_date ? formatDate(footer.atp_date) : "");
  fillById("footer-bir-permit", footer.bir_permit_no || "");
  fillById("footer-bir-date", footer.bir_date ? formatDate(footer.bir_date) : "");
  fillById("footer-serial-nos", footer.serial_nos || "");

  // -------------------- INVOICE TITLE & NOTICE --------------------
  const invoiceType = invoice.invoice_type || "SERVICE INVOICE";
  const titleEl = document.querySelector(".invoice-title");
  if (titleEl) titleEl.textContent = invoiceType.toUpperCase();
  const inputTaxNotice = document.getElementById("inputTaxNotice");
  if (inputTaxNotice) {
    inputTaxNotice.style.display = (invoiceType.toUpperCase().includes("CREDIT") || invoiceType.toUpperCase().includes("DEBIT")) ? "block" : "none";
  }

  // Save extra fields for export
  window._extraFields = extraFields;
}

// ============================
// FETCH INVOICE FROM BACKEND
// ============================
window.onload = async function() {
  const params = new URLSearchParams(window.location.search);
  const invoiceNo = params.get("invoice_no");
  if(!invoiceNo){
    alert("No invoice number provided in the URL.");
    return;
  }

  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
    if(!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderInvoice(data);
  } catch(err){
    console.error("❌ Error loading invoice:", err);
    alert("Error loading invoice — showing empty template.");
  }
};

// ============================
// EXPORT FUNCTIONS
// ============================
function toggleDropdown() {
  document.querySelector('.dropdown')?.classList.toggle('show');
}

window.onclick = function(event) {
  if (!event.target.matches('.export-btn')) {
    document.querySelectorAll('.dropdown.show').forEach(drop => drop.classList.remove('show'));
  }
};

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getInvoiceDataFromDOM() {
  const getText = id => document.getElementById(id)?.textContent.trim() || "";
  const extraFields = window._extraFields || [];

  const items = [];
  document.querySelectorAll('#itemRows tr').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if(tds.length){
      const item = {
        description: tds[0]?.textContent.trim(),
        quantity: tds[1]?.textContent.trim(),
        unit_price: tds[2]?.textContent.trim(),
        amount: tds[3]?.textContent.trim()
      };
      extraFields.forEach((f, idx) => { item[f] = tds[4+idx]?.textContent.trim() || ""; });
      if(Object.values(item).some(v=>v!=="")) items.push(item);
    }
  });

  return {
    company: {
      companyName: getText('company-name'),
      companyAddress: getText('company-address'),
      companyTel: getText('company-tel'),
      companyTIN: getText('company-tin')
    },
    invoice: {
      billTo: getText('billTo'),
      address: getText('address'),
      tin: getText('tin'),
      invoiceNumber: getText('invoice_no'),
      invoiceDate: getText('invoice_date'),
      terms: getText('terms_table')
    },
    items,
    payment: {
      vatableSales: getText('vatableSales'),
      vatAmount: getText('vatAmount'),
      vatExemptSales: getText('vatExemptSales'),
      zeroRatedSales: getText('zeroRatedSales'),
      subtotal: getText('subtotal'),
      discount: getText('discount'),
      withholdingTax: getText('withholdingTax'),
      totalPayable: getText('totalPayable')
    },
    footer: {
      atpNo: getText('footer-atp-no'),
      atpDate: getText('footer-atp-date'),
      birPermit: getText('footer-bir-permit'),
      birDate: getText('footer-bir-date'),
      serialNos: getText('footer-serial-nos')
    }
  };
}

function exportInvoice(type){
  const data = getInvoiceDataFromDOM();
  if(type==='json') downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'invoice.json');
  else if(type==='xml') downloadBlob(new Blob([objectToXml(data,'invoice')],{type:'application/xml'}),'invoice.xml');
  else if(type==='excel') downloadBlob(new Blob(['\uFEFF'+objectToCSV(data)],{type:'text/csv'}),'invoice.csv');
}

function objectToXml(obj, rootName){
  let xml = `<${rootName}>`;
  for(let key in obj){
    if(Array.isArray(obj[key])){
      xml+=`<${key}>`;
      obj[key].forEach(item=>xml+=objectToXml(item,'item'));
      xml+=`</${key}>`;
    }else if(typeof obj[key]==='object' && obj[key]!==null){
      xml+=objectToXml(obj[key],key);
    }else{
      xml+=`<${key}>${escapeXml(obj[key]??'')}</${key}>`;
    }
  }
  xml+=`</${rootName}>`;
  return xml;
}
function escapeXml(unsafe){return String(unsafe).replace(/[<>&'"]/g,c=>{switch(c){case'<':return'&lt;';case'>':return'&gt;';case'&':return'&amp;';case"'":return'&apos;';case'"':return'&quot;'}});}

function objectToCSV(obj){
  const lines=[];
  lines.push(['Company Name', obj.company.companyName]);
  lines.push(['Company Address', obj.company.companyAddress]);
  lines.push(['Company Tel', obj.company.companyTel]);
  lines.push(['Company TIN', obj.company.companyTIN]);
  lines.push(['Bill To', obj.invoice.billTo]);
  lines.push(['Address', obj.invoice.address]);
  lines.push(['TIN', obj.invoice.tin]);
  lines.push(['Invoice No', obj.invoice.invoiceNumber]);
  lines.push(['Invoice Date', obj.invoice.invoiceDate]);
  lines.push(['Terms', obj.invoice.terms]);
  lines.push(['--- Items ---']);

  const extraFields = window._extraFields || [];
  const headers = ['Description','Quantity','Unit Price','Amount', ...extraFields];
  lines.push(headers);

  obj.items.forEach(item=>{
    const row = [item.description,item.quantity,item.unit_price,item.amount,...extraFields.map(f=>item[f]||"")];
    lines.push(row);
  });

  lines.push(['--- Payment ---']);
  for(const k in obj.payment) lines.push([k,obj.payment[k]]);
  lines.push(['--- Footer ---']);
  for(const k in obj.footer) lines.push([k,obj.footer[k]]);

  return lines.map(r=>r.map(x=>`"${(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');
}

function addPrintFooters() {
  const invoiceContent = document.getElementById('invoiceContent');
  if (!invoiceContent) return;

  // Remove old footers if any
  document.querySelectorAll('.print-footer-meta').forEach(el => el.remove());

  const pxPerMM = 3.78;
  const pageHeightMM = 279; // Letter
  const pageHeightPx = pageHeightMM * pxPerMM;

  const totalPages = Math.max(1, Math.ceil(invoiceContent.scrollHeight / pageHeightPx));

  for (let i = 0; i < totalPages; i++) {
    const footer = document.querySelector('.print-footer-meta-template').cloneNode(true);
    footer.style.display = 'flex';
    footer.classList.remove('print-footer-meta-template');
    footer.classList.add('print-footer-meta');

    // Position each footer
    footer.style.top = `${i * pageHeightPx + pageHeightPx - 30}px`; // 30px from bottom of page

    // Update timestamp
    const now = new Date();
    footer.querySelector('.print-timestamp').textContent = `Timestamp: ${now.toLocaleString()}`;

    // Update page number
    footer.querySelector('.print-page').textContent = `Page ${i + 1} of ${totalPages}`;

    document.body.appendChild(footer);
  }
}

// On-screen: always show Page 1 of 1 in a single footer
function updateOnScreenFooter() {
  const timestampEls = document.querySelectorAll('.print-timestamp');
  const pageEls = document.querySelectorAll('.print-page');

  const now = new Date();
  timestampEls.forEach(el => el.textContent = `Timestamp: ${now.toLocaleString()}`);
  pageEls.forEach(el => el.textContent = 'Page 1 of 1');
}

// DOM loaded
window.addEventListener('DOMContentLoaded', updateOnScreenFooter);

// Before print
window.addEventListener('beforeprint', () => addPrintFooters());

// After print, reset to on-screen view
window.addEventListener('afterprint', updateOnScreenFooter);
