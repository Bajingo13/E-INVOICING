"use strict";

/* ============================================================
   1) ADD / REMOVE ROWS
============================================================ */
function addRow() {
  const tbody = document.getElementById("items-body");
  const firstRow = tbody.rows[0];
  const newRow = firstRow.cloneNode(true);
  newRow.querySelectorAll("input").forEach(input => input.value = "");
  tbody.appendChild(newRow);
}

function removeRow() {
  const tbody = document.getElementById("items-body");
  if (tbody.rows.length > 1) tbody.deleteRow(tbody.rows.length - 1);
}

/* ============================================================
   2) ADD / REMOVE COLUMNS
============================================================ */
function addColumn(title = "NEW COLUMN") {
  const table = document.getElementById("items-table");
  const th = document.createElement("th");
  th.textContent = title;
  table.querySelector("thead tr").appendChild(th);

  table.querySelectorAll("tbody tr").forEach(row => {
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" class="input-full" />`;
    row.appendChild(td);
  });
}

function removeColumn() {
  const table = document.getElementById("items-table");
  const headRow = table.querySelector("thead tr");

  if (headRow.cells.length > 5) {
    headRow.deleteCell(-1);
    table.querySelectorAll("tbody tr").forEach(row => row.deleteCell(-1));
  }
}

/* ============================================================
   3) UPDATE AMOUNT PER ROW
============================================================ */
function updateAmount(el) {
  const row = el.closest("tr");
  const qty = parseFloat(row.querySelector('input[name="qty[]"]').value) || 0;
  const rate = parseFloat(row.querySelector('input[name="rate[]"]').value) || 0;

  const amtField = row.querySelector('input[name="amt[]"]');
  amtField.value = (qty * rate).toFixed(2);
  calculateTotals();
}

/* ============================================================
   4) TOTAL CALCULATIONS & VAT
============================================================ */
function calculateTotals() {
  let totalSales = 0;
  document.querySelectorAll('input[name="amt[]"]').forEach(f => {
    totalSales += parseFloat(f.value) || 0;
  });

  const vatType = document.getElementById("vatType").value;
  const discountRate = parseFloat(document.getElementById("discount").value) || 0;
  const withholding = parseFloat(document.getElementById("withholdingTax").value) || 0;

  let vatable = 0, vatAmount = 0, exempt = 0, zero = 0;

  if (vatType === "inclusive") {
    vatable = totalSales / 1.12;
    vatAmount = totalSales - vatable;
  } else if (vatType === "exclusive") {
    vatable = totalSales;
    vatAmount = totalSales * 0.12;
  } else {
    exempt = totalSales;
  }

  const discount = totalSales * discountRate;
  const subtotal = totalSales - discount;
  const grandTotal = subtotal + vatAmount - withholding;

  document.getElementById("vatableSales").value = vatable.toFixed(2);
  document.getElementById("vatAmount").value = vatAmount.toFixed(2);
  document.getElementById("vatExemptSales").value = exempt.toFixed(2);
  document.getElementById("zeroRatedSales").value = zero.toFixed(2);
  document.getElementById("subtotal").value = subtotal.toFixed(2);
  document.getElementById("totalPayable").value = grandTotal.toFixed(2);
}

/* ============================================================
   5) AUTO DATE HANDLING
============================================================ */
function populateDates() {
  const issue = document.getElementById("issueDate").value;
  if (!issue) return;

  const due = new Date(issue);
  due.setDate(due.getDate() + 30);
  document.getElementById("dueDate").value = due.toISOString().split("T")[0];
}

function updateDueDate() {
  calculateTotals();
}

/* ============================================================
   6) LOAD COMPANY INFO (FIXED ENDPOINT)
============================================================ */
function loadCompanyInfo() {
  fetch("/api/company-info")  // <-- fixed endpoint
    .then(res => res.ok ? res.json() : Promise.reject("Failed to fetch company info"))
    .then(data => {
      if (!data) return;

      document.getElementById("company-name").textContent = data.company_name || '';
      document.getElementById("company-address").textContent = data.company_address || '';
      document.getElementById("company-tel").textContent = data.tel_no || '';
      document.getElementById("company-tin").textContent = data.vat_tin || '';

      const logoEl = document.getElementById("invoice-logo");
      if (data.logo_path) {
        logoEl.src = data.logo_path;
        logoEl.style.display = "block";
      } else {
        logoEl.style.display = "none";
      }
    })
    .catch(err => console.error("Error loading company info:", err));
}

/* ============================================================
   7) INIT
============================================================ */
window.addEventListener("DOMContentLoaded", () => {
  loadCompanyInfo();
  calculateTotals();
});
