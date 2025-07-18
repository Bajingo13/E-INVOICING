console.log("✅ EINVOICING.js is loaded");

function saveToLocalStorage() {
  console.log("🟢 saveToLocalStorage called");

  const billTo = document.querySelector('input[name="billTo"]').value;
  const invoiceNo = document.querySelector('input[name="invoiceNo"]').value;
  const date = document.querySelector('input[name="date"]').value;

  if (!billTo || !invoiceNo || !date) {
    alert("Please fill out required fields: Bill To, Invoice No, and Date.");
    return;
  }

  calculateTotals();

  const data = {
    invoiceNo,
    billTo,
    date,
    address1: document.querySelector('input[name="address1"]')?.value || "",
    address2: document.querySelector('input[name="address2"]')?.value || "",
    tin: document.querySelector('input[name="tin"]')?.value || "",
    time: document.querySelector('input[name="time"]')?.value || "",
    items: Array.from(document.querySelectorAll('#items-body tr')).map(row => ({
      desc: row.querySelector('input[name="desc[]"]')?.value || "",
      qty: row.querySelector('input[name="qty[]"]')?.value || "",
      rate: row.querySelector('input[name="rate[]"]')?.value || "",
      amt: row.querySelector('input[name="amt[]"]')?.value || "",
    })),
    vatableSales: document.querySelector('input[name="vatableSales"]')?.value || "",
    totalSales: document.querySelector('input[name="totalSales"]')?.value || "",
    vatExempt: document.querySelector('input[name="vatExempt"]')?.value || "",
    lessVat: document.querySelector('input[name="lessVat"]')?.value || "",
    zeroRated: document.querySelector('input[name="zeroRated"]')?.value || "",
    netVat: document.querySelector('input[name="netVat"]')?.value || "",
    vatAmount: document.querySelector('input[name="vatAmount"]')?.value || "",
    withholding: document.querySelector('input[name="withholding"]')?.value || "",
    total: document.querySelector('input[name="total"]')?.value || "",
    due: document.querySelector('input[name="due"]')?.value || "",
    addVat: document.querySelector('input[name="addVat"]')?.value || "",
    payable: document.querySelector('input[name="payable"]')?.value || "",
    payDate: document.querySelector('input[name="payDate"]')?.value || "",
    cash: document.querySelector('input[name="cash"]')?.checked || false,
    check: document.querySelector('input[name="check"]')?.checked || false,
    checkNo: document.querySelector('input[name="checkNo"]')?.value || "",
    bank: document.querySelector('input[name="bank"]')?.value || "",
    preparedBy: document.querySelector('input[name="preparedBy"]')?.value || "",
    approvedBy: document.querySelector('input[name="approvedBy"]')?.value || "",
    receivedBy: document.querySelector('input[name="receivedBy"]')?.value || ""
  };

  localStorage.setItem('invoiceData', JSON.stringify(data));
  console.log("✅ Saved invoiceData:", data);

  window.location.href = "../PRINTABLE/Replica.html";
}

function addRow() {
  const tbody = document.getElementById('items-body');
  const headerCols = document.querySelectorAll("#items-table thead tr th");
  const newRow = document.createElement('tr');

  // Default cells
  newRow.innerHTML = `
    <td><input type="text" class="input-full" name="desc[]"></td>
    <td><input type="number" class="input-short" name="qty[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="rate[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="amt[]" readonly></td>
  `;

  // Extra dynamic columns (excluding 4 default + 1 delete)
  const extraCols = headerCols.length - 5;
  for (let i = 0; i < extraCols; i++) {
    const td = document.createElement("td");
    td.innerHTML = `<input type="text">`;
    newRow.appendChild(td);
  }

  // Trash/delete column (always last)
  const deleteTd = document.createElement("td");
  deleteTd.innerHTML = `<button type="button" class="delete-btn" onclick="deleteRow(this)">🗑️</button>`;
  newRow.appendChild(deleteTd);

  tbody.appendChild(newRow);
  
  // Adjust column widths after adding a row
  adjustColumnWidths();
}

