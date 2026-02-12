console.log("✅ Dashboard.js loaded");

// ===================== Fetch Dashboard Data =====================
async function fetchDashboardData() {
  try {
    const res = await fetch('/api/dashboard', { credentials: 'include' });
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

// ===================== Animate number =====================
function animateNumber(elementId, targetValue, isCurrency = false) {
  const el = document.getElementById(elementId);
  if (!el) return;

  let current = 0;
  const steps = 80;
  const increment = targetValue / steps;
  const duration = 1200;
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

// ===================== Recurring Modal for Create Invoice =====================
function initRecurringModal() {
  const modal = document.getElementById('recurringModal');
  const standardBtn = document.getElementById('standardBtn');
  const recurringBtn = document.getElementById('recurringBtn');
  const closeModal = document.getElementById('closeModal');

  if (!modal || !standardBtn || !recurringBtn || !closeModal) return;

  // These links live inside injected navbar, so bind AFTER navbarReady
  document.querySelectorAll('#invoiceDropdown .dropdown-item').forEach(link => {
    link.addEventListener('click', function (e) {
      const type = new URL(link.href, location.origin).searchParams.get('type');
      if (!['service', 'sales', 'commercial'].includes(type)) return;

      e.preventDefault();
      modal.classList.add('show');
      modal.dataset.href = link.href;
    });
  });

  standardBtn.addEventListener('click', () => {
    window.location.href = modal.dataset.href + '&invoiceMode=standard';
  });

  recurringBtn.addEventListener('click', () => {
    window.location.href = modal.dataset.href + '&invoiceMode=recurring';
  });

  closeModal.addEventListener('click', () => modal.classList.remove('show'));

  window.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('show');
  });
}

// ===================== Init =====================
function runDashboard() {
  fetchDashboardData();
  initRecurringModal();
}

if (window.navbarReady && typeof window.navbarReady.then === 'function') {
  window.navbarReady.then(runDashboard);
} else {
  console.warn('navbarReady not found. Running dashboard without waiting.');
  runDashboard();
  setTimeout(initRecurringModal, 300);
}
