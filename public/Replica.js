// ===============================
// REPLICA.js — Invoice Renderer & Exporter (₱ FIX READY)
// ===============================

console.log("✅ REPLICA.js loaded");

// ✅ Puppeteer "ready" flag (used by PDF generator)
window.__REPLICA_READY = false;

/* ============================
   WATERMARK
============================ */
function applyWatermark(statusRaw) {
  const wm = document.getElementById('wm');
  if (!wm) return;

  const status = String(statusRaw || '').trim().toLowerCase();

  wm.className = 'watermark';
  wm.textContent = '';

  if (status === 'draft') {
    wm.textContent = 'DRAFT';
    wm.classList.add('show', 'draft');
    return;
  }

  if (status === 'canceled' || status === 'cancelled' || status === 'void') {
    wm.textContent = 'VOID';
    wm.classList.add('show', 'void');
    return;
  }
}

/* ============================
   SIGNATURE RENDERER
============================ */
function renderSignature(invoice) {
  const img = document.getElementById('sigImg');
  const line = document.getElementById('sigLine');
  const nameEl = document.getElementById('sigName');
  const metaEl = document.getElementById('sigMeta');
  const fallback = document.getElementById('signature');

  const signed = !!(invoice && (invoice.signature_image || invoice.signed_at));

  // If credit/debit invoice type: hide signature area
  const invoiceType = String(invoice?.invoice_type || '').toUpperCase();
  const isCreditDebit = invoiceType.includes('CREDIT') || invoiceType.includes('DEBIT');
  if (isCreditDebit) {
    if (img) img.style.display = 'none';
    if (line) line.style.display = 'none';
    if (nameEl) nameEl.style.display = 'none';
    if (metaEl) metaEl.style.display = 'none';
    if (fallback) fallback.style.display = 'none';
    return;
  }

  if (!signed) {
    if (img) img.style.display = 'none';
    if (line) line.style.display = 'none';
    if (nameEl) nameEl.style.display = 'none';
    if (metaEl) metaEl.style.display = 'none';
    if (fallback) {
      fallback.style.display = 'block';
      fallback.textContent = 'THIS IS SYSTEM GENERATED. NO SIGNATURE REQUIRED.';
    }
    return;
  }

  // signed => show signature image + name + date
  if (fallback) fallback.style.display = 'none';

  if (img) {
    img.src = invoice.signature_image || '';
    img.style.display = invoice.signature_image ? 'block' : 'none';
  }
  if (line) line.style.display = 'block';

  if (nameEl) {
    nameEl.textContent = invoice.signature_name || 'AUTHORIZED SIGNATORY';
    nameEl.style.display = 'block';
  }

  if (metaEl) {
    const d = invoice.signed_at ? new Date(invoice.signed_at) : null;
    const ds = d && !isNaN(d) ? d.toLocaleString('en-PH') : '';
    metaEl.textContent = ds ? `Signed on: ${ds}` : '';
    metaEl.style.display = ds ? 'block' : 'none';
  }
}

/* ============================
   STATUS LABEL
============================ */
function renderStatusLabel(invoice) {
  const el = document.getElementById('invoiceStatus');
  if (!el) return;

  const status = String(invoice?.status || '').trim().toUpperCase();
  const signed = !!(invoice && (invoice.signature_image || invoice.signed_at));

  if (!status && !signed) {
    el.textContent = '';
    return;
  }

  if (signed && status) el.textContent = `${status} • SIGNED`;
  else if (signed) el.textContent = `SIGNED`;
  else el.textContent = status;
}

/* ============================
   HELPERS
============================ */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return isNaN(date) ? dateStr : date.toLocaleDateString("en-PH");
}

