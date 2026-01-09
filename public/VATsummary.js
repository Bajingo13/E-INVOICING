let currentMode = 'input'; // input | output

function formatMoney(n) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function loadInputVAT() {
  currentMode = 'input';
  document.getElementById('table-title').textContent = 'Input VAT Register';

  const from = fromDate();
  const to = toDate();

  const res = await fetch(`/api/reports/input-vat?from=${from}&to=${to}`);
  const data = await res.json();

  renderTable(data, 'supplier');
  computeSummary();
}

async function loadOutputVAT() {
  currentMode = 'output';
  document.getElementById('table-title').textContent = 'Output VAT Register';

  const from = fromDate();
  const to = toDate();

  const res = await fetch(`/api/reports/output-vat?from=${from}&to=${to}`);
  const data = await res.json();

  renderTable(data, 'customer');
  computeSummary();
}

function renderTable(rows, nameKey) {
  const tbody = document.getElementById('vat-table');
  tbody.innerHTML = '';

  rows.forEach(r => {
    tbody.innerHTML += `
      <tr>
        <td>${r.invoice_date}</td>
        <td>${r.invoice_no}</td>
        <td>${r[nameKey]}</td>
        <td>${r.tin}</td>
        <td>${formatMoney(r.net_amount)}</td>
        <td>${formatMoney(r.vat_amount)}</td>
        <td>${formatMoney(r.gross_amount)}</td>
      </tr>
    `;
  });
}

async function computeSummary() {
  const from = fromDate();
  const to = toDate();

  const res = await fetch(`/api/reports/vat-summary?from=${from}&to=${to}`);
  const data = await res.json();

  document.getElementById('input-vat').textContent = formatMoney(data.input_vat);
  document.getElementById('output-vat').textContent = formatMoney(data.output_vat);
  document.getElementById('vat-payable').textContent = formatMoney(data.vat_payable);
}

function exportExcel() {
  const from = fromDate();
  const to = toDate();

  const url =
    currentMode === 'input'
      ? `/api/reports/input-vat/excel?from=${from}&to=${to}`
      : `/api/reports/output-vat/excel?from=${from}&to=${to}`;

  window.location.href = url;
}

function fromDate() {
  return document.getElementById('from-date').value;
}

function toDate() {
  return document.getElementById('to-date').value;
}
