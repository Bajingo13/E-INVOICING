// invoice-list.js
import { getCurrentUser } from './authClient.js';

console.log("✅ Invoice-list.js loaded");

let currentSort = { key: 'invoice_no', order: 'desc' };
let currentUser = null;

let activeStatus = 'all';          // tabs + URL sync
let allCountsCache = null;         // counts from /api/invoices
let lastFetchedInvoices = [];      // current table dataset

/* ===================== URL HELPERS ===================== */
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setQueryParams(patch = {}) {
  const url = new URL(window.location.href);
  Object.entries(patch).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  });
  window.history.replaceState({}, '', url.toString());
}

function getStatusFromQuery() {
  const raw = (getQueryParam('status') || '').trim().toLowerCase();
  const allowed = new Set(['draft', 'returned', 'pending', 'approved', 'paid', 'void', 'all']);
  if (!raw) return null;
  return allowed.has(raw) ? raw : null;
}

function applySearchFromQuery() {
  const search = getQueryParam('search');
  const input = document.getElementById("searchInput");
  if (search && input) input.value = search;
}

function getSearchValue() {
  const input = document.getElementById("searchInput");
  return (input?.value || '').trim().toLowerCase();
}

/* ===================== SEARCH + HIGHLIGHT ===================== */
function filterRowsBySearchValue() {
  const v = getSearchValue();
  document.querySelectorAll("#invoiceTable tbody tr").forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(v) ? "" : "none";
  });
}

function focusInvoiceRow(invoiceNo) {
  if (!invoiceNo) return;

  const rows = document.querySelectorAll("#invoiceTable tbody tr");
  let targetRow = null;

  rows.forEach(r => {
    const cellText = (r.children?.[1]?.textContent || '').trim(); // invoice_no column
    if (cellText === invoiceNo) targetRow = r;
    r.classList.remove('row-focus');
  });

  if (targetRow) {
    targetRow.classList.add('row-focus');
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => targetRow.classList.remove('row-focus'), 6000);
  }
}

/* ===================== RBAC ===================== */
async function initRBAC() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    alert("Please login.");
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

/* ===================== STATUS TABS ===================== */
function setActiveTab(status) {
  activeStatus = status;

  document.querySelectorAll('.filter-tab').forEach(btn => {
    const isActive = btn.dataset.status === status;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  setQueryParams({ status: status === 'all' ? null : status });
}

function bindStatusTabs() {
  const tabs = document.querySelectorAll('.filter-tab');
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const status = tab.dataset.status;
      if (!status) return;
      setActiveTab(status);
      await fetchInvoices();
    });
  });
}

function updateCountsFromAllInvoices(allInvoices) {
  const counts = {
    all: allInvoices.length,
    draft: 0,
    returned: 0,
    pending: 0,
    approved: 0,
    paid: 0,
    void: 0
  };

  for (const inv of allInvoices) {
    if (counts[inv.status] !== undefined) counts[inv.status]++;
  }

  Object.keys(counts).forEach(k => {
    const el = document.getElementById(`count-${k}`);
    if (el) el.textContent = `(${counts[k]})`;
  });
}

/* ===================== FETCH ===================== */
async function fetchAllForCountsIfNeeded() {
  if (allCountsCache) return;

  try {
    const res = await fetch('/api/invoices', { credentials: 'include' });
    if (!res.ok) throw new Error("Failed to fetch invoices for counts");
    const all = await res.json();
    allCountsCache = all;
    updateCountsFromAllInvoices(all);
  } catch (err) {
    console.warn("⚠️ Counts fetch failed:", err);
  }
}

async function fetchInvoices() {
  try {
    await fetchAllForCountsIfNeeded();

    const url = (activeStatus && activeStatus !== 'all')
      ? `/api/invoices?status=${encodeURIComponent(activeStatus)}`
      : `/api/invoices`;

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error("Failed to fetch invoices");

    let invoices = await res.json();

    invoices = sortInvoices(invoices, currentSort.key, currentSort.order);

    lastFetchedInvoices = invoices;
    populateTable(invoices);

    const search = getQueryParam('search');
    if (search) {
      applySearchFromQuery();
      filterRowsBySearchValue();
    }

    const focus = getQueryParam('focus');
    if (focus) focusInvoiceRow(focus);

  } catch (err) {
    console.error("❌ Error fetching invoices:", err);
  }
}

