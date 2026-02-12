// /js/navbar.js
'use strict';

console.log('✅ navbar.js loaded');

window.initNavbar = async function initNavbar() {
  // prevent double init if layout injects twice
  if (window.__NAVBAR_INITIALIZED__) return;
  window.__NAVBAR_INITIALIZED__ = true;

  // ---------- Session ----------
  let user = null;
  try {
    const res = await fetch('/auth/me', { credentials: 'include' });
    if (!res.ok) {
      window.location.href = '/';
      return;
    }
    const data = await res.json();
    user = data?.user || null;
  } catch (err) {
    console.error('❌ /auth/me failed:', err);
    window.location.href = '/';
    return;
  }

  // ✅ Normalize permissions (accept BOTH: ['invoice_create'] OR ['INVOICE_CREATE'])
  const rawPerms = Array.isArray(user?.permissions) ? user.permissions : [];
  const permsLower = rawPerms.map(p => String(p || '').toLowerCase());
  const has = (...ps) => ps.some(p => permsLower.includes(String(p).toLowerCase()));

  // ---------- Profile initials ----------
  const initialsEl = document.getElementById('profileInitials');
  if (initialsEl) {
    const name = user?.name || user?.username || user?.email || '';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);

    let initials = 'AB';
    if (parts.length >= 2) initials = (parts[0][0] + parts[1][0]).toUpperCase();
    else if (parts.length === 1) initials = parts[0].slice(0, 2).toUpperCase();

    initialsEl.textContent = initials;
  }

  // ---------- Logout ----------
  const logoutBtn = document.querySelector('.logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
      } catch {}
      window.location.href = '/';
    });
  }

  // =========================================================
  // ✅ PERMISSION-BASED NAV VISIBILITY (HIDE ONLY — DO NOT REMOVE)
  // =========================================================

  // --- Buttons ---
  const accountingBtn = document.getElementById('accountingBtn');
  const reportsBtn = document.getElementById('reportsBtn');
  const systemBtn = document.getElementById('SystemconfigBtn');
  const createInvoiceBtn = document.getElementById('createInvoiceBtn');

  // --- Menus ---
  const accountingMenu = document.getElementById('accountingDropdown');
  const reportsMenu = document.getElementById('reportsDropdown');
  const systemMenu = document.getElementById('systemConfigDropdown');
  const invoiceMenu = document.getElementById('invoiceDropdown'); // (kept for future)

  // Helper: hide link by href contains (case-insensitive)
  function hideLinkByHref(menuEl, hrefContains) {
    if (!menuEl) return;
    const items = Array.from(menuEl.querySelectorAll('a.dropdown-item'));
    const target = items.find(a => (a.getAttribute('href') || '').toLowerCase().includes(hrefContains.toLowerCase()));
    if (target) target.style.display = 'none';
  }

  // Helper: hide dropdown button if ALL dropdown items (and submenu toggles) are hidden
  function hideButtonIfMenuEmpty(btnEl, menuEl) {
    if (!btnEl || !menuEl) return;

    const visibleAnchors = Array.from(menuEl.querySelectorAll('a.dropdown-item'))
      .filter(a => a.style.display !== 'none');

    const visibleSubToggles = Array.from(menuEl.querySelectorAll('.submenu-toggle'))
      .filter(t => t.style.display !== 'none');

    if (visibleAnchors.length === 0 && visibleSubToggles.length === 0) {
      btnEl.style.display = 'none';
    }
  }
  
// -------------------------
// Hide Invoice List on Dashboard only
// -------------------------
const path = (window.location.pathname || '').toLowerCase();

// adjust if your dashboard route is different
const isDashboard =
  path === '/dashboard' ||
  path === '/dashboard/' ||
  path.endsWith('/dashboard.html');

const invoiceListBtn =
  document.getElementById('invoiceListBtn') ||
  document.querySelector('nav.nav a[href*="invoice-list"]');

