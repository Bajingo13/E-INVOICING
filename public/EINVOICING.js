console.log("✅ EINVOICING.js is loaded");

/* ------------------------- 1. MAIN SAVE FUNCTION ------------------------- */
async function saveToDatabase() {
  console.log("🟢 saveToDatabase called");
 
  // Required fields
  const billTo = document.querySelector('input[name="billTo"]')?.value.trim();
  const invoiceNo = document.querySelector('input[name="invoiceNo"]')?.value.trim();
  const date = document.querySelector('input[name="date"]')?.value;

  if (!billTo || !invoiceNo || !date) {
    alert("Please fill out required fields: Bill To, Invoice No, and Date.");
    return;
  }

  calculateTotals(); // update totals before saving

  // ✅ Gather extra column keys dynamically from header
  const allThs = document.querySelectorAll("#items-table thead th");
  const extraColumns = Array.from(allThs)
    .slice(4) // skip Description, Qty, Rate, Amount
    .map(th => th.textContent.trim().toLowerCase().replace(/\s+/g, "_"));

  // ✅ Gather items row-by-row
  const items = Array.from(document.querySelectorAll('#items-body tr')).map(row => {
    const item = {
      description: row.querySelector('input[name="desc[]"]')?.value.trim() || "",
      quantity: parseInt(row.querySelector('input[name="qty[]"]')?.value) || 0,
      unit_price: parseFloat(row.querySelector('input[name="rate[]"]')?.value) || 0,
      amount: parseFloat(row.querySelector('input[name="amt[]"]')?.value) || 0
    };

    // ✅ Include extra columns dynamically
    extraColumns.forEach(colKey => {
  const input = row.querySelector(`input[name="${colKey}[]"]`);
  item[colKey] = input?.value.trim() || '';
});

    return item;
  });

  // Payment info
  const payment = {
    cash: document.querySelector('input[name="cash"]')?.checked || false,
    check_payment: document.querySelector('input[name="check"]')?.checked || false,
    check_no: document.querySelector('input[name="checkNo"]')?.value.trim() || null,
    bank: document.querySelector('input[name="bank"]')?.value.trim() || null,
    vatable_sales: parseFloat(document.querySelector('input[name="vatableSales"]')?.value) || 0,
    total_sales: parseFloat(document.querySelector('input[name="totalSales"]')?.value) || 0,
    vat_exempt: parseFloat(document.querySelector('input[name="vatExempt"]')?.value) || 0,
    less_vat: parseFloat(document.querySelector('input[name="lessVat"]')?.value) || 0,
    zero_rated: parseFloat(document.querySelector('input[name="zeroRated"]')?.value) || 0,
    net_vat: parseFloat(document.querySelector('input[name="netVat"]')?.value) || 0,
    vat_amount: parseFloat(document.querySelector('input[name="vatAmount"]')?.value) || 0,
    withholding: parseFloat(document.querySelector('input[name="withholding"]')?.value) || 0,
    total: parseFloat(document.querySelector('input[name="total"]')?.value) || 0,
    due: parseFloat(document.querySelector('input[name="due"]')?.value) || 0,
    pay_date: document.querySelector('input[name="payDate"]')?.value || null,
    payable: parseFloat(document.querySelector('input[name="payable"]')?.value) || 0
  };

  // Build invoice object
  const invoiceData = {
    invoice_no: invoiceNo,
    bill_to: billTo,
    address1: document.querySelector('input[name="address1"]')?.value.trim() || "",
    address2: document.querySelector('input[name="address2"]')?.value.trim() || "",
    tin: document.querySelector('input[name="tin"]')?.value.trim() || "",
    terms: document.querySelector('input[name="terms"]')?.value.trim() || "",
    date,
    total_amount_due: payment.payable || 0,
    items,
    payment
  };

  // Backup in localStorage
  localStorage.setItem('invoiceData', JSON.stringify(invoiceData));
  console.log("📦 Prepared invoice data:", invoiceData);

  // Send to backend
  try {
    const response = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    });

    const result = await response.json();

    if (response.ok) {
      console.log("✅ Saved to MySQL:", result);
      alert("Invoice saved successfully!");
      window.location.href = `/Replica.html?invoice_no=${invoiceData.invoice_no}`;
    } else {
      console.error("❌ Server error:", result);
      alert(`Error saving invoice: ${result.error || 'Unknown server error'}`);
    }
  } catch (err) {
    console.error("❌ Failed to save invoice:", err);
    alert("Error saving invoice. Check console.");
  }
}