/* ===================== SORT ===================== */
function sortInvoices(invoices, key, order) {
  return invoices.slice().sort((a, b) => {
    let valA, valB;

    switch (key) {
      case 'invoice_no':
        valA = a.invoice_no || '';
        valB = b.invoice_no || '';
        return order === 'asc'
          ? valA.localeCompare(valB, undefined, { numeric: true })
          : valB.localeCompare(valA, undefined, { numeric: true });

      case 'bill_to':
        valA = (a.bill_to || '').toLowerCase();
        valB = (b.bill_to || '').toLowerCase();
        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);

      case 'date':
        return order === 'asc'
          ? new Date(a.date || a.invoice_date || 0) - new Date(b.date || b.invoice_date || 0)
          : new Date(b.date || b.invoice_date || 0) - new Date(a.date || a.invoice_date || 0);

      case 'due_date':
        return order === 'asc'
          ? new Date(a.due_date || 0) - new Date(b.due_date || 0)
          : new Date(b.due_date || 0) - new Date(a.due_date || 0);

      case 'status': {
        const orderMap = { draft: 1, returned: 2, pending: 3, approved: 4, paid: 5, void: 6 };
        valA = orderMap[a.status] ?? 99;
        valB = orderMap[b.status] ?? 99;
        return order === 'asc' ? valA - valB : valB - valA;
      }

      default:
        return 0;
    }
  });
}

