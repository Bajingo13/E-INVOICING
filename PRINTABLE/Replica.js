window.onload = function () {
  const raw = localStorage.getItem('invoiceData');
const data = raw ? JSON.parse(raw) : {};

  console.log('📦 Loaded data:', data);

  if (!data) {
  alert("No invoice data found. Displaying empty invoice.");
}


  // 🔁 Formatter
  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? "" : num.toLocaleString('en-PH', {
      style: 'currency',
      currency: 'PHP'
    });
  };

  // 🔁 Fill by .label/.line combo
  const fillLine = (labelText, value) => {
    const fields = document.querySelectorAll(".field");
    fields.forEach(field => {
      const label = field.querySelector(".label");
      const line = field.querySelector(".line");
      if (label && line && label.textContent.trim().startsWith(labelText)) {
        line.textContent = value || "___________";
      }
    });
  };

  // 🔁 Fill by ID
  const fillById = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "";
  };

  // ✅ Top Section
  fillLine("BILL TO", data.billTo);
  fillLine("ADDRESS", `${data.address1} ${data.address2}`.trim());
  fillLine("N", data.invoiceNo);
  fillLine("DATE", data.date);
  fillLine("TIN", data.tin);
  fillLine("TERMS", data.terms);

  fillById("billTo", data.billTo);
  fillById("address1", data.address1);
  fillById("address2", data.address2);
  fillById("invoiceNumber", data.invoiceNo);
  fillById("invoiceDate", data.date);
  fillById("tin", data.tin);
 fillLine("TERMS", data.terms);

  // ✅ Extra Columns
  const extraFields = Array.isArray(data.extraColumns) ? data.extraColumns : [];

  // ✅ Table Setup
  const tbody = document.getElementById("itemRows");
  const theadRow = document.getElementById("replica-thead-row");
  const colgroup = document.getElementById("invoice-colgroup");

  // Clear existing
  tbody.innerHTML = "";
  theadRow.innerHTML = "";
  colgroup.innerHTML = "";

  // Build Headers
  ["ITEM DESCRIPTION / NATURE OF SERVICE", "QUANTITY", "UNIT PRICE", "AMOUNT"].forEach(label => {
  const th = document.createElement("th");
  th.textContent = label;
  theadRow.appendChild(th);
});




  extraFields.forEach(field => {
    const th = document.createElement("th");
    th.textContent = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    theadRow.appendChild(th);
  });

  // Build Column Widths
  const baseWidths = ["40%", "10%", "15%", "15%"];
  const extraWidth = extraFields.length > 0 ? (20 / extraFields.length).toFixed(2) : 0;

  baseWidths.forEach(width => {
    const col = document.createElement("col");
    col.style.width = width;
    colgroup.appendChild(col);
  });

  extraFields.forEach(() => {
    const col = document.createElement("col");
    col.style.width = `${extraWidth}%`;
    colgroup.appendChild(col);
  });

  // Build Rows
const TOTAL_ROWS = 21; // Change this number to adjust row count

if (Array.isArray(data.items) && data.items.length > 0) {
  data.items.forEach(item => {
    const row = document.createElement("tr");
    const cells = [
      `<td>${item.desc || ""}</td>`,
      `<td>${item.qty || ""}</td>`,
      `<td>${formatCurrency(item.rate)}</td>`,
      `<td>${formatCurrency(item.amt)}</td>`
    ];
    extraFields.forEach(field => {
      cells.push(`<td>${item[field] || ""}</td>`);
    });
    row.innerHTML = cells.join("");
    tbody.appendChild(row);
  });

  // Fill in remaining empty rows to reach TOTAL_ROWS
  const remaining = TOTAL_ROWS - data.items.length;
  for (let i = 0; i < remaining; i++) {
    const row = document.createElement("tr");
    const cells = [
      `<td>&nbsp;</td>`,
      `<td>&nbsp;</td>`,
      `<td>&nbsp;</td>`,
      `<td>&nbsp;</td>`
    ];
    extraFields.forEach(() => {
      cells.push(`<td>&nbsp;</td>`);
    });
    row.innerHTML = cells.join("");
    tbody.appendChild(row);
  }

} else {
  // No items → fill all rows with blanks
  for (let i = 0; i < TOTAL_ROWS; i++) {
    const row = document.createElement("tr");
    const cells = [
      `<td>&nbsp;</td>`,
      `<td>&nbsp;</td>`,
      `<td>&nbsp;</td>`,
      `<td>&nbsp;</td>`
    ];
    extraFields.forEach(() => {
      cells.push(`<td>&nbsp;</td>`);
    });
    row.innerHTML = cells.join("");
    tbody.appendChild(row);
  }
}


  // ✅ Payment Section
  fillById("cash", data.cash ? "✔" : "");
  fillById("check", data.check ? "✔" : "");
  fillById("checkNumber", data.checkNo);
  fillById("bank", data.bank);
  fillById("paymentDate", data.payDate);

  // ✅ Totals
  fillById("vatableSales", formatCurrency(data.vatableSales));
  fillById("vatExemptSales", formatCurrency(data.vatExempt));
  fillById("zeroRatedSales", formatCurrency(data.zeroRated));
  fillById("vatAmount", formatCurrency(data.vatAmount));
  fillById("lessVAT", formatCurrency(data.lessVat));
  fillById("netOfVAT", formatCurrency(data.netVat));
  fillById("withholdingTax", formatCurrency(data.withholding));
  fillById("total", formatCurrency(data.total));
  fillById("totalDue", formatCurrency(data.due));
  fillById("addVAT", formatCurrency(data.addVat));
  fillById("totalPayable", formatCurrency(data.payable));
  fillById("totalWithVAT", formatCurrency(data.totalSales));

  // ✅ Signatures
  fillById("preparedBy", data.preparedBy);
  fillById("approvedBy", data.approvedBy);
  fillById("receivedBy", data.receivedBy);
};

