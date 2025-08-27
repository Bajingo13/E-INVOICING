window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();

    document.getElementById('totalInvoices').textContent = data.totalInvoices || 0;
    document.getElementById('totalPayments').textContent = data.totalPayments || 0;
    document.getElementById('pendingInvoices').textContent = data.pendingInvoices || 0;
  } catch (err) {
    console.error('Failed to fetch dashboard data', err);
  }
});