/* ===================== TABLE ===================== */
function populateTable(invoices) {
  const tbody = document.querySelector("#invoiceTable tbody");
  if (!tbody) return;

  const role = (currentUser?.role || '').toLowerCase();
  tbody.innerHTML = "";

  invoices.forEach(inv => {
    const tr = document.createElement("tr");

    const issueDate = inv.date || inv.invoice_date || '';
    const dueDate = inv.due_date || '';
    const issueFmt = issueDate ? new Date(issueDate).toLocaleDateString('en-PH') : '';
    const dueFmt = dueDate ? new Date(dueDate).toLocaleDateString('en-PH') : '';

    let statusBadge = `<span class="status-badge">${inv.status || ''}</span>`;
    if (inv.status === 'draft') statusBadge = `<span class="status-badge status-draft">Draft</span>`;
    if (inv.status === 'returned') statusBadge = `<span class="status-badge status-returned">Returned</span>`;
    if (inv.status === 'pending') statusBadge = `<span class="status-badge status-pending">Pending</span>`;
    if (inv.status === 'approved') statusBadge = `<span class="status-badge status-approved">Approved</span>`;
    if (inv.status === 'paid') statusBadge = `<span class="status-badge status-paid">Paid</span>`;
    if (inv.status === 'void') statusBadge = `<span class="status-badge status-void">Void</span>`;

    const buttons = [];

    // helper to safely pass status to view
    const safeNo = String(inv.invoice_no || '').replace(/'/g, "\\'");
    const safeStatus = String(inv.status || '').replace(/'/g, "\\'");

    // --- DRAFT ---
    if (inv.status === 'draft') {
      if (role === 'submitter') {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${safeNo}','${safeStatus}')">View</button>`);
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${safeNo}')">Edit</button>`);
      } else if (['super', 'admin', 'approver'].includes(role)) {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${safeNo}','${safeStatus}')">View</button>`);
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${safeNo}')">Edit</button>`);
        buttons.push(`<button class="action-btn delete" onclick="deleteInvoice('${safeNo}')">Delete</button>`);
        buttons.push(`<button class="action-btn submit" onclick="submitInvoice('${safeNo}')">Submit</button>`);
      }
    }

    // --- RETURNED ---
    if (inv.status === 'returned') {
      if (role === 'submitter') {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${safeNo}','${safeStatus}')">View</button>`);
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${safeNo}')">Edit</button>`);
        buttons.push(`<button class="action-btn submit" onclick="submitInvoice('${safeNo}')">Resubmit</button>`);
      } else if (['super', 'admin', 'approver'].includes(role)) {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${safeNo}','${safeStatus}')">View</button>`);
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${safeNo}')">Edit</button>`);
        buttons.push(`<button class="action-btn delete" onclick="deleteInvoice('${safeNo}')">Delete</button>`);
        buttons.push(`<button class="action-btn submit" onclick="submitInvoice('${safeNo}')">Resubmit</button>`);
      }
    }

    // --- PENDING ---
    if (inv.status === 'pending') {
      buttons.push(`<button class="action-btn view" onclick="viewInvoice('${safeNo}','${safeStatus}')">View</button>`);

      const isOwner = Number(inv.created_by) === Number(currentUser.id);
      const isAdmin = ['super', 'admin', 'super_admin'].includes(role);
      const isApprover = role === 'approver';

      if (isOwner || isAdmin || isApprover) {
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${safeNo}')">Edit</button>`);
      }

      if (isApprover || isAdmin) {
        buttons.push(`<button class="action-btn approve" onclick="approveInvoice('${safeNo}')">Approve</button>`);
        buttons.push(`<button class="action-btn return" onclick="returnInvoice('${safeNo}')">Return</button>`);
      }

      if (isAdmin) {
        buttons.push(`<button class="action-btn void" onclick="voidInvoice('${safeNo}')">Void</button>`);
      }
    }

    // --- APPROVED ---
    if (inv.status === 'approved') {
      buttons.push(`<button class="action-btn view" onclick="viewInvoice('${safeNo}','${safeStatus}')">View</button>`);
      if (['super', 'admin'].includes(role)) {
        buttons.push(`<button class="action-btn pay" onclick="markPaid('${safeNo}')">Mark as Paid</button>`);
        buttons.push(`<button class="action-btn void" onclick="voidInvoice('${safeNo}')">Void</button>`);
      }
    }

    // --- PAID / CANCELED ---
    if (inv.status === 'paid' || inv.status === 'void') {
      buttons.push(`<button class="action-btn view" onclick="viewInvoice('${safeNo}','${safeStatus}')">View</button>`);
    }

    tr.innerHTML = `
      <td><input type="checkbox" class="select-invoice" data-invoice="${inv.invoice_no}"></td>
      <td>${inv.invoice_no || ''}</td>
      <td>${inv.bill_to || ''}</td>
      <td>${issueFmt}</td>
      <td>${dueFmt}</td>
      <td>₱${Number(inv.total_amount_due || 0).toFixed(2)}</td>
      <td>${statusBadge}</td>
      <td>${buttons.join(' ')}</td>
    `;

    tbody.appendChild(tr);
  });

  setupSelectAllCheckbox();
}

/* ===================== EXPORT (HEADER) ===================== */
function setupExportDropdown() {
  const btnTop = document.getElementById("exportBtnTop");
  const menuTop = document.getElementById("exportMenuTop");
  if (!btnTop || !menuTop) return;

  if (btnTop.dataset.bound === '1') return;
  btnTop.dataset.bound = '1';

  menuTop.innerHTML = `
    <button type="button" class="export-item" data-status="all">All Invoices</button>
    <button type="button" class="export-item" data-status="draft">Draft Only</button>
    <button type="button" class="export-item" data-status="returned">Returned Only</button>
    <button type="button" class="export-item" data-status="pending">Pending Only</button>
    <button type="button" class="export-item" data-status="approved">Approved Only</button>
    <button type="button" class="export-item" data-status="paid">Paid Only</button>
    <button type="button" class="export-item" data-status="void">Void Only</button>
  `;

  function close() { menuTop.classList.remove('show'); }

  btnTop.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    document.querySelectorAll('.dropdown-menu.show').forEach(m => {
      if (m !== menuTop) m.classList.remove('show');
    });

    menuTop.classList.toggle('show');
  });

  menuTop.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const b = e.target.closest('[data-status]');
    const status = b?.dataset?.status;
    if (!status) return;

    close();
    exportInvoices(status);
  });

  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

function exportInvoices(status) {
  window.location.href = `/api/invoices/export/excel?status=${encodeURIComponent(status)}`;
}

/* ===================== ACTIONS ===================== */
function viewInvoice(no, status = '') {
  const q = new URLSearchParams();
  q.set('invoice_no', no);
  if (status) q.set('status', status);
  window.open(`/InvoicePreviewViewer.html?${q.toString()}`, '_blank');
}