// ✅ Clear localStorage when closing/refreshing
window.addEventListener('beforeunload', () => {
  localStorage.removeItem('invoiceData');
});

// Export to JSON function
function exportToJson() {
  const data = JSON.parse(localStorage.getItem('invoiceData'));
  if (!data) {
    alert("No invoice data found.");
    return;
  }

  const filename = `invoice_${data.invoiceNo || 'data'}.json`;
  const jsonStr = JSON.stringify(data, null, 2);

  const blob = new Blob([jsonStr], { type: "application/json" });
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function exportToXml() {
  const data = JSON.parse(localStorage.getItem('invoiceData'));
  if (!data) {
    alert("No invoice data found.");
    return;
  }

  const encode = (val) => {
    if (val == null) return "";
    return val.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  // Start XML document
  let xml = `<invoice>\n`;

  // Basic fields
  const simpleFields = [
    "billTo", "address1", "address2", "invoiceNo", "date", "tin", "terms",
    "cash", "check", "checkNo", "bank", "payDate",
    "vatableSales", "vatExempt", "zeroRated", "vatAmount", "lessVat",
    "netVat", "withholding", "total", "due", "addVat", "payable", "totalSales",
    "preparedBy", "approvedBy", "receivedBy"
  ];

  simpleFields.forEach(key => {
    xml += `  <${key}>${encode(data[key])}</${key}>\n`;
  });

  // Extra Columns
  if (Array.isArray(data.extraColumns)) {
    xml += `  <extraColumns>\n`;
    data.extraColumns.forEach(col => {
      xml += `    <column>${encode(col)}</column>\n`;
    });
    xml += `  </extraColumns>\n`;
  }

  // Items
  if (Array.isArray(data.items)) {
    xml += `  <items>\n`;
    data.items.forEach(item => {
      xml += `    <item>\n`;
      Object.entries(item).forEach(([key, value]) => {
        xml += `      <${key}>${encode(value)}</${key}>\n`;
      });
      xml += `    </item>\n`;
    });
    xml += `  </items>\n`;
  }

  xml += `</invoice>`;

  const filename = `invoice_${data.invoiceNo || 'data'}.xml`;
  const blob = new Blob([xml], { type: "application/xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}


// Get invoice ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const invoiceId = urlParams.get('id');

  // Example function to fill in invoice fields
  function populateInvoice(data) {
    document.getElementById("invoiceNumber").textContent = data.invoice_number ?? '';
    document.getElementById("invoiceDate").textContent = data.invoice_date ?? '';
    document.getElementById("billTo").textContent = data.bill_to ?? '';
    document.getElementById("totalAmount").textContent = `₱${(data.total_amount ?? 0).toFixed(2)}`;
    // Add more fields as needed
  }

  // Fetch the invoice by ID from the backend
  if (invoiceId) {
    fetch(`/invoice/${encodeURIComponent(invoiceId)}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch invoice");
        return res.json();
      })
      .then(data => {
        populateInvoice(data);
      })
      .catch(err => {
        console.error(err);
        alert("Invoice not found.");
      });
  } else {
    alert("No invoice ID provided in the URL.");
  }