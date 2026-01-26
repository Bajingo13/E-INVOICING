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

    // Unread count + badge
    const unread = notifications.filter(n => !n.is_read).length;
    badge.textContent = unread;
    badge.style.display = unread ? 'inline' : 'none';

    list.innerHTML = '';

    // YOUR ORIGINAL EMPTY STATE (from snippet #1)
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
      item.innerHTML = `
        <p>${n.message}</p>
        <span>${new Date(n.created_at).toLocaleString()}</span>
      `;

      item.addEventListener('click', async () => {
        await fetch(`/api/notifications/${n.id}/read`, {
          method: 'POST',
          credentials: 'include'
        });
        loadNotifications();
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

// ===================== DOM Ready =====================
window.addEventListener('DOMContentLoaded', () => {
  fetchDashboardData();
  loadNotifications();
  applyRBAC();

  // ---------------- Dropdown Function ----------------
  function setupDropdown(buttonId, menuId) {
    const btn = document.getElementById(buttonId);
    const menu = document.getElementById(menuId);

    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();

      // CLOSE OTHER DROPDOWNS
      document.querySelectorAll('.dropdown-menu.show').forEach(openMenu => {
        if (openMenu !== menu) openMenu.classList.remove('show');
      });

      menu.classList.toggle('show');

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

  setupDropdown('accountingBtn', 'accountingDropdown');
  setupDropdown('createInvoiceBtn', 'invoiceDropdown');
  setupDropdown('SystemconfigBtn', 'systemConfigDropdown');
  setupDropdown('profileBtn', 'profileDropdown');
  setupDropdown('reportsBtn', 'reportsDropdown');
  setupDropdown('notifBtn', 'notifDropdown');


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

// ===================== Submenu toggle =====================
document.querySelectorAll('.submenu-toggle').forEach(toggle => {
  toggle.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggle.nextElementSibling.classList.toggle('show');
  });
});
