console.log("✅ Dashboard.js loaded");

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
 * Animates a number counting up
 * @param {string} elementId - ID of the element to update
 * @param {number} targetValue - final number
 * @param {boolean} isCurrency - format as PHP currency
 */
function animateNumber(elementId, targetValue, isCurrency = false) {
  const el = document.getElementById(elementId);
  if (!el) return;

  let current = 0;
  const increment = targetValue / 100; // 100 frames
  const duration = 2000; // 2 seconds
  const intervalTime = duration / 100;

  const interval = setInterval(() => {
    current += increment;
    if (current >= targetValue) {
      clearInterval(interval);
      current = targetValue;
      // Final update: always format properly
      el.textContent = isCurrency
        ? `₱${Number(current).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : Math.floor(current).toLocaleString();
      return;
    }

    el.textContent = isCurrency
      ? `₱${Number(current).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : Math.floor(current).toLocaleString();
  }, intervalTime);
}

// Fetch data on page load
window.addEventListener('DOMContentLoaded', fetchDashboardData);
