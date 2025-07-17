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

  // ✅ Fill the <span class="line"> elements
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

  // ✅ Fill top fields
  fillLine("BILL TO", data.billTo);
  fillLine("ADDRESS", data.address);
  fillLine("N", data.invoiceNo); // Handles "No"
  fillLine("DATE", data.date);
  fillLine("TIN", data.tin);
  fillLine("TIME", data.time);

  const tbody = document.querySelector(".invoice-table tbody");
const placeholderRow = tbody.querySelector("tr");

 if (Array.isArray(data.items)) {
  data.items.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.desc || ""}</td>
      <td>${item.qty || ""}</td>
      <td>${formatCurrency(item.rate)}</td>
      <td>${formatCurrency(item.amt)}</td>
    `;
    tbody.insertBefore(row, placeholderRow); // Insert before placeholder
  });
}

  // ✅ Fill payment table
  const paymentValues = [
    data.cash ? "✔" : "", "", formatCurrency(data.vatableSales), "", formatCurrency(data.totalSales),
    data.check ? "✔" : "", formatCurrency(data.vatExempt), "", formatCurrency(data.lessVat),
    data.checkNo || "", "", formatCurrency(data.zeroRated), "", formatCurrency(data.netVat),
    data.bank || "", "", formatCurrency(data.vatAmount), "", formatCurrency(data.withholding),
    data.payDate || "", "", formatCurrency(data.total), "", formatCurrency(data.due),
    "", "", "", "", formatCurrency(data.addVat),
    "", "", "", "", formatCurrency(data.payable)
  ];

  const paymentCells = document.querySelectorAll(".payment-table td");
  paymentValues.forEach((val, i) => {
    if (paymentCells[i]) {
      paymentCells[i].textContent = val;
    }
  });
};

// ✅ Clear stored data when leaving
window.addEventListener('beforeunload', () => {
  localStorage.removeItem('invoiceData');
});