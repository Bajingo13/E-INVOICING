// ===================== Dashboard.js =====================

console.log("✅ Dashboard.js loaded");

// ===================== Fetch Dashboard Data =====================
async function fetchDashboardData() {
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error("Failed to fetch dashboard data");

    const data = await res.json();
    console.log("📊 Dashboard data:", data);

    animateNumber('totalInvoices', data.totalInvoices || 0);
    animateNumber('totalPayments', data.totalPayments || 0, true);
    animateNumber('pendingInvoices', data.pendingInvoices || 0);

  } catch (err) {
    console.error("❌ Error loading dashboard data:", err);
  }
}

/**
 * Animate number counting up
 * @param {string} elementId
 * @param {number} targetValue
 * @param {boolean} isCurrency
 */
function animateNumber(elementId, targetValue, isCurrency = false) {
  const el = document.getElementById(elementId);
  if (!el) return;

  let current = 0;
  const steps = 100;
  const increment = targetValue / steps;
  const duration = 2000;
  const intervalTime = duration / steps;

  const interval = setInterval(() => {
    current += increment;
    if (current >= targetValue) {
      clearInterval(interval);
      current = targetValue;
    }

    el.textContent = isCurrency
      ? `₱${Number(current).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : Math.floor(current).toLocaleString();
  }, intervalTime);
}

// ===================== DOM Ready =====================
window.addEventListener('DOMContentLoaded', () => {
  // Fetch dashboard data
  fetchDashboardData();

  // ---------------- Dropdown Menu ----------------
  const btn = document.getElementById('createInvoiceBtn');
  const menu = document.getElementById('invoiceDropdown');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
  });

  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });

  menu?.addEventListener('click', e => e.stopPropagation());

  // ---------------- Modal ----------------
  const modal = document.getElementById('recurringModal');
  const standardBtn = document.getElementById('standardBtn');
  const recurringBtn = document.getElementById('recurringBtn');
  const closeModal = document.getElementById('closeModal');

  if (modal && standardBtn && recurringBtn && closeModal) {
    document.querySelectorAll('#invoiceDropdown .dropdown-item').forEach(link => {
      link.addEventListener('click', function(e) {
        const type = new URL(link.href, location.origin).searchParams.get('type');
        // Exclude Credit and Debit Memo
        if (type === 'credit' || type === 'debit') return;
        e.preventDefault();

        // Show modal
        modal.style.display = 'flex';

        // Save href for later use
        modal.dataset.href = link.href;
      });
    });

    standardBtn.addEventListener('click', () => {
      window.location.href = modal.dataset.href + '&invoiceMode=standard';
    });

    recurringBtn.addEventListener('click', () => {
      window.location.href = modal.dataset.href + '&invoiceMode=recurring';
    });

    closeModal.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // Close modal if clicking outside content
    window.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }
});
