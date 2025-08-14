window.onload = async function () {
 const params = new URLSearchParams(window.location.search);
const invoiceNo = params.get('invoice_no');

if (!invoiceNo) {
  alert("No invoice number provided in the URL.");
} else {
  fetch(`/invoice-no/${invoiceNo}`)
    .then(res => res.json())
    .then(data => {
      // populate invoice
    })
    .catch(err => console.error(err));
}

  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? "" : num.toLocaleString('en-PH', {
      style: 'currency',
      currency: 'PHP'
    });
  };

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

  const fillById = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "";
  };

  // ✅ Function to build base table so it’s never empty
  const buildBaseTable = (extraFields = []) => {
    const theadRow = document.getElementById("replica-thead-row");
    const colgroup = document.getElementById("invoice-colgroup");
    const tbody = document.getElementById("itemRows");

    theadRow.innerHTML = "";
    colgroup.innerHTML = "";
    tbody.innerHTML = "";

    // Headers
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

    // Column widths
    ["40%", "10%", "15%", "15%"].forEach(width => {
      const col = document.createElement("col");
      col.style.width = width;
      colgroup.appendChild(col);
    });
    extraFields.forEach(() => {
      const col = document.createElement("col");
      col.style.width = `${(20 / extraFields.length).toFixed(2)}%`;
      colgroup.appendChild(col);
    });

    // Empty rows placeholder
    const TOTAL_ROWS = 21;
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const row = document.createElement("tr");
      let cells = ["&nbsp;", "&nbsp;", "&nbsp;", "&nbsp;"];
      extraFields.forEach(() => cells.push("&nbsp;"));
      row.innerHTML = cells.map(c => `<td>${c}</td>`).join("");
      tbody.appendChild(row);
    }
  };

  // ✅ Always build table first with no extra fields
  buildBaseTable();

  if (!invoiceId) {
    alert("No invoice ID provided in the URL.");
    return;
  }

  try {
    const res = await fetch(`/invoice/${encodeURIComponent(invoiceId)}`);
    if (!res.ok) throw new Error("Failed to fetch invoice");

    const data = await res.json();
    console.log("📦 Loaded data from DB:", data);

    const extraFields = Array.isArray(data.extra_columns) ? data.extra_columns : [];

    // ✅ Rebuild table with correct extra columns
    buildBaseTable(extraFields);

    // ✅ Fill table rows
    const tbody = document.getElementById("itemRows");
    tbody.innerHTML = "";
    const TOTAL_ROWS = 21;
    const items = Array.isArray(data.items) ? data.items : [];

    items.forEach(item => {
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

    // Fill empty rows
    for (let i = items.length; i < TOTAL_ROWS; i++) {
      const row = document.createElement("tr");
      const cells = ["&nbsp;", "&nbsp;", "&nbsp;", "&nbsp;"];
      extraFields.forEach(() => cells.push("&nbsp;"));
      row.innerHTML = cells.map(c => `<td>${c}</td>`).join("");
      tbody.appendChild(row);
    }

    // ✅ Fill header section
    fillLine("BILL TO", data.bill_to);
    fillLine("ADDRESS", `${data.address1 || ""} ${data.address2 || ""}`.trim());
    fillLine("N", data.invoice_no);
    fillLine("DATE", data.date);
    fillLine("TIN", data.tin);
    fillLine("TERMS", data.terms);

    fillById("billTo", data.bill_to);
    fillById("address1", data.address1);
    fillById("address2", data.address2);
    fillById("invoiceNumber", data.invoice_no);
    fillById("invoiceDate", data.date);
    fillById("tin", data.tin);
    fillById("terms", data.terms);

    // ✅ Payment Section
    fillById("cash", data.cash ? "✔" : "");
    fillById("check", data.check ? "✔" : "");
    fillById("checkNumber", data.check_no);
    fillById("bank", data.bank);
    fillById("paymentDate", data.pay_date);

    // ✅ Totals
    fillById("vatableSales", formatCurrency(data.vatable_sales));
    fillById("vatExemptSales", formatCurrency(data.vat_exempt));
    fillById("zeroRatedSales", formatCurrency(data.zero_rated));
    fillById("vatAmount", formatCurrency(data.vat_amount));
    fillById("lessVAT", formatCurrency(data.less_vat));
    fillById("netOfVAT", formatCurrency(data.net_vat));
    fillById("withholdingTax", formatCurrency(data.withholding_tax));
    fillById("total", formatCurrency(data.total));
    fillById("totalDue", formatCurrency(data.total_due));
    fillById("addVAT", formatCurrency(data.add_vat));
    fillById("totalPayable", formatCurrency(data.total_payable));
    fillById("totalWithVAT", formatCurrency(data.total_with_vat));

    // ✅ Signatures
    fillById("preparedBy", data.prepared_by);
    fillById("approvedBy", data.approved_by);
    fillById("receivedBy", data.received_by);

  } catch (err) {
    console.error(err);
    alert("Error loading invoice — showing empty template.");
  }
};
