import { requireAnyRole, getCurrentUser } from './authClient.js';

console.log("✅ Invoice-list.js loaded");

let showDraftsOnly = false;
let currentSort = { key: 'invoice_no', order: 'desc' };

let currentUser = null;
let canCreateOrEdit = false;
let canDelete = false;
let canApprove = false;

// ---------------- RBAC ----------------
async function initRBAC() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    alert("Please login.");
    window.location.href = "/login.html";
    return false;
  }

  // Permissions
  canCreateOrEdit = ['super', 'approver', 'submitter'].includes(currentUser.role);
  canDelete = ['super', 'approver', 'submitter'].includes(currentUser.role);
  canApprove = currentUser.role === 'approver';

  return true;
}

// ---------------- FETCH & POPULATE INVOICES ---------------
async function fetchInvoices() {
  try {
    const res = await fetch('/api/invoices');
    if (!res.ok) throw new Error("Failed to fetch invoices");
    let invoices = await res.json();

    if (showDraftsOnly) {
      invoices = invoices.filter(inv => inv.status === 'draft');
    }

    invoices = sortInvoices(invoices, currentSort.key, currentSort.order);
    populateTable(invoices);
  } catch (err) {
    console.error("❌ Error fetching invoices:", err);
  }
}

// ---------------- SORTING FUNCTION ----------------
function sortInvoices(invoices, key, order) {
  return invoices.slice().sort((a, b) => {
    let valA, valB;
    switch (key) {
      case 'invoice_no':
        valA = a.invoice_no || '';
        valB = b.invoice_no || '';
        return order === 'asc'
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });

      case 'bill_to':
        valA = (a.bill_to || '').toLowerCase();
        valB = (b.bill_to || '').toLowerCase();
        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);

      case 'date':
        valA = new Date(a.date || a.invoice_date || 0);
        valB = new Date(b.date || b.invoice_date || 0);
        return order === 'asc' ? valA - valB : valB - valA;

      case 'due_date':
        valA = new Date(a.due_date || a.dueDate || 0);
        valB = new Date(b.due_date || b.dueDate || 0);
        return order === 'asc' ? valA - valB : valB - valA;

      default:
        return 0;
    }
  });
}

// ---------------- POPULATE TABLE ----------------
function populateTable(invoices) {
  const tbody = document.querySelector("#invoiceTable tbody");
  tbody.innerHTML = "";

  invoices.forEach(inv => {
    const tr = document.createElement("tr");

    const issueDate = inv.date || inv.invoice_date || '';
    const dueDate = inv.due_date || inv.dueDate || '';

    const issueDateFormatted = issueDate ? new Date(issueDate).toLocaleDateString('en-PH') : '';
    const dueDateFormatted = dueDate ? new Date(dueDate).toLocaleDateString('en-PH') : '';

    // -------- STATUS BADGE --------
    let statusBadge = '';
    switch (inv.status) {
      case 'draft':    statusBadge = '<span class="status-badge status-draft">Draft</span>'; break;
      case 'pending':  statusBadge = '<span class="status-badge status-pending">Pending</span>'; break;
      case 'approved': statusBadge = '<span class="status-badge status-approved">Approved</span>'; break;
      case 'paid':     statusBadge = '<span class="status-badge status-paid">Paid</span>'; break;
      case 'canceled': statusBadge = '<span class="status-badge status-canceled">Canceled</span>'; break;
      default:         statusBadge = `<span class="status-badge">${inv.status}</span>`;
    }

    // -------- RBAC & STATUS BASED BUTTONS --------
    const buttons = [];

    // Everyone can view
    buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);

    // ---------- DRAFT BUTTONS ----------
    if (inv.status === 'draft') {
      // Admin can edit/delete/submit any draft
      if (currentUser.role === 'super' || currentUser.role === 'admin') {
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${inv.invoice_no}')">Edit</button>`);
        buttons.push(`<button class="action-btn delete" onclick="deleteInvoice('${inv.invoice_no}')">Delete</button>`);
        buttons.push(`<button class="action-btn submit" onclick="submitInvoice('${inv.invoice_no}')">Submit</button>`);
      }

      // Submitter can edit/submit their own draft
      if (currentUser.role === 'submitter' && inv.created_by === currentUser.id) {
        buttons.push(`<button class="action-btn edit" onclick="editInvoice('${inv.invoice_no}')">Edit</button>`);
        buttons.push(`<button class="action-btn submit" onclick="submitInvoice('${inv.invoice_no}')">Submit</button>`);
      }
    }

    // ---------- PENDING BUTTONS ----------
    if (inv.status === 'pending') {
      // Approver can approve, but cannot approve own submission
      if (currentUser.role === 'approver' && inv.created_by !== currentUser.id) {
        buttons.push(`<button class="action-btn approve" onclick="approveInvoice('${inv.invoice_no}')">Approve</button>`);
      }

      // Admin can cancel pending invoices
      if (currentUser.role === 'super' || currentUser.role === 'admin') {
        buttons.push(`<button class="action-btn cancel" onclick="cancelInvoice('${inv.invoice_no}')">Cancel</button>`);
      }
    }

    // ---------- APPROVED BUTTONS ----------
    if (inv.status === 'approved') {
      // Admin can mark paid
      if (currentUser.role === 'super' || currentUser.role === 'admin') {
        buttons.push(`<button class="action-btn pay" onclick="markPaid('${inv.invoice_no}')">Mark as Paid</button>`);
      }
      // Admin can also cancel approved invoices if needed
      if (currentUser.role === 'super' || currentUser.role === 'admin') {
        buttons.push(`<button class="action-btn cancel" onclick="cancelInvoice('${inv.invoice_no}')">Cancel</button>`);
      }
    }

    // ---------- CANCELED or PAID ----------
    // No actions allowed for normal users; only admin may have internal override
    if (['paid','canceled'].includes(inv.status)) {
      if (currentUser.role === 'super' || currentUser.role === 'admin') {
        buttons.push(`<button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>`);
      }
    }

    tr.innerHTML = `
      <td><input type="checkbox" class="select-invoice" data-invoice="${inv.invoice_no}" ${['draft','pending'].includes(inv.status) ? '' : 'disabled'}></td>
      <td>${inv.invoice_no}</td>
      <td>${inv.bill_to}</td>
      <td>${issueDateFormatted}</td>
      <td>${dueDateFormatted}</td>
      <td>₱${Number(inv.total_amount_due || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${statusBadge}</td>
      <td>${buttons.join(' ')}</td>
    `;
    tbody.appendChild(tr);
  });

  setupSelectAllCheckbox();
}


