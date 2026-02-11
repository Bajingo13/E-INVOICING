import { requireAnyRole, getCurrentUser } from './authClient.js';

console.log("✅ Invoice-list.js loaded");

let showDraftsOnly = false;
let currentSort = { key: 'invoice_no', order: 'desc' };

let currentUser = null;

/* ===================== NOTIF -> SEARCH + HIGHLIGHT HELPERS ===================== */
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function applySearchFromQuery() {
  const search = getQueryParam('search');
  const input = document.getElementById("searchInput");
  if (search && input) input.value = search;
}

function filterRowsBySearchValue() {
  const input = document.getElementById("searchInput");
  const v = (input?.value || '').toLowerCase();

  document.querySelectorAll("#invoiceTable tbody tr").forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(v) ? "" : "none";
  });
}

function focusInvoiceRow(invoiceNo) {
  if (!invoiceNo) return;

  const rows = document.querySelectorAll("#invoiceTable tbody tr");
  let targetRow = null;

  rows.forEach(r => {
    // 2nd column is invoice_no based on your table
    const cellText = (r.children?.[1]?.textContent || '').trim();
    if (cellText === invoiceNo) targetRow = r;
    r.classList.remove('row-focus');
  });

  if (targetRow) {
    targetRow.classList.add('row-focus');
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // remove highlight after a few seconds (optional)
    setTimeout(() => targetRow.classList.remove('row-focus'), 6000);
  }
}
/* ============================================================================ */

// ---------------- RBAC ----------------
async function initRBAC() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    alert("Please login.");
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

// ---------------- FETCH & POPULATE ----------------
async function fetchInvoices() {
  try {
    const res = await fetch('/api/invoices');
    if (!res.ok) throw new Error("Failed to fetch invoices");

    let invoices = await res.json();

    if (showDraftsOnly) invoices = invoices.filter(inv => inv.status === 'draft');

    invoices = sortInvoices(invoices, currentSort.key, currentSort.order);
    populateTable(invoices);

    // ✅ Apply search + focus after rows are rendered
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

// ---------------- SORT ----------------
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
          ? new Date(a.due_date || 0) - new Date(a.due_date || 0)
          : new Date(b.due_date || 0) - new Date(a.due_date || 0);

      case 'status': {
        const orderMap = {
          draft: 1,
          returned: 2,
          pending: 3,
          approved: 4,
          paid: 5,
          canceled: 6
        };
        valA = orderMap[a.status] ?? 99;
        valB = orderMap[b.status] ?? 99;
        return order === 'asc' ? valA - valB : valB - valA;
      }

      default:
        return 0;
    }
  });
}

// ---------------- TABLE ----------------
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

    // Status Badge
    let statusBadge = `<span class="status-badge">${inv.status || ''}</span>`;
    if (inv.status === 'draft') statusBadge = `<span class="status-badge status-draft">Draft</span>`;
    if (inv.status === 'returned') statusBadge = `<span class="status-badge status-returned">Returned</span>`;
    if (inv.status === 'pending') statusBadge = `<span class="status-badge status-pending">Pending</span>`;
    if (inv.status === 'approved') statusBadge = `<span class="status-badge status-approved">Approved</span>`;
    if (inv.status === 'paid') statusBadge = `<span class="status-badge status-paid">Paid</span>`;
    if (inv.status === 'canceled') statusBadge = `<span class="status-badge status-canceled">Canceled</span>`;

    const buttons = [];

    // --- DRAFT ---
    if (inv.status === 'draft') {
      if (role === 'submitter') {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${inv.invoice_no}')">Edit</button>`);
      } else if (['super', 'admin', 'approver'].includes(role)) {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${inv.invoice_no}')">Edit</button>`);
        buttons.push(`<button class="action-btn delete" onclick="deleteInvoice('${inv.invoice_no}')">Delete</button>`);
        buttons.push(`<button class="action-btn submit" onclick="submitInvoice('${inv.invoice_no}')">Submit</button>`);
      }
    }

    // --- RETURNED  ---
    if (inv.status === 'returned') {
      if (role === 'submitter') {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${inv.invoice_no}')">Edit</button>`);
        buttons.push(`<button class="action-btn submit" onclick="submitInvoice('${inv.invoice_no}')">Resubmit</button>`);
      } else if (['super', 'admin', 'approver'].includes(role)) {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${inv.invoice_no}')">Edit</button>`);
        buttons.push(`<button class="action-btn delete" onclick="deleteInvoice('${inv.invoice_no}')">Delete</button>`);
        buttons.push(`<button class="action-btn submit" onclick="submitInvoice('${inv.invoice_no}')">Resubmit</button>`);
      }
    }

    // --- PENDING ---
    if (inv.status === 'pending') {
      buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);

      if (
        ['approver', 'admin', 'super'].includes(role) &&
        Number(inv.created_by) !== Number(currentUser.id)
      ) {
        if (role === 'approver' || role === 'admin' || role === 'super') {
          buttons.push(`<button class="action-btn approve" onclick="approveInvoice('${inv.invoice_no}')">Approve</button>`);
        }
        buttons.push(`<button class="action-btn return" onclick="returnInvoice('${inv.invoice_no}')">Return</button>`);
      }

      if (['super', 'admin'].includes(role)) {
        buttons.push(`<button class="action-btn cancel" onclick="cancelInvoice('${inv.invoice_no}')">Cancel</button>`);
      }
    }

    // --- APPROVED ---
    if (inv.status === 'approved') {
      buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);
      if (['super', 'admin'].includes(role)) {
        buttons.push(`<button class="action-btn pay" onclick="markPaid('${inv.invoice_no}')">Mark as Paid</button>`);
        buttons.push(`<button class="action-btn cancel" onclick="cancelInvoice('${inv.invoice_no}')">Cancel</button>`);
      }
    }

    // --- PAID / CANCELED ---
    if (inv.status === 'paid' || inv.status === 'canceled') {
      buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);
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

