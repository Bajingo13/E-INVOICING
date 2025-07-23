window.onload = function () {
  const data = JSON.parse(localStorage.getItem('invoiceData'));
  console.log('📦 Loaded data:', data);

  if (!data) {
    alert("No invoice data found. Please fill out the form first.");
    return;
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
  fillLine("TIME", data.time);

  fillById("billTo", data.billTo);
  fillById("address1", data.address1);
  fillById("address2", data.address2);
  fillById("invoiceNumber", data.invoiceNo);
  fillById("invoiceDate", data.date);
  fillById("tin", data.tin);
  fillById("time", data.time);

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
  ["DESCRIPTION", "QUANTITY", "UNIT COST/RATE", "AMOUNT"].forEach(label => {
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
  if (Array.isArray(data.items)) {
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
