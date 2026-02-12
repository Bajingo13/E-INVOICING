// /js/layout.js
'use strict';

// ✅ simple html escape
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ✅ apply title/subtitle/breadcrumb/actions
function applyPageConfig() {
  const cfg = window.pageConfig || {};

  const titleEl = document.getElementById('pageTitle');
  const subEl = document.getElementById('pageSubtitle');
  const bcWrap = document.getElementById('breadcrumbWrap');
  const bcEl = document.getElementById('breadcrumb');
  const actionsEl = document.getElementById('pageActions');

  const title = (cfg.title || 'Page').trim();
  if (titleEl) titleEl.textContent = title;

  if (subEl) {
    const subtitle = (cfg.subtitle || '').trim();
    if (subtitle) {
      subEl.textContent = subtitle;
      subEl.style.display = 'block';
    } else {
      subEl.textContent = '';
      subEl.style.display = 'none';
    }
  }

  if (bcWrap && bcEl) {
    const crumbs = Array.isArray(cfg.breadcrumb) ? cfg.breadcrumb : [];

    const lastLabel = (crumbs[crumbs.length - 1]?.label || '').trim();
    const wouldDuplicateTitle =
      crumbs.length === 1 && lastLabel.toLowerCase() === title.toLowerCase();

    if (crumbs.length < 2 || wouldDuplicateTitle) {
      bcEl.innerHTML = '';
      bcWrap.style.display = 'none';
    } else {
      bcEl.innerHTML = crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        const label = escapeHtml(c.label);

        if (c.href && !isLast) {
          const href = escapeHtml(c.href);
          return `<a href="${href}">${label}</a><span class="sep">›</span>`;
        }
        return `<span class="current">${label}</span>`;
      }).join('');

      bcWrap.style.display = 'block';
    }
  }

  if (actionsEl) {
    actionsEl.innerHTML = '';

    if (cfg.actionsHTML) {
      actionsEl.innerHTML = cfg.actionsHTML;
      return;
    }

    if (Array.isArray(cfg.actions)) {
      actionsEl.innerHTML = cfg.actions.map(a => {
        const href = escapeHtml(a.href);
        const label = escapeHtml(a.label);
        const icon = a.icon ? `<i class="${escapeHtml(a.icon)}"></i>` : '';
        return `<a class="page-action" href="${href}">${icon}<span>${label}</span></a>`;
      }).join('');
    }
  }
}

// ✅ wait until navbar.js is available (fixes initNavbar not found timing)
async function waitForInitNavbar(timeoutMs = 4000) {
  if (typeof window.initNavbar === 'function') return true;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 50));
    if (typeof window.initNavbar === 'function') return true;
  }
  return false;
}

async function loadNavbarPartial() {
  const mount = document.getElementById('navbarMount');
  if (!mount) return;

  // prevent double injection
  if (mount.dataset.loaded === '1') {
    applyPageConfig();
    if (typeof window.initNavbar === 'function') await window.initNavbar();
    return;
  }

  const res = await fetch('/partials/navbar.html', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load /partials/navbar.html');

  mount.innerHTML = await res.text();
  mount.dataset.loaded = '1';

  // Apply page header config after injection
  applyPageConfig();

  // Init navbar AFTER injection + AFTER navbar.js is actually loaded
  const ok = await waitForInitNavbar(4000);
  if (!ok) {
    console.warn('⚠️ initNavbar() not found. Check that /js/navbar.js is loaded before /js/layout.js');
    return;
  }

  await window.initNavbar();
}

// ✅ GLOBAL PROMISE: other scripts can do `await window.navbarReady`
window.navbarReady = (async () => {
  if (document.readyState === 'loading') {
    await new Promise(resolve =>
      document.addEventListener('DOMContentLoaded', resolve, { once: true })
    );
  }

  try {
    await loadNavbarPartial();
  } catch (err) {
    console.error('❌ layout.js navbar load failed:', err);
  }
})();