// ---------------- ACTION BUTTONS ----------------
function viewInvoice(invoiceNo) {
  window.open(`/InvoicePreviewViewer.html?invoice_no=${encodeURIComponent(invoiceNo)}`, '_blank');
}

function editInvoice(invoiceNo) {
  window.location.href = `/invoice?invoice_no=${encodeURIComponent(invoiceNo)}&edit=true`;
}

async function deleteInvoice(invoiceNo) {
  if (!confirm(`Are you sure you want to delete invoice ${invoiceNo}?`)) return;

  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      alert(`Invoice ${invoiceNo} deleted successfully!`);
      fetchInvoices();
    } else {
      alert(data.error || 'Failed to delete invoice');
    }
  } catch (err) {
    console.error('❌ Delete error:', err);
    alert('Server error deleting invoice');
  }
}

async function approveInvoice(invoiceNo) {
  if (!confirm(`Approve invoice ${invoiceNo}?`)) return;

  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}/approve`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(`Invoice ${invoiceNo} approved!`);
      fetchInvoices();
    } else {
      alert(data.error || 'Failed to approve invoice');
    }
  } catch (err) {
    console.error('❌ Approve error:', err);
    alert('Server error approving invoice');
  }
}

// ---------------- BULK DELETE ----------------
document.getElementById("deleteSelectedBtn")?.addEventListener("click", async () => {
  const selected = Array.from(document.querySelectorAll(".select-invoice:checked"))
                        .map(cb => cb.dataset.invoice);
  if (!selected.length) return alert("No invoices selected.");
  if (!confirm(`Delete ${selected.length} invoice(s)? This cannot be undone.`)) return;

  try {
    for (const invoiceNo of selected) {
      await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`, { method: 'DELETE' });
    }
    alert(`${selected.length} invoice(s) deleted!`);
    fetchInvoices();
  } catch (err) {
    console.error("❌ Bulk delete error:", err);
    alert("Error deleting selected invoices.");
  }
});

// ---------------- SELECT ALL ----------------
function setupSelectAllCheckbox() {
  const selectAll = document.getElementById("selectAllInvoices");
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll(".select-invoice");

  selectAll.checked = false;
  selectAll.addEventListener("change", function() {
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
  });
}

// ---------------- SEARCH FILTER ----------------
document.getElementById("searchInput")?.addEventListener("input", function() {
  const filter = this.value.toLowerCase();
  document.querySelectorAll("#invoiceTable tbody tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? "" : "none";
  });
});

// ---------------- DRAFTS TOGGLE ----------------
document.getElementById("toggleDrafts")?.addEventListener("click", function() {
  showDraftsOnly = !showDraftsOnly;
  this.textContent = showDraftsOnly ? "Show All" : "Show Drafts";
  fetchInvoices();
});

// ---------------- SORTABLE HEADERS ----------------
document.querySelectorAll("#invoiceTable th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    let order = 'asc';
    if (currentSort.key === key) order = currentSort.order === 'asc' ? 'desc' : 'asc';
    currentSort = { key, order };
    fetchInvoices();
    document.querySelectorAll("#invoiceTable th.sortable").forEach(h => h.classList.remove('asc', 'desc'));
    th.classList.add(order);
  });
});

// ---------------- INITIAL LOAD ----------------
window.addEventListener("DOMContentLoaded", async () => {
  const ok = await initRBAC();
  if (!ok) return;
  fetchInvoices();
});

window.viewInvoice = viewInvoice;
window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.approveInvoice = approveInvoice;

async function submitInvoice(invoiceNo) {
  if (!confirm(`Submit invoice ${invoiceNo}?`)) return;
  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}/submit`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(`Invoice ${invoiceNo} submitted!`);
      fetchInvoices();
    } else {
      alert(data.error || 'Failed to submit invoice');
    }
  } catch (err) {
    console.error('❌ Submit error:', err);
    alert('Server error submitting invoice');
  }
}

async function markPaid(invoiceNo) {
  if (!confirm(`Mark invoice ${invoiceNo} as Paid?`)) return;
  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}/mark-paid`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(`Invoice ${invoiceNo} marked as Paid!`);
      fetchInvoices();
    } else {
      alert(data.error || 'Failed to mark as paid');
    }
  } catch (err) {
    console.error('❌ Mark Paid error:', err);
    alert('Server error marking invoice as Paid');
  }
}

async function cancelInvoice(invoiceNo) {
  if (!confirm(`Cancel invoice ${invoiceNo}?`)) return;
  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(`Invoice ${invoiceNo} canceled!`);
      fetchInvoices();
    } else {
      alert(data.error || 'Failed to cancel invoice');
    }
  } catch (err) {
    console.error('❌ Cancel error:', err);
    alert('Server error canceling invoice');
  }
}

window.submitInvoice = submitInvoice;
window.markPaid = markPaid;
window.cancelInvoice = cancelInvoice;
