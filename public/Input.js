function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function loadInputVAT() {
  const from = document.getElementById('from-date').value;
  const to = document.getElementById('to-date').value;

  try {
    const res = await fetch(`/api/reports/input-vat?from=${from}&to=${to}`);
    const data = await res.json();

    const tbody = document.getElementById('input-vat-table');
    tbody.innerHTML = '';

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center">No records found</td></tr>`;
      document.getElementById('total-input-vat').textContent = money(0);
      return;
    }

    let totalVAT = 0;
    data.forEach(r => {
      totalVAT += Number(r.vat_amount || 0);
      tbody.innerHTML += `
        <tr>
          <td>${r.invoice_date}</td>
          <td>${r.invoice_no}</td>
          <td>${r.supplier}</td>
          <td>${r.tin || ''}</td>
          <td>${money(r.net_amount)}</td>
          <td>${money(r.vat_amount)}</td>
          <td>${money(r.gross_amount)}</td>
        </tr>
      `;
    });

    document.getElementById('total-input-vat').textContent = money(totalVAT);
  } catch (err) {
    console.error('Load Input VAT error:', err);
    alert('Failed to load Input VAT');
  }
}

function exportInputExcel() {
  const from = document.getElementById('from-date').value;
  const to = document.getElementById('to-date').value;
  window.location.href = `/api/reports/input-vat/excel?from=${from}&to=${to}`;
}

function exitApp() {
  window.location.href = "Dashboard.html";
}
