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

document.addEventListener('DOMContentLoaded', () => {
  const user = JSON.parse(localStorage.getItem('user'));

  // If not logged in, redirect to login
  if (!user) {
    window.location.href = '/';
    return;
  }

  // RBAC: hide elements that are for super only
  document.querySelectorAll('[data-role="super"]').forEach(el => {
    if (user.role !== 'super') {
      el.style.display = 'none';
    }
  });
});

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
  fetchDashboardData();

  // ---------------- Dropdown Function ----------------
  function setupDropdown(buttonId, menuId) {
  const btn = document.getElementById(buttonId);
  const menu = document.getElementById(menuId);

  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();

    // 🔴 CLOSE ALL OTHER DROPDOWNS
    document.querySelectorAll('.dropdown-menu.show').forEach(openMenu => {
      if (openMenu !== menu) {
        openMenu.classList.remove('show');
      }
    });

    // 🟢 TOGGLE CURRENT DROPDOWN
    menu.classList.toggle('show');

    // Reset positioning
    menu.style.left = '';
    menu.style.right = '';

    const rect = btn.getBoundingClientRect();
    const dropdownWidth = menu.offsetWidth;
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;

    menu.style.right = '36px';
    menu.style.left = 'auto';

    if (dropdownWidth > spaceRight && dropdownWidth <= spaceLeft) {
      menu.style.left = '-48px';
      menu.style.right = 'auto';
    }
  });

  menu.addEventListener('click', e => e.stopPropagation());

  document.addEventListener('click', () => {
    menu.classList.remove('show');
  });
}

// Initialize dropdowns
setupDropdown('accountingBtn', 'accountingDropdown');
setupDropdown('createInvoiceBtn', 'invoiceDropdown');
setupDropdown('SystemconfigBtn', 'systemConfigDropdown');
setupDropdown('profileBtn', 'profileDropdown');
setupDropdown('reportsBtn', 'reportsDropdown');




  // ---------------- Modal for Create Invoice ----------------
  const modal = document.getElementById('recurringModal');
  const standardBtn = document.getElementById('standardBtn');
  const recurringBtn = document.getElementById('recurringBtn');
  const closeModal = document.getElementById('closeModal');

  if (modal && standardBtn && recurringBtn && closeModal) {
    document.querySelectorAll('#invoiceDropdown .dropdown-item').forEach(link => {
      link.addEventListener('click', function(e) {
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
});
document.querySelectorAll('.submenu-toggle').forEach(toggle => {
  toggle.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggle.nextElementSibling.classList.toggle('show');
  });
});

const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
  window.location.href = "/"; // redirect to login
}

// HIDE MENU based on role
if (user.role !== "super") {
  document.querySelectorAll(".admin-only").forEach(el => el.style.display = "none");
}
