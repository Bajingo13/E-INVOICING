console.log("✅ Invoice-list.js loaded");

let showDraftsOnly = false; // toggle flag
let currentSort = { key: 'invoice_no', order: 'desc' };

// ---------------- FETCH & POPULATE INVOICES ---------------
async function fetchInvoices() {
  try {
    const res = await fetch('/api/invoices');
    if (!res.ok) throw new Error("Failed to fetch invoices");
    let invoices = await res.json();

    // Filter drafts if toggle is ON
    if (showDraftsOnly) {
      invoices = invoices.filter(inv => inv.status === 'draft');
    }

    // Sort invoices using currentSort
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

      default: return 0;
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

    let statusText = '';
    if (inv.status === 'draft') statusText = 'Draft';
    else if (inv.status === 'cancelled') statusText = 'Cancelled';
    else if (inv.is_paid) statusText = 'Paid';
    else statusText = 'Pending';

    tr.innerHTML = `
      <td><input type="checkbox" class="select-invoice" data-invoice="${inv.invoice_no}"></td>
      <td>${inv.invoice_no}</td>
      <td>${inv.bill_to}</td>
      <td>${issueDateFormatted}</td>
      <td>${dueDateFormatted}</td>
      <td>₱${Number(inv.total_amount_due || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${statusText}</td>
      <td>
        <button class="action-btn view" onclick="viewInvoice('${inv.invoice_no}')">View</button>
        <button class="action-btn edit" onclick="editInvoice('${inv.invoice_no}')">Edit</button>
        <button class="action-btn delete" onclick="deleteInvoice('${inv.invoice_no}')">Delete</button>
      </td>
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
window.addEventListener("DOMContentLoaded", fetchInvoices);
