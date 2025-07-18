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

  // ✅ Get dynamic column names (after the 4 default columns)
  const allThs = document.querySelectorAll("#items-table thead th");
  const extraColumns = [];
  allThs.forEach((th, index) => {
    if (index >= 4) {
      const key = th.textContent.trim().toLowerCase().replace(/\s+/g, "_");
      extraColumns.push(key);
    }
  });

  // ✅ Build data object
  const data = {
    invoiceNo,
    billTo,
    date,
    address1: document.querySelector('input[name="address1"]')?.value || "",
    address2: document.querySelector('input[name="address2"]')?.value || "",
    tin: document.querySelector('input[name="tin"]')?.value || "",
    time: document.querySelector('input[name="time"]')?.value || "",

    // ✅ Save each row including extra columns
    items: Array.from(document.querySelectorAll('#items-body tr')).map(row => {
      const item = {
        desc: row.querySelector('input[name="desc[]"]')?.value || "",
        qty: row.querySelector('input[name="qty[]"]')?.value || "",
        rate: row.querySelector('input[name="rate[]"]')?.value || "",
        amt: row.querySelector('input[name="amt[]"]')?.value || ""
      };

      // ✅ Add dynamic fields (e.g., jade, remarks, etc.)
      extraColumns.forEach((colKey, i) => {
        const cell = row.querySelectorAll('td')[i + 4]; // offset for desc, qty, rate, amt
        const input = cell?.querySelector('input');
        item[colKey] = input?.value || "";
      });

      return item;
    }),

    extraColumns, // ✅ include headers for Replica.html to render

    // ✅ Totals and Payment Details
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

  // ✅ Save to localStorage and redirect
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

  // Extra dynamic columns (excluding default 4)
  const extraCols = headerCols.length - 4;
  for (let i = 0; i < extraCols; i++) {
    const td = document.createElement("td");
    td.innerHTML = `<input type="text">`;
    newRow.appendChild(td);
  }

  tbody.appendChild(newRow);
  adjustColumnWidths();
}

function removeRow() {
  const tbody = document.getElementById('items-body');
  const rowCount = tbody.rows.length;

  if (rowCount <= 1) {
    alert("At least one row must remain.");
    return;
  }

  const index = prompt(`Enter row number to remove (1 to ${rowCount}):`);
  const rowIndex = parseInt(index);

  if (isNaN(rowIndex) || rowIndex < 1 || rowIndex > rowCount) {
    alert("Invalid row number.");
    return;
  }

  tbody.deleteRow(rowIndex - 1); // Convert to 0-based index
  calculateTotals();
  adjustColumnWidths();
}


function addColumn() {
  const columnName = prompt("Enter new column name:");
  if (!columnName) return;

  const theadRow = document.querySelector("#items-table thead tr");
  const newTh = document.createElement("th");
  newTh.textContent = columnName;
  theadRow.appendChild(newTh);

  const rows = document.querySelectorAll("#items-table tbody tr");
  rows.forEach(row => {
    const newTd = document.createElement("td");
    newTd.innerHTML = `<input type="text" name="${columnName.toLowerCase().replace(/\s+/g, '_')}[]">`;
    row.appendChild(newTd);
  });

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

function adjustColumnWidths() {
  const table = document.getElementById('items-table');
  const theadRow = table.querySelector('thead tr');
  const ths = theadRow.querySelectorAll('th');

  const totalTableWidth = table.clientWidth || 900;
  const colCount = ths.length;

  if (colCount === 0) return;

  const colWidthPercent = 100 / colCount;

  for (let i = 0; i < ths.length; i++) {
    ths[i].style.width = colWidthPercent + '%';
  }

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const tds = row.querySelectorAll('td');
    for (let i = 0; i < tds.length; i++) {
      tds[i].style.width = colWidthPercent + '%';
    }
  });
}

function removeColumn() {
  const columnName = prompt("Enter the exact column name to remove:");
  if (!columnName) return;

  const theadRow = document.querySelector("#items-table thead tr");
  const ths = theadRow.querySelectorAll("th");

  let colIndexToRemove = -1;
  ths.forEach((th, index) => {
    if (th.textContent.trim().toLowerCase() === columnName.trim().toLowerCase()) {
      colIndexToRemove = index;
    }
  });

  if (colIndexToRemove === -1) {
    alert(`Column "${columnName}" not found.`);
    return;
  }

  if (colIndexToRemove < 4) {
    alert("Default columns (Description, Qty, Rate, Amt) cannot be removed.");
    return;
  }

  // Remove header
  theadRow.removeChild(ths[colIndexToRemove]);

  // Remove cells in body rows
  const rows = document.querySelectorAll("#items-table tbody tr");
  rows.forEach(row => {
    const tds = row.querySelectorAll("td");
    if (tds.length > colIndexToRemove) {
      row.removeChild(tds[colIndexToRemove]);
    }
  });

  adjustColumnWidths();
}

// When saving data from EINVOICING.html
invoiceData.extraColumns = dynamicColumnNamesArray; // e.g., ['discount', 'remarks']
