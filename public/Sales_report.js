function money(n) {
  return Number(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function loadSales() {
  const from = document.getElementById('from-date').value;
  const to = document.getElementById('to-date').value;
  const customer = document.getElementById('customer-filter').value;

  try {
    const res = await fetch(`/api/reports/sales?from=${from}&to=${to}&customer=${customer}`);
    if (!res.ok) throw new Error('Failed to fetch sales');
    const data = await res.json();

    const tbody = document.getElementById('sales-table');
    tbody.innerHTML = '';

    let totalNet = 0, totalVat = 0, totalGross = 0;

    data.forEach(r => {
      totalNet += Number(r.net_amount);
      totalVat += Number(r.vat_amount);
      totalGross += Number(r.gross_amount);

      tbody.innerHTML += `
        <tr>
          <td>${r.invoice_date}</td>
          <td>${r.invoice_no}</td>
          <td>${r.customer}</td>
          <td>${r.tin || ''}</td>
          <td>${money(r.net_amount)}</td>
          <td>${money(r.vat_amount)}</td>
          <td>${money(r.gross_amount)}</td>
        </tr>
      `;
    });

    document.getElementById('total-sales').textContent = money(totalNet);
    document.getElementById('total-vat').textContent = money(totalVat);
    document.getElementById('total-gross').textContent = money(totalGross);
  } catch (err) {
    console.error('❌ Load sales error:', err);
  }
}

function exportSales() {
  const from = document.getElementById('from-date').value;
  const to = document.getElementById('to-date').value;
  const customer = document.getElementById('customer-filter').value;

  window.location.href = `/api/reports/sales/excel?from=${from}&to=${to}&customer=${customer}`;
}

// Optional: load on page load
window.addEventListener('DOMContentLoaded', loadSales);