if (isDashboard && invoiceListBtn) {
  invoiceListBtn.style.display = 'none';
}

  // -------------------------
  // Accounting dropdown
  // -------------------------
  // Chart of Accounts
  if (!has('coa_view', 'COA_VIEW')) hideLinkByHref(accountingMenu, 'coa');

  // Contacts
  if (!has('contact_view', 'CONTACT_VIEW')) hideLinkByHref(accountingMenu, 'contacts');

  // Hide Accounting button if empty
  hideButtonIfMenuEmpty(accountingBtn, accountingMenu);

  // -------------------------
  // Create Invoice dropdown
  // -------------------------
  // Create invoice requires invoice_create
  if (!has('invoice_create', 'INVOICE_CREATE')) {
    if (createInvoiceBtn) createInvoiceBtn.style.display = 'none';
  }

  // -------------------------
  // Reports dropdown
  // -------------------------
  // Reports require report_generate OR report_export
  if (!has('report_generate', 'REPORT_GENERATE', 'report_export', 'REPORT_EXPORT')) {
    if (reportsBtn) reportsBtn.style.display = 'none';
  } else {
    // If you want to hide specific report links later, do it here (optional)
    // Example:
    // if (!has('report_export','REPORT_EXPORT')) hideLinkByHref(reportsMenu, 'export');
  }

  // -------------------------
  // System Configuration dropdown
  // -------------------------
  // Company Info
  if (!has('settings_access', 'SETTINGS_ACCESS')) hideLinkByHref(systemMenu, 'company_info');

  // Transaction Locking
  if (!has('lock_period', 'LOCK_PERIOD', 'settings_access', 'SETTINGS_ACCESS')) hideLinkByHref(systemMenu, 'translock');

  // Invoice Settings
  if (!has('invoice_settings', 'INVOICE_SETTINGS')) hideLinkByHref(systemMenu, 'invoicesettings');

  // EWT Library
  if (!has('settings_access', 'SETTINGS_ACCESS')) hideLinkByHref(systemMenu, 'ewtlib');

  // Hide System Config button if empty
  hideButtonIfMenuEmpty(systemBtn, systemMenu);

  // =========================================================
  // DROPDOWNS (single outside click listener, no duplicates)
  // =========================================================
  function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.dropdown-menu.submenu.show').forEach(m => m.classList.remove('show'));
  }

  function setupDropdown(buttonId, menuId, opts = {}) {
    const btn = document.getElementById(buttonId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    const align = opts.align || 'left';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();

      // ignore if hidden
      const style = window.getComputedStyle(btn);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const isOpen = menu.classList.contains('show');
      closeAllDropdowns();
      if (isOpen) return;

      menu.classList.add('show');

      // refresh notifications when opened
      if (menuId === 'notifDropdown') loadNotifications();

      // alignment
      menu.style.left = '';
      menu.style.right = '';
      menu.style.maxWidth = '';

      if (align === 'right') {
        menu.style.right = '0';
        menu.style.left = 'auto';
      } else {
        menu.style.left = '0';
        menu.style.right = 'auto';
      }

      // overflow flip
      const r = menu.getBoundingClientRect();
      const overflowRight = r.right > window.innerWidth;
      const overflowLeft = r.left < 0;

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
  }

  // Bind dropdowns
  setupDropdown('accountingBtn', 'accountingDropdown', { align: 'left' });
  setupDropdown('createInvoiceBtn', 'invoiceDropdown', { align: 'left' });
  setupDropdown('reportsBtn', 'reportsDropdown', { align: 'left' });
  setupDropdown('SystemconfigBtn', 'systemConfigDropdown', { align: 'left' });
  setupDropdown('profileBtn', 'profileDropdown', { align: 'right' });
  setupDropdown('notifBtn', 'notifDropdown', { align: 'right' });

  // ONE global close handler
  document.addEventListener('click', closeAllDropdowns);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllDropdowns();
  });

  // VAT submenu toggle
  document.querySelectorAll('.submenu-toggle').forEach(toggle => {
    toggle.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const submenu = toggle.nextElementSibling; // matches your HTML
      if (submenu) submenu.classList.toggle('show');
    });
  });

  // =========================================================
  // NOTIFICATIONS
  // =========================================================
  async function loadNotifications() {
    const badge = document.getElementById('notifBadge');
    const list = document.getElementById('notifList');
    if (!badge || !list) return;

    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load notifications');

      const notifications = await res.json();

      const unread = (notifications || []).filter(n => !n.is_read).length;
      badge.textContent = unread;
      badge.style.display = unread ? 'inline-block' : 'none';

      list.innerHTML = '';

      if (!notifications?.length) {
        list.innerHTML = `
          <div class="notif-empty">
            <h3>You're all caught up!</h3>
            <p>You have no new notifications</p>
            <div class="notif-empty-illustration"></div>
          </div>
        `;
        return;
      }

      notifications.forEach(n => {
        const item = document.createElement('div');
        item.className = `notif-item ${n.is_read ? 'read' : 'unread'}`;

        // Safer MySQL datetime parsing
        let d = n.created_at;
        if (typeof d === 'string' && d.includes(' ') && !d.includes('T')) {
          d = d.replace(' ', 'T') + 'Z';
        }

        item.innerHTML = `
          <p>${n.message}</p>
          <span>${new Date(d).toLocaleString('en-PH')}</span>
        `;

        item.addEventListener('click', () => {
          fetch(`/api/notifications/${n.id}/read`, {
            method: 'POST',
            credentials: 'include'
          }).catch(() => {});

          if (n.reference_no) {
            window.location.href = `/invoice-list.html?search=${encodeURIComponent(n.reference_no)}`;
            return;
          }
          window.location.href = '/invoice-list.html';
        });

        list.appendChild(item);
      });

    } catch (err) {
      console.error('❌ Notifications error:', err);
    }
  }

  // Load badge once
  loadNotifications();
};
