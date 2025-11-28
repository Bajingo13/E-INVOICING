"use strict";

/* ============================================================
   1) ADD / REMOVE ROWS
============================================================ */
function addRow() {
  const tbody = document.getElementById("items-body");
  const firstRow = tbody.rows[0];

  // clone the row
  const newRow = firstRow.cloneNode(true);

  // clear all inputs
  newRow.querySelectorAll("input").forEach(input => {
    input.value = "";
  });

  tbody.appendChild(newRow);
}

function removeRow() {
  const tbody = document.getElementById("items-body");
  if (tbody.rows.length > 1) {
    tbody.deleteRow(tbody.rows.length - 1);
  }
}

/* ============================================================
   2) ADD / REMOVE COLUMNS
============================================================ */
function addColumn() {
  const table = document.getElementById("items-table");

  // create new column header
  const th = document.createElement("th");
  th.textContent = "NEW COLUMN";
  table.querySelector("thead tr").appendChild(th);

  // add cells to each row
  const rows = table.querySelectorAll("tbody tr");
  rows.forEach(row => {
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" class="input-full" />`;
    row.appendChild(td);
  });
}

function removeColumn() {
  const table = document.getElementById("items-table");
  const headRow = table.querySelector("thead tr");

  if (headRow.cells.length > 5) { 
    // remove last column
    headRow.deleteCell(-1);

    const rows = table.querySelectorAll("tbody tr");
    rows.forEach(row => row.deleteCell(-1));
  }
}

/* ============================================================
   3) UPDATE AMOUNT PER ROW
============================================================ */
function updateAmount(el) {
  const row = el.parentNode.parentNode;

  const qty = parseFloat(row.querySelector('input[name="qty[]"]').value) || 0;
  const rate = parseFloat(row.querySelector('input[name="rate[]"]').value) || 0;

  const amtField = row.querySelector('input[name="amt[]"]');
  amtField.value = (qty * rate).toFixed(2);

  calculateTotals();
}

/* ============================================================
   4) TOTAL CALCULATIONS & VAT LOGIC
============================================================ */
function calculateTotals() {
  let totalSales = 0;

  document.querySelectorAll('input[name="amt[]"]').forEach(field => {
    totalSales += parseFloat(field.value) || 0;
  });

  const vatType = document.getElementById("vatType").value;
  const discountRate = parseFloat(document.getElementById("discount").value) || 0;
  const withholding = parseFloat(document.getElementById("withholdingTax").value) || 0;

  let vatable = 0, vatAmount = 0, exempt = 0, zero = 0;

  if (vatType === "inclusive") {
    vatable = totalSales / 1.12;
    vatAmount = totalSales - vatable;
  } 
  else if (vatType === "exclusive") {
    vatable = totalSales;
    vatAmount = totalSales * 0.12;
  } 
  else {
    exempt = totalSales;
  }

  const discount = totalSales * discountRate;

  const subtotal = totalSales - discount;
  const grandTotal = subtotal + vatAmount - withholding;

  // set fields
  document.getElementById("vatableSales").value = vatable.toFixed(2);
  document.getElementById("vatAmount").value = vatAmount.toFixed(2);
  document.getElementById("vatExemptSales").value = exempt.toFixed(2);
  document.getElementById("zeroRatedSales").value = zero.toFixed(2);
  document.getElementById("subtotal").value = subtotal.toFixed(2);
  document.getElementById("totalPayable").value = grandTotal.toFixed(2);
}

/* ============================================================
   5) AUTO DATE HANDLING (ISSUE → DUE)
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
   6) LOAD COMPANY INFO (FROM BACKEND / LOCALSTORAGE)
============================================================ */
function loadCompanyInfo() {
  fetch("/api/company-info")
    .then(res => res.json())
    .then(data => {
      document.getElementById("company-name").textContent = data.name;
      document.getElementById("company-address").textContent = data.address;
      document.getElementById("company-tel").textContent = data.tel;
      document.getElementById("company-tin").textContent = data.tin;
      document.getElementById("invoice-logo").src = data.logo;
    });
}

/* ============================================================
   7) INIT
============================================================ */
window.addEventListener("DOMContentLoaded", () => {
  loadCompanyInfo();
  calculateTotals();
});
