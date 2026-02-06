// ===============================
// REPLICA.js — Invoice Renderer & Exporter
// ===============================

console.log("✅ REPLICA.js loaded");

// ============================ 
// Main Invoice Renderer 
// ============================
function renderInvoice(data) {
  const invoice = data;

  // -------------------- FORMATTERS --------------------
  const formatCurrency = (value, currency = "PHP") => {
    const num = parseFloat(value);
    if (isNaN(num)) return "0.00";
    return num.toLocaleString("en-PH", { style: "currency", currency });
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

  // -------------------- COMPANY INFO --------------------
  const company = invoice.company || {};
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
  fillById("invoice_no", invoice.invoice_no || "");
  fillById("invoice_date", invoice.date ? formatDate(invoice.date) : "");
  fillById("billTo", invoice.bill_to || "");
  fillById("address", invoice.address || "");
  fillById("tin", invoice.tin || "");

  // Render terms properly
  const termsEl = document.getElementById("terms_table");
  if (termsEl) termsEl.innerHTML = invoice.terms || "";

  // -------------------- EXCHANGE RATE --------------------
  const exchangeRateEl = document.getElementById("exchange_rate");
  const exchangeRate = parseFloat(invoice.exchange_rate || 1);
  if (exchangeRateEl) {
    if (invoice.currency === "PHP") {
      exchangeRateEl.textContent = "₱1.00";
    } else {
      exchangeRateEl.textContent = `1 ${invoice.currency} = ₱${exchangeRate.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
    }
  }

  // -------------------- ITEMS TABLE --------------------
  const buildTable = (items, extraColumns = []) => {
    const theadRow = document.getElementById("replica-thead-row");
    const colgroup = document.getElementById("invoice-colgroup");
    const tbody = document.getElementById("itemRows");

    theadRow.innerHTML = "";
    colgroup.innerHTML = "";
    tbody.innerHTML = "";

    const MAIN_COLUMNS = [
      { key: "description", label: "Item Description / Nature Of Service", width: 40 },
      { key: "quantity", label: "Quantity", width: 10 },
      { key: "unit_price", label: "Unit Price / Rate", width: 20 },
      { key: "amount", label: "Amount", width: 20 }
    ];

    const extraFields = Array.isArray(extraColumns) ? extraColumns : [];

    // HEADER
    [...MAIN_COLUMNS, ...extraFields.map(f => ({ key: f, label: f }))].forEach(col => {
      const th = document.createElement("th");
      th.textContent = col.label.replace(/_/g, " ").toUpperCase();
      theadRow.appendChild(th);
    });

    // COLGROUP
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

    // ROWS — only actual items
    items.forEach(item => {
      const tr = document.createElement("tr");

      MAIN_COLUMNS.forEach(col => {
        const td = document.createElement("td");
        if (col.key === "description") td.classList.add("desc");

        let val = item[col.key];

        if (!val) {
          td.innerHTML = "&nbsp;";
        } else if (col.key === "unit_price") {
          td.innerHTML = formatCurrency(val, invoice.currency);
        } else if (col.key === "amount") {
          const num = parseFloat(val);
          td.innerHTML = num ? formatCurrency(num, invoice.currency) : "&nbsp;";
        } else {
          td.textContent = val;
        }

        tr.appendChild(td);
      });

      extraFields.forEach(f => {
        const td = document.createElement("td");
        td.innerHTML = item[f] ?? "&nbsp;";
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    return extraFields;
  };

  const extraFields = buildTable(invoice.items || [], invoice.extra_columns || []);

  // -------------------- PAYMENT SUMMARY --------------------
  const payment = invoice.tax_summary || {};
  const showPHP = val => "₱" + ((parseFloat(val) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 }));

  fillById("vatableSales", showPHP(payment.vatable_sales));
  fillById("vatAmount", showPHP(payment.vat_amount));
  fillById("vatExemptSales", showPHP(payment.vat_exempt_sales));
  fillById("zeroRatedSales", showPHP(payment.zero_rated_sales));
  fillById("subtotal", showPHP(payment.subtotal));
  fillById("discount", showPHP(payment.discount));
  fillById("withholdingTax", showPHP(payment.withholding));
  fillById("totalPayable", showPHP(payment.total_payable));

  // -------------------- FOOTER --------------------
  const footer = invoice.footer || {};
  fillById("footer-bir-permit", footer.bir_permit_no || "");
  fillById("footer-bir-date", footer.bir_date ? formatDate(footer.bir_date) : "");
  fillById("footer-serial-nos", footer.serial_nos || "");

  // -------------------- INVOICE TITLE & NOTICE --------------------
  const invoiceType = invoice.invoice_type || "SERVICE INVOICE";
  const titleEl = document.querySelector(".invoice-title");
  if (titleEl) titleEl.textContent = invoiceType.toUpperCase();

  const inputTaxNotice = document.getElementById("inputTaxNotice");
  const signatureNotice = document.getElementById("signature");
  if (invoiceType.toUpperCase().includes("CREDIT") || invoiceType.toUpperCase().includes("DEBIT")) {
    if (inputTaxNotice) inputTaxNotice.style.display = "block";
    if (signatureNotice) signatureNotice.style.display = "none";
  } else {
    if (inputTaxNotice) inputTaxNotice.style.display = "none";
    if (signatureNotice) signatureNotice.style.display = "block";
  }

  // Save extra fields globally for export
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

// -------------------- FOOTER UPDATE --------------------
function updateOnScreenFooter() {
  const now = new Date();
  document.querySelectorAll('.print-timestamp')
    .forEach(el => el.textContent = `Timestamp: ${now.toLocaleString()}`);
  document.querySelectorAll('.print-page')
    .forEach(el => el.textContent = 'Page 1 of 1');
}

window.addEventListener('DOMContentLoaded', updateOnScreenFooter);
window.addEventListener('beforeprint', updateOnScreenFooter);
