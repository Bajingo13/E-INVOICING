console.log("✅ EINVOICING.js is loaded");

function saveToLocalStorage() {
  console.log("🟢 saveToLocalStorage called");

  // Basic field validation
  const billTo = document.querySelector('input[name="billTo"]').value;
  const invoiceNo = document.querySelector('input[name="invoiceNo"]').value;
  const date = document.querySelector('input[name="date"]').value;

  if (!billTo || !invoiceNo || !date) {
    alert("Please fill out required fields: Bill To, Invoice No, and Date.");
    return;
  }

  calculateTotals(); // Ensure totals are up to date before saving

  const data = {
    invoiceNo,
    billTo,
    date,
    address: document.querySelector('input[name="address"]')?.value || "",
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
    bank: document.querySelector('input[name="bank"]')?.value || ""
  };

  localStorage.setItem('invoiceData', JSON.stringify(data));
  console.log("✅ Saved invoiceData:", data);

  window.location.href = "../PRINTABLE/Replica.html";
}

function addRow() {
  const tbody = document.getElementById('items-body');
  const row = document.createElement('tr');

  row.innerHTML = `
    <td><input type="text" class="input-full" name="desc[]"></td>
    <td><input type="number" class="input-short" name="qty[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="rate[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="amt[]" readonly></td>
    <td><button type="button" onclick="deleteRow(this)">🗑️</button></td>
  `;

  tbody.appendChild(row);
}

function updateAmount(el) {
  const row = el.closest('tr');
  const qty = parseFloat(row.querySelector('input[name="qty[]"]').value) || 0;
  const rate = parseFloat(row.querySelector('input[name="rate[]"]').value) || 0;
  const amtField = row.querySelector('input[name="amt[]"]');
  amtField.value = (qty * rate).toFixed(2);

  calculateTotals(); // auto-update totals after each row input
}

function deleteRow(button) {
  const tbody = document.getElementById('items-body');
  const row = button.closest('tr');

  if (tbody.rows.length > 1) {
    tbody.removeChild(row);
    calculateTotals(); // recalculate after row deletion
  } else {
    alert("At least one row must remain.");
  }
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
