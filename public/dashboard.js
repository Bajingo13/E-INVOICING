// ✅ Dashboard.js loaded
console.log("✅ Dashboard.js loaded");

// ==============================
// Fetch Dashboard Data from API
// ==============================
async function fetchDashboardData() {
  try {
    // Fetch data from backend API
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error("Failed to fetch dashboard data");

    // Parse JSON response
    const data = await res.json();
    console.log("📊 Dashboard data:", data);

    // Animate dashboard numbers
    animateNumber('totalInvoices', data.totalInvoices || 0);
    animateNumber('totalPayments', data.totalPayments || 0, true);
    animateNumber('pendingInvoices', data.pendingInvoices || 0);

  } catch (err) {
    // Log errors for debugging
    console.error("❌ Error loading dashboard data:", err);
  }
}

/**
 * Animates a number counting up in a DOM element
 * @param {string} elementId - ID of the element to update
 * @param {number} targetValue - Final number to display
 * @param {boolean} isCurrency - Format as PHP currency if true
 */
function animateNumber(elementId, targetValue, isCurrency = false) {
  const el = document.getElementById(elementId);
  if (!el) return; // Exit if element not found

  let current = 0;
  const increment = targetValue / 100; // Number of animation steps (100 frames)
  const duration = 2000; // Animation duration in ms (2 seconds)
  const intervalTime = duration / 100; // Time per frame

  // Interval for animation
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

    // Update element text during animation
    el.textContent = isCurrency
      ? `₱${Number(current).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : Math.floor(current).toLocaleString();
  }, intervalTime);
}

// ==============================
// Initialize Dashboard on Page Load
// ==============================
window.addEventListener('DOMContentLoaded', fetchDashboardData);

// ==============================
// Invoice Dropdown Menu Handling
// ==============================
document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('createInvoiceBtn');
  const menu = document.getElementById('invoiceDropdown');

  // Toggle dropdown menu on button click
  btn.addEventListener('click', function(e) {
    e.stopPropagation(); // Prevent event bubbling
    menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function() {
    menu.style.display = 'none';
  });

  // Prevent closing when clicking inside dropdown
  menu.addEventListener('click', function(e) {
    e.stopPropagation();
  });
});