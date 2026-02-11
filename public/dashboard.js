console.log("✅ Dashboard.js loaded");

// ===================== NOTIFICATIONS =====================
let notifications = [];

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    if (!res.ok) throw new Error("Failed to load notifications");

    notifications = await res.json();

    const badge = document.getElementById('notifBadge');
    const list = document.getElementById('notifList');
    if (!badge || !list) return;

    // Unread count + badge
    const unread = notifications.filter(n => !n.is_read).length;
    badge.textContent = unread;
    badge.style.display = unread ? 'inline-block' : 'none';

    list.innerHTML = '';

    // Empty state
    if (!notifications.length) {
      list.innerHTML = `
        <div class="notif-empty">
          <h3>You're all caught up!</h3>
          <p>You have no new notifications</p>
          <div class="notif-empty-illustration"></div>
        </div>
      `;
      return;
    }

    // Render notifications
    notifications.forEach(n => {
      const item = document.createElement('div');
      item.className = `notif-item ${n.is_read ? 'read' : 'unread'}`;

      // Safer date parsing for MySQL "YYYY-MM-DD HH:MM:SS"
      let d = n.created_at;
      if (typeof d === 'string' && d.includes(' ') && !d.includes('T')) {
        d = d.replace(' ', 'T') + 'Z';
      }

      item.innerHTML = `
        <p>${n.message}</p>
        <span>${new Date(d).toLocaleString('en-PH')}</span>
      `;

      item.addEventListener('click', async () => {
  try {
    // mark as read (don’t block redirect if this fails)
    fetch(`/api/notifications/${n.id}/read`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});

    // ✅ Redirect logic based on your real fields
    if (n.reference_no) {
      // Option A: go to invoice list and auto-search/highlight the invoice number
      window.location.href = `/invoice-list.html?search=${encodeURIComponent(n.reference_no)}`;
      return;
    }

    // fallback
    window.location.href = '/invoice-list.html';
  } catch (err) {
    console.error("Notification click error:", err);
  }
});


      list.appendChild(item);
    });

  } catch (err) {
    console.error("❌ Notifications error:", err);
  }
}

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

// ===================== RBAC / USER =====================
async function getUser() {
  const res = await fetch('/auth/me', { credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user;
}

async function applyRBAC() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/';
    return;
  }

  // Hide system config for non-super
  if (user.role !== 'super') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
}

// ===================== Animate number =====================
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

// ===================== Dropdown Helper =====================
function setupDropdown(buttonId, menuId, opts = {}) {
  const btn = document.getElementById(buttonId);
  const menu = document.getElementById(menuId);
  if (!btn || !menu) return;

  const align = opts.align || 'left'; // 'left' or 'right'

  btn.addEventListener('click', (e) => {
    e.stopPropagation();

    // close other dropdowns
    document.querySelectorAll('.dropdown-menu.show').forEach(openMenu => {
      if (openMenu !== menu) openMenu.classList.remove('show');
    });

    menu.classList.toggle('show');
    if (!menu.classList.contains('show')) return;

    // refresh notif list when opened
    if (menuId === 'notifDropdown') loadNotifications();

    // Reset
    menu.style.left = '';
    menu.style.right = '';
    menu.style.maxWidth = '';

    // Default alignment
    if (align === 'right') {
      menu.style.right = '0';
      menu.style.left = 'auto';
    } else {
      menu.style.left = '0';
      menu.style.right = 'auto';
    }

    // Flip if overflow
    const menuRect = menu.getBoundingClientRect();
    const overflowRight = menuRect.right > window.innerWidth;
    const overflowLeft = menuRect.left < 0;

    if (overflowRight && !overflowLeft) {
      menu.style.right = '0';
      menu.style.left = 'auto';
    } else if (overflowLeft && !overflowRight) {
      menu.style.left = '0';
      menu.style.right = 'auto';
    } else if (overflowLeft && overflowRight) {
      menu.style.maxWidth = '92vw';
    }
  });

  menu.addEventListener('click', e => e.stopPropagation());

  document.addEventListener('click', () => {
    menu.classList.remove('show');
  });
}

// ===================== DOM Ready =====================
window.addEventListener('DOMContentLoaded', () => {
  fetchDashboardData();
  loadNotifications();
  applyRBAC();

  setupDropdown('accountingBtn', 'accountingDropdown', { align: 'left' });
  setupDropdown('createInvoiceBtn', 'invoiceDropdown', { align: 'left' });
  setupDropdown('SystemconfigBtn', 'systemConfigDropdown', { align: 'left' });
  setupDropdown('reportsBtn', 'reportsDropdown', { align: 'left' });

  // profile + notifications align right
  setupDropdown('profileBtn', 'profileDropdown', { align: 'right' });
  setupDropdown('notifBtn', 'notifDropdown', { align: 'right' });

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

  // ===================== Submenu toggle =====================
  document.querySelectorAll('.submenu-toggle').forEach(toggle => {
    toggle.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggle.nextElementSibling.classList.toggle('show');
    });
  });
});