// ---------------- EXPORT ----------------
const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  const menu = document.createElement("div");
  menu.className = "export-dropdown";
  menu.style.display = "none";
  menu.innerHTML = `
    <button data-status="all">All Invoices</button>
    <button data-status="draft">Draft Only</button>
    <button data-status="returned">Returned Only</button>
    <button data-status="pending">Pending Only</button>
    <button data-status="approved">Approved Only</button>
  `;
  exportBtn.parentElement.appendChild(menu);

  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });

  menu.addEventListener("click", async (e) => {
    const status = e.target.dataset.status;
    if (!status) return;
    menu.style.display = "none";
    await exportInvoices(status);
  });

  document.addEventListener("click", () => { menu.style.display = "none"; });
}

async function exportInvoices(status) {
  try {
    window.location.href = `/api/invoices/export/excel?status=${status}`;
  } catch (err) {
    console.error("Export failed:", err);
    alert("Failed to export invoices");
  }
}

// ---------------- ACTIONS ----------------
function viewInvoice(no) {
  window.open(`/InvoicePreviewViewer.html?invoice_no=${no}`, '_blank');
}
function editInvoice(no) {
  window.location.href = `/invoice?invoice_no=${no}&edit=true`;
}

async function deleteInvoice(no) {
  if (!confirm(`Delete invoice ${no}?`)) return;
  await fetch(`/api/invoices/${no}`, { method: 'DELETE' });
  fetchInvoices();
}

async function approveInvoice(no) {
  if (!confirm(`Approve invoice ${no}?`)) return;
  await fetch(`/api/invoices/${no}/approve`, { method: 'POST' });
  fetchInvoices();
}

async function submitInvoice(no) {
  if (!confirm(`Submit invoice ${no}?`)) return;
  await fetch(`/api/invoices/${no}/submit`, { method: 'POST' });
  fetchInvoices();
}

async function markPaid(no) {
  if (!confirm(`Mark invoice ${no} as paid?`)) return;
  await fetch(`/api/invoices/${no}/mark-paid`, { method: 'POST' });
  fetchInvoices();
}

async function cancelInvoice(no) {
  if (!confirm(`Cancel invoice ${no}?`)) return;
  await fetch(`/api/invoices/${no}/cancel`, { method: 'POST' });
  fetchInvoices();
}

// ✅ Return pending invoice -> sets status "returned"
async function returnInvoice(no) {
  const reason = prompt("Reason for returning this invoice?");
  if (reason === null) return;

  const res = await fetch(`/api/invoices/${no}/return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Failed to return invoice");
    return;
  }

  fetchInvoices();
}

// ---------------- BULK ----------------
document.getElementById("deleteSelectedBtn")?.addEventListener("click", async () => {
  const selected = [...document.querySelectorAll(".select-invoice:checked")].map(cb => cb.dataset.invoice);
  if (!selected.length) return alert("No invoices selected");
  if (!confirm(`Delete ${selected.length} invoices?`)) return;
  for (const no of selected) await fetch(`/api/invoices/${no}`, { method: 'DELETE' });
  fetchInvoices();
});

function setupSelectAllCheckbox() {
  const all = document.getElementById("selectAllInvoices");
  if (!all) return;
  const boxes = document.querySelectorAll(".select-invoice");
  all.checked = false;
  all.onchange = () => boxes.forEach(cb => cb.checked = all.checked);
}

// ---------------- SEARCH ----------------
document.getElementById("searchInput")?.addEventListener("input", () => {
  filterRowsBySearchValue();
});

// ---------------- TOGGLE DRAFT ----------------
document.getElementById("toggleDrafts")?.addEventListener("click", function () {
  showDraftsOnly = !showDraftsOnly;
  this.textContent = showDraftsOnly ? "Show All" : "Show Drafts";
  fetchInvoices();
});

// ---------------- SORT HEADERS ----------------
document.querySelectorAll("#invoiceTable th.sortable").forEach(th => {
  th.onclick = () => {
    const key = th.dataset.sort;
    currentSort.order = currentSort.key === key && currentSort.order === 'asc' ? 'desc' : 'asc';
    currentSort.key = key;
    fetchInvoices();
  };
});

// ---------------- INIT ----------------
window.addEventListener("DOMContentLoaded", async () => {
  const ok = await initRBAC();
  if (!ok) return;

  // Prefill search if coming from notification
  applySearchFromQuery();

  // Fetch invoices (populateTable runs, then fetchInvoices applies focus/search)
  fetchInvoices();
});

// Expose functions globally
window.viewInvoice = viewInvoice;
window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.approveInvoice = approveInvoice;
window.submitInvoice = submitInvoice;
window.markPaid = markPaid;
window.cancelInvoice = cancelInvoice;
window.returnInvoice = returnInvoice;
