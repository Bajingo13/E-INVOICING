// ===============================
// REPLICA.js — Invoice Renderer & Exporter
// ===============================

console.log("✅ REPLICA.js loaded");

// -------------------------------
// MAIN: On window load
// -------------------------------
window.onload = async function () {
  // --- Parse invoice number from URL ---
  const params = new URLSearchParams(window.location.search);
  const invoiceNo = params.get("invoice_no");

  if (!invoiceNo) {
    alert("No invoice number provided in the URL.");
    return;
  }

  // --------------------------------------
  // LOAD INVOICE TITLE (from DB, fallback to localStorage/URL)
  // --------------------------------------
  async function loadInvoiceTitle() {
    const titleEl = document.querySelector(".service-invoice-title");
    const htmlTitle = document.querySelector("title");

    if (!titleEl) {
      console.warn("⚠️ No element with class '.service-invoice-title' found in printable form.");
      return;
    }

    let invoiceTitle = "";

    try {
      // 1️⃣ Try to get from backend first
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.invoice_type) invoiceTitle = data.invoice_type;
      }
    } catch (err) {
      console.warn("⚠️ Could not fetch invoice type from backend:", err);
    }

    // 2️⃣ If not found in DB, fallback to localStorage
    if (!invoiceTitle) invoiceTitle = localStorage.getItem("selectedInvoiceType");

    // 3️⃣ If still missing, fallback to URL or default
    if (!invoiceTitle) {
      const type = params.get("type");
      const typeMap = {
        sales: "SALES INVOICE",
        commercial: "COMMERCIAL INVOICE",
        credit: "CREDIT MEMO",
        debit: "DEBIT MEMO",
      };
      invoiceTitle = typeMap[type] || "SERVICE INVOICE";
    }

    // 4️⃣ Apply title to page
    titleEl.textContent = invoiceTitle;
    if (htmlTitle) htmlTitle.textContent = invoiceTitle;

    console.log(`🟢 Invoice title loaded: ${invoiceTitle}`);
  }

  await loadInvoiceTitle();

  // -------------------------------
  // Helpers
  // -------------------------------
  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num)
      ? ""
      : num.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return isNaN(date) ? dateStr : date.toLocaleDateString("en-PH");
  };

  const fillLine = (labelText, value) => {
    document.querySelectorAll(".field").forEach((field) => {
      const label = field.querySelector(".label");
      const line = field.querySelector(".line");
      if (label && line && label.textContent.trim().startsWith(labelText)) {
        line.textContent = value || "___________";
      }
    });
  };

  const fillById = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "";
  };

  // -------------------------------
  // Build Items Table
  // -------------------------------
  const buildTable = (items) => {
    const theadRow = document.getElementById("replica-thead-row");
    const colgroup = document.getElementById("invoice-colgroup");
    const tbody = document.getElementById("itemRows");

    if (!theadRow || !colgroup || !tbody) return;

    theadRow.innerHTML = "";
    colgroup.innerHTML = "";
    tbody.innerHTML = "";

    let extraFieldsSet = new Set();
    items.forEach((it) => {
      Object.keys(it || {}).forEach((k) => {
        if (
          !["description", "quantity", "unit_price", "amount", "invoice_id", "id"].includes(
            k.toLowerCase()
          ) &&
          it[k] != null &&
          it[k] !== ""
        ) {
          extraFieldsSet.add(k);
        }
      });
    });
    const extraFields = Array.from(extraFieldsSet);

    const headers = [
      "Item Description / Nature of Service",
      "Quantity",
      "Unit Price",
      "Amount",
      ...extraFields,
    ];
    headers.forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      theadRow.appendChild(th);
    });

    const baseWidths = ["40%", "10%", "15%", "15%"];
    baseWidths.forEach((width) => {
      const col = document.createElement("col");
      col.style.width = width;
      colgroup.appendChild(col);
    });
    if (extraFields.length > 0) {
      const extraWidth = ((100 - 40 - 10 - 15 - 15) / extraFields.length).toFixed(2) + "%";
      extraFields.forEach(() => {
        const col = document.createElement("col");
        col.style.width = extraWidth;
        colgroup.appendChild(col);
      });
    }

    const TOTAL_ROWS = 20;
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const row = document.createElement("tr");
      const item = items[i] || {};
      const cells = [
        `<td>${item.description || "&nbsp;"}</td>`,
        `<td>${item.quantity || "&nbsp;"}</td>`,
        `<td>${item.unit_price ? formatCurrency(item.unit_price) : "&nbsp;"}</td>`,
        `<td>${item.amount ? formatCurrency(item.amount) : "&nbsp;"}</td>`,
        ...extraFields.map((f) => `<td>${item[f] != null ? item[f] : "&nbsp;"}</td>`),
      ];
      row.innerHTML = cells.join("");
      tbody.appendChild(row);
    }
  };

  // -------------------------------
  // MAIN FETCH: Load invoice data
  // -------------------------------
  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to fetch invoice: ${res.status} ${errorText}`);
    }
    const data = await res.json();
    console.log("📦 Loaded invoice data:", data);

    // --- Company Info & Logo ---
    if (data.company) {
      fillById("companyName", data.company.company_name);
      fillById("companyAddress", data.company.company_address);
      fillById("companyTel", data.company.tel_no);
      fillById("companyTIN", data.company.vat_tin);

      if (data.company.logo_path) {
        const logoEl = document.getElementById("invoice-logo");
        if (logoEl) {
          logoEl.src = data.company.logo_path;
          logoEl.style.display = "block";
        }
      }
    }

    // --- Items Table ---
    buildTable(Array.isArray(data.items) ? data.items : []);

    // --- Invoice Info ---
    fillLine("BILL TO", data.bill_to);
    fillLine("ADDRESS", `${data.address1 || ""} ${data.address2 || ""}`.trim());
    fillLine("N", data.invoice_no);
    fillLine("DATE", formatDate(data.date));
    fillLine("TIN", data.tin);
    fillLine("TERMS", data.terms);

    fillById("billTo", data.bill_to);
    fillById("address1", data.address1);
    fillById("address2", data.address2);
    fillById("invoiceNumber", data.invoice_no);
    fillById("invoiceDate", formatDate(data.date));
    fillById("tin", data.tin);
    fillById("terms", data.terms);

    // --- Payment Section ---
    const payment = data.payment || {};
    fillById("cash", payment.cash ? "✔" : "");
    fillById("check", payment.check_payment ? "✔" : "");
    fillById("checkNumber", payment.check_no);
    fillById("bank", payment.bank);
    fillById("paymentDate", formatDate(payment.pay_date));

    fillById("vatableSales", formatCurrency(payment.vatable_sales));
    fillById("vatExemptSales", formatCurrency(payment.vat_exempt));
    fillById("zeroRatedSales", formatCurrency(payment.zero_rated));
    fillById("vatAmount", formatCurrency(payment.vat_amount));
    fillById("lessVAT", formatCurrency(payment.less_vat));
    fillById("netOfVAT", formatCurrency(payment.net_vat));
    fillById("withholdingTax", formatCurrency(payment.withholding));
    fillById("total", formatCurrency(payment.total));
    fillById("totalDue", formatCurrency(payment.due));
    fillById("totalPayable", formatCurrency(payment.payable));

    // --- Signatures ---
    fillById("preparedBy", payment.prepared_by);
    fillById("approvedBy", payment.approved_by);
    fillById("receivedBy", payment.received_by);

    // --- Footer ---
    if (data.footer) {
      fillById("footer-atp-no", data.footer.atp_no);
      fillById("footer-atp-date", formatDate(data.footer.atp_date));
      fillById("footer-bir-permit", data.footer.bir_permit_no);
      fillById("footer-bir-date", formatDate(data.footer.bir_date));
      fillById("footer-serial-nos", data.footer.serial_nos);
    }
  } catch (err) {
    console.error("❌ Error loading invoice:", err);
    alert("Error loading invoice — showing empty template.");
  }
};

// ===============================
// EXPORT INVOICE DATA SCRIPT
// ===============================
// (keep your existing export functions if you have them)


// ============================
// EXPORT INVOICE DATA SCRIPT
// ============================

// Dropdown toggle for Export menu
function toggleDropdown() {
  document.querySelector('.dropdown').classList.toggle('show');
}
window.onclick = function(event) {
  if (!event.target.matches('.export-btn')) {
    document.querySelectorAll('.dropdown.show').forEach(drop => drop.classList.remove('show'));
  }
};

// Main export handler
function exportInvoice(type) {
  const invoiceData = getInvoiceDataFromDOM();

  if (type === 'json') {
    const blob = new Blob([JSON.stringify(invoiceData, null, 2)], {type : 'application/json'});
    downloadBlob(blob, 'invoice.json');
  } else if (type === 'xml') {
    const xml = objectToXml(invoiceData, 'invoice');
    const blob = new Blob([xml], {type : 'application/xml'});
    downloadBlob(blob, 'invoice.xml');
  } else if (type === 'excel') {
    // Generate CSV with UTF-8 BOM to preserve currency symbols in Excel
    const csv = '\uFEFF' + objectToCSV(invoiceData); // Add BOM!
    const blob = new Blob([csv], {type : 'text/csv'});
    downloadBlob(blob, 'invoice.csv');
  }
}

// Download helper
function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Extract invoice data from DOM
function getInvoiceDataFromDOM() {
  // Company Info
  const companyName = document.getElementById('companyName')?.textContent.trim();
  const companyAddress = document.getElementById('companyAddress')?.textContent.trim();
  const companyTel = document.getElementById('companyTel')?.textContent.trim();
  const companyTIN = document.getElementById('companyTIN')?.textContent.trim();
  // Invoice Info
  const billTo = document.getElementById('billTo')?.textContent.trim();
  const address1 = document.getElementById('address1')?.textContent.trim();
  const address2 = document.getElementById('address2')?.textContent.trim();
  const tin = document.getElementById('tin')?.textContent.trim();
  const invoiceNumber = document.getElementById('invoiceNumber')?.textContent.trim();
  const invoiceDate = document.getElementById('invoiceDate')?.textContent.trim();
  const terms = document.getElementById('terms')?.textContent.trim();

  // Items Table (SKIP EMPTY ROWS)
  const itemRows = [];
  document.querySelectorAll('#itemRows tr').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length) {
      const item = {
        description: tds[0]?.textContent.trim(),
        quantity: tds[1]?.textContent.trim(),
        unit_price: tds[2]?.textContent.trim(),
        amount: tds[3]?.textContent.trim(),
        one: tds[4]?.textContent.trim(),
        two: tds[5]?.textContent.trim()
      };
      // Only include non-empty rows
      if (Object.values(item).some(val => val !== "")) {
        itemRows.push(item);
      }
    }
  });

  // Payment Table
  function getText(id) {
    return document.getElementById(id)?.textContent.trim();
  }
  const payment = {
    cash: getText('cash'),
    check: getText('check'),
    checkNumber: getText('checkNumber'),
    bank: getText('bank'),
    paymentDate: getText('paymentDate'),
    vatableSales: getText('vatableSales'),
    totalWithVAT: getText('totalWithVAT'),
    vatAmount: getText('vatAmount'),
    lessVAT: getText('lessVAT'),
    zeroRatedSales: getText('zeroRatedSales'),
    netOfVAT: getText('netOfVAT'),
    vatExemptSales: getText('vatExemptSales'),
    total: getText('total'),
    addVAT: getText('addVAT'),
    withholdingTax: getText('withholdingTax'),
    totalPayable: getText('totalPayable')
  };

  // Footer
  const footer = {
    atpNo: getText('footer-atp-no'),
    atpDate: getText('footer-atp-date'),
    birPermit: getText('footer-bir-permit'),
    birDate: getText('footer-bir-date'),
    serialNos: getText('footer-serial-nos')
  };

  return {
    company: { companyName, companyAddress, companyTel, companyTIN },
    invoice: { billTo, address1, address2, tin, invoiceNumber, invoiceDate, terms },
    items: itemRows,
    payment,
    footer
  };
}

// Object to XML (recursive, array support)
function objectToXml(obj, rootName) {
  let xml = `<${rootName}>`;
  for (let key in obj) {
    if (Array.isArray(obj[key])) {
      xml += `<${key}>`;
      obj[key].forEach(item => { xml += objectToXml(item, 'item'); });
      xml += `</${key}>`;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      xml += objectToXml(obj[key], key);
    } else {
      xml += `<${key}>${escapeXml(obj[key] ?? '')}</${key}>`;
    }
  }
  xml += `</${rootName}>`;
  return xml;
}
function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// Object to CSV (for Excel) with UTF-8 BOM
function objectToCSV(obj) {
  let lines = [];
  // Company
  lines.push(['Company Name', obj.company.companyName]);
  lines.push(['Company Address', obj.company.companyAddress]);
  lines.push(['Company Tel', obj.company.companyTel]);
  lines.push(['Company TIN', obj.company.companyTIN]);
  // Invoice info
  lines.push(['Bill To', obj.invoice.billTo]);
  lines.push(['Address 1', obj.invoice.address1]);
  lines.push(['Address 2', obj.invoice.address2]);
  lines.push(['TIN', obj.invoice.tin]);
  lines.push(['Invoice No', obj.invoice.invoiceNumber]);
  lines.push(['Invoice Date', obj.invoice.invoiceDate]);
  lines.push(['Terms', obj.invoice.terms]);
  // Items
  lines.push(['--- Items ---']);
  lines.push(['Description','Quantity','Unit Price','Amount','One','Two']);
  obj.items.forEach(item => {
    lines.push([item.description, item.quantity, item.unit_price, item.amount, item.one, item.two]);
  });
  // Payment
  lines.push(['--- Payment ---']);
  for (const k in obj.payment) {
    lines.push([k, obj.payment[k]]);
  }
  // Footer
  lines.push(['--- Footer ---']);
  for (const k in obj.footer) {
    lines.push([k, obj.footer[k]]);
  }
  return lines.map(row => row.map(x => `"${(x??'').replace(/"/g, '""')}"`).join(',')).join('\n');
}