function fillById(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

/**
 * ✅ Multi-currency formatter
 * - Uses Intl currency formatting
 * - Works for USD/EUR/PHP etc.
 * - ₱ will render properly online because CSS forces DejaVuSans on money cells
 */
function formatCurrency(value, currency = "PHP") {
  const num = Number(value);
  if (!isFinite(num)) return "";
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  } catch {
    // Fallback (rare)
    return `${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/**
 * PHP-only display (if you prefer explicit ₱)
 */
function showPHP(val) {
  const num = Number(val);
  const n = isFinite(num) ? num : 0;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ============================
   MAIN RENDER
============================ */
function renderInvoice(data) {
  const invoice = data || {};

  applyWatermark(invoice.status);

  // COMPANY
  const company = invoice.company || {};
  fillById("company-name", company.company_name || "");
  fillById("company-address", company.company_address || "");
  fillById("company-tel", company.tel_no || "");
  fillById("company-tin", company.vat_tin || "");

  if (company.logo_path) {
  const logoEl = document.getElementById("invoice-logo");
  if (logoEl) {
    let p = String(company.logo_path || '').trim();
    if (p && !p.startsWith('http') && !p.startsWith('/')) p = `/uploads/${p}`;
    if (p.startsWith('uploads/')) p = '/' + p;

    logoEl.src = p;
    logoEl.style.display = "block";
  }
}
  // HEADER
  fillById("invoice_no", invoice.invoice_no || "");
  fillById("invoice_date", invoice.date ? formatDate(invoice.date) : "");
  fillById("billTo", invoice.bill_to || "");
  fillById("address", invoice.address || "");
  fillById("tin", invoice.tin || "");

  // TERMS
  const termsEl = document.getElementById("terms_table");
  if (termsEl) termsEl.innerHTML = invoice.terms || "";

  // EXCHANGE RATE (contains ₱)
  const exchangeRateEl = document.getElementById("exchange_rate");
  const exchangeRate = Number(invoice.exchange_rate || 1);

  if (exchangeRateEl) {
    // ✅ ensure glyph font via CSS (#exchange_rate uses DejaVuSans)
    if (invoice.currency === "PHP" || !invoice.currency) {
      exchangeRateEl.textContent = "₱1.00";
    } else {
      const ex = isFinite(exchangeRate) ? exchangeRate : 1;
      exchangeRateEl.textContent =
        `1 ${invoice.currency} = ₱${ex.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  // ============================
  // ITEMS TABLE
  // ============================
  const buildTable = (items, extraColumns = []) => {
    const theadRow = document.getElementById("replica-thead-row");
    const colgroup = document.getElementById("invoice-colgroup");
    const tbody = document.getElementById("itemRows");
    if (!theadRow || !colgroup || !tbody) return [];

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

    // Header
    [...MAIN_COLUMNS, ...extraFields.map(f => ({ key: f, label: f }))].forEach(col => {
      const th = document.createElement("th");
      th.textContent = String(col.label).replace(/_/g, " ").toUpperCase();
      theadRow.appendChild(th);
    });

    // Col widths
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

    // Rows
    (items || []).forEach(item => {
      const tr = document.createElement("tr");

      MAIN_COLUMNS.forEach(col => {
        const td = document.createElement("td");
        if (col.key === "description") td.classList.add("desc");

        const val = item?.[col.key];

        if (val === null || val === undefined || val === "") {
          td.innerHTML = "&nbsp;";
        } else if (col.key === "unit_price") {
          td.classList.add("money"); // ✅ forces DejaVuSans for currency glyphs
          td.textContent = formatCurrency(val, invoice.currency || "PHP");
        } else if (col.key === "amount") {
          td.classList.add("money"); // ✅ forces DejaVuSans
          const num = Number(val);
          td.textContent = isFinite(num) ? formatCurrency(num, invoice.currency || "PHP") : "";
          if (!td.textContent) td.innerHTML = "&nbsp;";
        } else {
          td.textContent = String(val);
        }

        tr.appendChild(td);
      });

      extraFields.forEach(f => {
        const td = document.createElement("td");
        const v = item?.[f];
        td.innerHTML = (v === null || v === undefined || v === "") ? "&nbsp;" : String(v);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    return extraFields;
  };

  const extraFields = buildTable(invoice.items || [], invoice.extra_columns || []);
  window._extraFields = extraFields;

  // ============================
  // PAYMENT SUMMARY (PHP display)
  // ============================
  const payment = invoice.tax_summary || {};

  fillById("vatableSales", showPHP(payment.vatable_sales));
  fillById("vatAmount", showPHP(payment.vat_amount));
  fillById("vatExemptSales", showPHP(payment.vat_exempt_sales));
  fillById("zeroRatedSales", showPHP(payment.zero_rated_sales));
  fillById("subtotal", showPHP(payment.subtotal));
  fillById("discount", showPHP(payment.discount));
  fillById("withholdingTax", showPHP(payment.withholding));
  fillById("totalPayable", showPHP(payment.total_payable));

  // FOOTER
  const footer = invoice.footer || {};
  fillById("footer-bir-permit", footer.bir_permit_no || "");
  fillById("footer-bir-date", footer.bir_date ? formatDate(footer.bir_date) : "");
  fillById("footer-serial-nos", footer.serial_nos || "");

  // TITLE & NOTICE
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
  }

  // Signature + status
  renderSignature(invoice);
  renderStatusLabel(invoice);
}

/* ============================
   FETCH INVOICE
============================ */
window.onload = async function () {
  const params = new URLSearchParams(window.location.search);
  const invoiceNo = params.get("invoice_no");

  if (!invoiceNo) {
    alert("No invoice number provided in the URL.");
    window.__REPLICA_READY = true;
    return;
  }

  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`, {
      credentials: 'include'
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    renderInvoice(data);

    // ✅ let layout + fonts settle (helps Puppeteer too)
    requestAnimationFrame(() => {
      window.__REPLICA_READY = true;
    });

  } catch (err) {
    console.error("❌ Error loading invoice:", err);
    alert("Error loading invoice — showing empty template.");
    window.__REPLICA_READY = true;
  }
};

/* ============================
   FOOTER UPDATE
============================ */
function updateOnScreenFooter() {
  const now = new Date();
  document.querySelectorAll('.print-timestamp')
    .forEach(el => el.textContent = `Timestamp: ${now.toLocaleString()}`);
  document.querySelectorAll('.print-page')
    .forEach(el => el.textContent = 'Page 1 of 1');
}

window.addEventListener('DOMContentLoaded', updateOnScreenFooter);
window.addEventListener('beforeprint', updateOnScreenFooter);