/* -------------------------- 2. ROW FUNCTIONS -------------------------- */
function addRow() {
  const tbody = document.getElementById('items-body');
  const headerCols = document.querySelectorAll("#items-table thead th");
  const newRow = document.createElement('tr');

  newRow.innerHTML = `
    <td><input type="text" class="input-full" name="desc[]"></td>
    <td><input type="number" class="input-short" name="qty[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="rate[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="amt[]" readonly></td>
  `;

  // ✅ Add input fields for extra columns with proper name=""
  for (let i = 4; i < headerCols.length; i++) {
    const colName = headerCols[i].textContent.trim().toLowerCase().replace(/\s+/g, "_");
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" name="${colName}[]">`;
    newRow.appendChild(td);
  }

  tbody.appendChild(newRow);
  adjustColumnWidths();
}

function removeRow() {
  const tbody = document.getElementById('items-body');
  if (tbody.rows.length <= 1) return alert("At least one row must remain.");

  const index = parseInt(prompt(`Enter row number to remove (1-${tbody.rows.length}):`));
  if (isNaN(index) || index < 1 || index > tbody.rows.length) return alert("Invalid row number.");

  tbody.deleteRow(index - 1);
  calculateTotals();
  adjustColumnWidths();
}

/* ------------------------ 3. COLUMN FUNCTIONS ------------------------ */
function addColumn() {
  const name = prompt("Enter new column name:");
  if (!name) return;

  const theadRow = document.querySelector("#items-table thead tr");
  const newTh = document.createElement("th");
  newTh.textContent = name;
  theadRow.appendChild(newTh);

  // ✅ Keep correct input name for dynamic column
  const colKey = name.toLowerCase().replace(/\s+/g, "_");
  document.querySelectorAll("#items-table tbody tr").forEach(row => {
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" name="${colKey}[]">`;
    row.appendChild(td);
  });

  adjustColumnWidths();
}

function removeColumn() {
  const name = prompt("Enter exact column name to remove:");
  if (!name) return;

  const theadRow = document.querySelector("#items-table thead tr");
  const ths = Array.from(theadRow.querySelectorAll("th"));
  const index = ths.findIndex(th => th.textContent.trim().toLowerCase() === name.trim().toLowerCase());

  if (index < 4) return alert("Default columns cannot be removed.");
  if (index === -1) return alert(`Column "${name}" not found.`);

  ths[index].remove();
  document.querySelectorAll("#items-table tbody tr").forEach(row => {
    row.querySelectorAll("td")[index]?.remove();
  });

  adjustColumnWidths();
}

/* ------------------------ 4. CALCULATIONS ------------------------ */
function updateAmount(el) {
  const row = el.closest('tr');
  const qty = parseFloat(row.querySelector('input[name="qty[]"]')?.value) || 0;
  const rate = parseFloat(row.querySelector('input[name="rate[]"]')?.value) || 0;
  row.querySelector('input[name="amt[]"]').value = (qty * rate).toFixed(2);
  calculateTotals();
}

function calculateTotals() {
  let totalSales = 0;
  document.querySelectorAll('input[name="amt[]"]').forEach(input => totalSales += parseFloat(input.value) || 0);

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

/* ---------------------- 5. UI ADJUSTMENTS ---------------------- */
function adjustColumnWidths() {
  const table = document.getElementById('items-table');
  const ths = table.querySelectorAll('thead th');
  if (!ths.length) return;

  const colWidth = 100 / ths.length + "%";
  ths.forEach(th => th.style.width = colWidth);
  table.querySelectorAll('tbody tr').forEach(row => {
    row.querySelectorAll('td').forEach(td => td.style.width = colWidth);
  });
}

/* ---------------------- 6. LOGO UPLOAD ---------------------- */
function previewLogo(event) {
  const img = document.getElementById('uploaded-logo');
  const btn = document.getElementById('remove-logo-btn');
  if (event.target.files?.[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      img.src = e.target.result;
      img.style.display = 'block';
      btn.style.display = 'inline-block';
    };
    reader.readAsDataURL(event.target.files[0]);
  }
}

function removeLogo() {
  const img = document.getElementById('uploaded-logo');
  const btn = document.getElementById('remove-logo-btn');
  const input = document.getElementById('logo-upload');
  img.src = '';
  img.style.display = 'none';
  btn.style.display = 'none';
  input.value = '';
}