function addColumn() {
  const columnName = prompt("Enter new column name:");
  if (!columnName) return;

  const theadRow = document.querySelector("#items-table thead tr");
  const ths = theadRow.querySelectorAll("th");

  const deleteTh = ths[ths.length - 1]; // trash column
  const newTh = document.createElement("th");
  newTh.textContent = columnName;
  theadRow.insertBefore(newTh, deleteTh);

  const rows = document.querySelectorAll("#items-table tbody tr");
  rows.forEach(row => {
    const tds = row.querySelectorAll("td");
    const deleteTd = tds[tds.length - 1]; // trash column
    const newTd = document.createElement("td");
    newTd.innerHTML = `<input type="text" name="${columnName.toLowerCase().replace(/\s+/g, '_')}[]">`;
    row.insertBefore(newTd, deleteTd);
  });
  
  // Adjust column widths after adding a column
  adjustColumnWidths();
}

function updateAmount(el) {
  const row = el.closest('tr');
  const qty = parseFloat(row.querySelector('input[name="qty[]"]').value) || 0;
  const rate = parseFloat(row.querySelector('input[name="rate[]"]').value) || 0;
  const amtField = row.querySelector('input[name="amt[]"]');
  amtField.value = (qty * rate).toFixed(2);

  calculateTotals();
}

function deleteRow(button) {
  const tbody = document.getElementById('items-body');
  const row = button.closest('tr');

  if (tbody.rows.length > 1) {
    tbody.removeChild(row);
    calculateTotals();
  } else {
    alert("At least one row must remain.");
  }
  
  // Adjust column widths after deleting a row
  adjustColumnWidths();
}

function calculateTotals() {
  let totalSales = 0;
  document.querySelectorAll('input[name="amt[]"]').forEach(input => {
    totalSales += parseFloat(input.value) || 0;
  });

  const vatRate = 0.12;
  const vatAmount = totalSales / (1 + vatRate) * vatRate;
  const netVat = totalSales - vatAmount;

  const withholding = parseFloat(document.querySelector('input[name="withholding"]')?.value) || 0;
  const addVat = parseFloat(document.querySelector('input[name="addVat"]')?.value) || 0;

  const payable = totalSales + addVat;
  const due = payable - withholding;

  document.querySelector('input[name="totalSales"]').value = totalSales.toFixed(2);
  document.querySelector('input[name="vatAmount"]').value = vatAmount.toFixed(2);
  document.querySelector('input[name="netVat"]').value = netVat.toFixed(2);
  document.querySelector('input[name="payable"]').value = payable.toFixed(2);
  document.querySelector('input[name="due"]').value = due.toFixed(2);
}

/**
 * Adjust column widths dynamically to keep table layout intact
 */
function adjustColumnWidths() {
  const table = document.getElementById('items-table');
  const theadRow = table.querySelector('thead tr');
  const ths = theadRow.querySelectorAll('th');

  const deleteColWidth = 40; // px width of trash column
  const totalTableWidth = table.clientWidth || 900; // fallback width if clientWidth 0
  const availableWidth = totalTableWidth - deleteColWidth;

  const colCount = ths.length - 1; // exclude trash column

  if (colCount <= 0) return; // safety

  const colWidthPercent = (availableWidth / totalTableWidth) * 100 / colCount;

  // Set width for each th except trash column
  for (let i = 0; i < ths.length - 1; i++) {
    ths[i].style.width = colWidthPercent + '%';
  }

  // Set fixed width for trash column
  ths[ths.length - 1].style.width = deleteColWidth + 'px';

  // Adjust tbody cells width similarly
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const tds = row.querySelectorAll('td');
    for (let i = 0; i < tds.length - 1; i++) {
      tds[i].style.width = colWidthPercent + '%';
    }
    tds[tds.length - 1].style.width = deleteColWidth + 'px';
  });
}
