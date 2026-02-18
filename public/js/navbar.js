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

  // Invoice list is sometimes a link, sometimes a button
  const invoiceListBtn =
    document.getElementById('invoiceListBtn') ||
    document.querySelector('.nav a[href*="invoice-list"]');

  // --- Menus ---
  const accountingMenu = document.getElementById('accountingDropdown');
  const reportsMenu = document.getElementById('reportsDropdown');
  const systemMenu = document.getElementById('systemConfigDropdown');
  const invoiceMenu = document.getElementById('invoiceDropdown');

  // Helper: hide link by href contains (case-insensitive)
  function hideLinkByHref(menuEl, hrefContains) {
    if (!menuEl) return;
    const items = Array.from(menuEl.querySelectorAll('a.dropdown-item'));
    const target = items.find(a =>
      (a.getAttribute('href') || '').toLowerCase().includes(hrefContains.toLowerCase())
    );
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

  const isDashboard =
    path === '/dashboard' ||
    path === '/dashboard/' ||
    path.endsWith('/dashboard.html');

  if (isDashboard && invoiceListBtn) {
    invoiceListBtn.style.display = 'none';
  }

  // -------------------------
  // Accounting dropdown
  // -------------------------
  if (!has('coa_view', 'COA_VIEW')) hideLinkByHref(accountingMenu, 'coa');
  if (!has('contact_view', 'CONTACT_VIEW')) hideLinkByHref(accountingMenu, 'contacts');
  hideButtonIfMenuEmpty(accountingBtn, accountingMenu);

  // -------------------------
  // Create Invoice dropdown (permission)
  // -------------------------
  if (!has('invoice_create', 'INVOICE_CREATE')) {
    if (createInvoiceBtn) createInvoiceBtn.style.display = 'none';
  }

  // -------------------------
  // Reports dropdown
  // -------------------------
  if (!has('report_generate', 'REPORT_GENERATE', 'report_export', 'REPORT_EXPORT')) {
    if (reportsBtn) reportsBtn.style.display = 'none';
  }

  // -------------------------
  // System Configuration dropdown
  // -------------------------
  if (!has('settings_access', 'SETTINGS_ACCESS')) hideLinkByHref(systemMenu, 'company_info');
  if (!has('lock_period', 'LOCK_PERIOD', 'settings_access', 'SETTINGS_ACCESS')) hideLinkByHref(systemMenu, 'translock');
  if (!has('invoice_settings', 'INVOICE_SETTINGS')) hideLinkByHref(systemMenu, 'invoicesettings');
  if (!has('settings_access', 'SETTINGS_ACCESS')) hideLinkByHref(systemMenu, 'ewtlib');
  hideButtonIfMenuEmpty(systemBtn, systemMenu);

  // =========================================================
  // ✅ Active-page nav behavior (hover-look + disabled) for ALL
  // =========================================================
  function setNavDisabled(el, menuEl, disabled) {
    if (!el) return;

    // ensure consistent styling (links too)
    el.classList.add('btn');

    if (disabled) {
      el.classList.add('active', 'is-disabled');
      el.setAttribute('aria-current', 'page');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('tabindex', '-1');

      // if it is a link, neutralize navigation
      if (el.tagName === 'A') {
        el.dataset.href = el.getAttribute('href') || '';
        el.setAttribute('href', '#');
      }

      if (menuEl) menuEl.classList.remove('show');
    } else {
      el.classList.remove('is-disabled');
      el.removeAttribute('aria-disabled');
      el.removeAttribute('tabindex');

      if (el.tagName === 'A' && el.dataset.href) {
        el.setAttribute('href', el.dataset.href);
        delete el.dataset.href;
      }
    }
  }

  // Hard block for ANY disabled nav element (button OR link)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.nav .is-disabled');
    if (!el) return;

    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ---- Page detection ----
  const p = (window.location.pathname || '').toLowerCase();

  const isInvoiceListPage =
    p.includes('/invoice-list') || p.endsWith('/invoice-list.html');

  // STRICT invoice page matching (exclude invoice-list)
  const isInvoicePage =
    (p === '/invoice' || p === '/invoice/' || p.endsWith('/invoice.html') || p.startsWith('/invoice/'))
    && !isInvoiceListPage;

  const isAccountingPage = p.includes('coa') || p.includes('contacts');
  const isReportsPage = p.includes('reports');
  const isSystemConfigPage =
    p.includes('company_info') ||
    p.includes('translock') ||
    p.includes('invoicesettings') ||
    p.includes('ewtlib');

  // Determine edit vs create by invoice_no in URL (query OR /invoice/:invoiceNo)
  function getInvoiceNoFromUrl() {
    const qs = new URLSearchParams(window.location.search || '');

    // query-based
    const q =
      (qs.get('invoice_no') || qs.get('invoiceNo') || qs.get('no') || '').trim();
    if (q) return q;

    // path-based: /invoice/INV-1001
    const parts = (window.location.pathname || '').split('/').filter(Boolean);
    const idx = parts.findIndex(x => x.toLowerCase() === 'invoice');
    if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);

    return '';
  }

  const invoiceNoInUrl = getInvoiceNoFromUrl();
  const isEditInvoicePage = isInvoicePage && !!invoiceNoInUrl;
  const isCreateInvoicePage = isInvoicePage && !isEditInvoicePage;

  // Apply states
  setNavDisabled(createInvoiceBtn, invoiceMenu, isCreateInvoicePage || isEditInvoicePage);
  setNavDisabled(invoiceListBtn, null, isInvoiceListPage);
  setNavDisabled(accountingBtn, accountingMenu, isAccountingPage);
  setNavDisabled(reportsBtn, reportsMenu, isReportsPage);
  setNavDisabled(systemBtn, systemMenu, isSystemConfigPage);

  // =========================================================
  // ✅ BREADCRUMB (works with your markup)
  // <nav id="breadcrumbWrap" class="breadcrumb" style="display:none;">
  //   <span id="breadcrumb"></span>
  // </nav>
  // =========================================================
  function esc(s){
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function setBreadcrumb(items){
    const wrap = document.getElementById('breadcrumbWrap');
    const span = document.getElementById('breadcrumb');
    if (!wrap || !span) return;

    // Show only if we set something meaningful
    wrap.style.display = items && items.length ? '' : 'none';

    const html = (items || []).map((it, i) => {
      const isLast = i === items.length - 1;
      const label = esc(it.label);
      const href = it.href ? String(it.href) : '';

      if (!href || isLast) {
        return `<span class="bc-item bc-current" aria-current="page">${label}</span>`;
      }
      return `<a class="bc-item" href="${href}">${label}</a>`;
    }).join(` <span class="bc-sep">/</span> `);

    span.innerHTML = html;
  }

  function updateBreadcrumb(){
    // Default: hide
    setBreadcrumb([]);

    // If you want breadcrumbs only on invoice pages, keep this guard:
    if (!isInvoiceListPage && !isInvoicePage) return;

    const crumbs = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Invoices', href: '/invoice-list.html' }
    ];

    if (isInvoiceListPage) {
      crumbs.push({ label: 'Invoice List' });
      setBreadcrumb(crumbs);
      return;
    }

    if (isInvoicePage) {
      if (isEditInvoicePage) crumbs.push({ label: `Edit Invoice (${invoiceNoInUrl})` });
      else crumbs.push({ label: 'Create Invoice' });
      setBreadcrumb(crumbs);
      return;
    }
  }

  updateBreadcrumb();

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

      // ✅ DO NOT OPEN if disabled
      if (btn.classList.contains('is-disabled') || btn.getAttribute('aria-disabled') === 'true') {
        return;
      }

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
      const submenu = toggle.nextElementSibling;
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