function editInvoice(no) {
  window.location.href = `/invoice?invoice_no=${encodeURIComponent(no)}&edit=true`;
}

async function deleteInvoice(no) {
  if (!confirm(`Delete invoice ${no}?`)) return;
  await fetch(`/api/invoices/${encodeURIComponent(no)}`, { method: 'DELETE', credentials: 'include' });
  allCountsCache = null;
  await fetchInvoices();
}

async function approveInvoice(no) {
  if (!confirm(`Approve invoice ${no}?`)) return;
  await fetch(`/api/invoices/${encodeURIComponent(no)}/approve`, { method: 'POST', credentials: 'include' });
  allCountsCache = null;
  await fetchInvoices();
}

async function submitInvoice(no) {
  if (!confirm(`Submit invoice ${no}?`)) return;
  await fetch(`/api/invoices/${encodeURIComponent(no)}/submit`, { method: 'POST', credentials: 'include' });
  allCountsCache = null;
  await fetchInvoices();
}

async function markPaid(no) {
  if (!confirm(`Mark invoice ${no} as paid?`)) return;
  await fetch(`/api/invoices/${encodeURIComponent(no)}/mark-paid`, { method: 'POST', credentials: 'include' });
  allCountsCache = null;
  await fetchInvoices();
}

async function voidInvoice(no) {
  if (!confirm(`Void invoice ${no}?`)) return;

  const res = await fetch(`/api/invoices/${encodeURIComponent(no)}/void`, {
    method: 'POST',
    credentials: 'include'
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(data.error || `Failed to void invoice (${res.status})`);
    return;
  }

  allCountsCache = null;
  await fetchInvoices();
}


async function returnInvoice(no) {
  const reason = prompt("Reason for returning this invoice?");
  if (reason === null) return;

  const res = await fetch(`/api/invoices/${encodeURIComponent(no)}/return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Failed to return invoice");
    return;
  }

  allCountsCache = null;
  await fetchInvoices();
}

/* ===================== BULK ===================== */
document.getElementById("deleteSelectedBtn")?.addEventListener("click", async () => {
  const selected = [...document.querySelectorAll(".select-invoice:checked")].map(cb => cb.dataset.invoice);
  if (!selected.length) return alert("No invoices selected");
  if (!confirm(`Delete ${selected.length} invoices?`)) return;

  for (const no of selected) {
    await fetch(`/api/invoices/${encodeURIComponent(no)}`, { method: 'DELETE', credentials: 'include' });
  }

  allCountsCache = null;
  await fetchInvoices();
});

function setupSelectAllCheckbox() {
  const all = document.getElementById("selectAllInvoices");
  if (!all) return;
  const boxes = document.querySelectorAll(".select-invoice");
  all.checked = false;
  all.onchange = () => boxes.forEach(cb => cb.checked = all.checked);
}

/* ===================== SEARCH ===================== */
document.getElementById("searchInput")?.addEventListener("input", () => {
  setQueryParams({ search: getSearchValue() || null });
  filterRowsBySearchValue();
});

/* ===================== SORT HEADERS ===================== */
document.querySelectorAll("#invoiceTable th.sortable").forEach(th => {
  th.onclick = () => {
    const key = th.dataset.sort;
    currentSort.order = (currentSort.key === key && currentSort.order === 'asc') ? 'desc' : 'asc';
    currentSort.key = key;
    fetchInvoices();
  };
});

/* ===================== INIT ===================== */
window.addEventListener("DOMContentLoaded", async () => {
  if (window.navbarReady) {
    try { await window.navbarReady; } catch {}
  }

  const ok = await initRBAC();
  if (!ok) return;

  bindStatusTabs();

  const statusFromUrl = getStatusFromQuery();
  setActiveTab(statusFromUrl || 'all');

  applySearchFromQuery();

  setupExportDropdown();

  await fetchInvoices();

  const focus = getQueryParam('focus');
  if (focus) focusInvoiceRow(focus);
});

// Expose functions globally
window.viewInvoice = viewInvoice;
window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.approveInvoice = approveInvoice;
window.submitInvoice = submitInvoice;
window.markPaid = markPaid;
window.voidInvoice = voidInvoice;
window.returnInvoice = returnInvoice;
