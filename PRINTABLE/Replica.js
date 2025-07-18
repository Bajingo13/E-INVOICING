window.onload = function () {
  const data = JSON.parse(localStorage.getItem('invoiceData'));
  console.log('📦 Loaded data:', data);

  if (!data) {
    alert("No invoice data found. Please fill out the form first.");
    return;
  }

  // ✅ Format as PHP currency
  function formatCurrency(value) {
    const num = parseFloat(value);
    return isNaN(num) ? "" : num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
  }

  // ✅ Fill the <span class="line"> elements by label
  function fillLine(labelText, value) {
    const fields = document.querySelectorAll(".field");
    fields.forEach(field => {
      const label = field.querySelector(".label");
      const line = field.querySelector(".line");
      if (label && line && label.textContent.trim().startsWith(labelText)) {
        line.textContent = value || "___________";
      }
    });
  }

  // ✅ Fill top fields (with fallback to new ID-based fields)
  fillLine("BILL TO", data.billTo);
  fillLine("ADDRESS", `${data.address1} ${data.address2}`.trim());
  fillLine("N", data.invoiceNo); // Handles "No"
  fillLine("DATE", data.date);
  fillLine("TIN", data.tin);
  fillLine("TIME", data.time);

  // ✅ Also support direct ID-based filling for key fields
  const fillById = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "";
  };

  // 🔄 ID-based fields (top section + payment + signatures)
  fillById("billTo", data.billTo);
  fillById("address1", data.address1);
  fillById("address2", data.address2);
  fillById("invoiceNumber", data.invoiceNo);
  fillById("invoiceDate", data.date);
  fillById("tin", data.tin);
  fillById("time", data.time);

  // ✅ Items table
  // ✅ Items table
const tbody = document.getElementById("itemRows");
const placeholderRow = tbody.querySelector("tr");

// ✅ Load dynamic columns reliably
const extraFields = Array.isArray(data.extraColumns) ? data.extraColumns : [];

// ✅ Update table headers dynamically
const theadRow = document.querySelector("#itemRows").closest("table").querySelector("thead tr");
extraFields.forEach(field => {
  const th = document.createElement("th");
  th.textContent = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  theadRow.appendChild(th);
});

// ✅ Render item rows
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
    tbody.insertBefore(row, placeholderRow);
  });
}


  // ✅ Fill payment-related fields by ID
  fillById("cash", data.cash ? "✔" : "");
  fillById("check", data.check ? "✔" : "");
  fillById("checkNumber", data.checkNo);
  fillById("bank", data.bank);
  fillById("paymentDate", data.payDate);

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

  // ✅ Fill signatures if available
  fillById("preparedBy", data.preparedBy);
  fillById("approvedBy", data.approvedBy);
  fillById("receivedBy", data.receivedBy);
};

// ✅ Clear stored data when leaving
window.addEventListener('beforeunload', () => {
  localStorage.removeItem('invoiceData');
});
