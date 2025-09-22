// ==========================
// INVOICE LIST JS
// ==========================
console.log("✅ Invoice-list.js loaded");

// ==========================
// FETCH & POPULATE INVOICES
// ==========================
async function fetchInvoices() {
  try {
    const res = await fetch('/api/invoices');
    if (!res.ok) throw new Error("Failed to fetch invoices");
    const invoices = await res.json();
    populateTable(invoices);
  } catch (err) {
    console.error("❌ Error fetching invoices:", err);
  }
}

function populateTable(invoices) {
  const tbody = document.querySelector("#invoiceTable tbody");
  tbody.innerHTML = "";

  invoices.forEach(inv => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="select-invoice" data-invoice="${inv.invoice_no}"></td>
      <td>${inv.invoice_no}</td>
      <td>${inv.bill_to}</td>
      <td>${inv.date ? new Date(inv.date).toLocaleDateString('en-PH') : ''}</td>
      <td>₱${Number(inv.total_amount_due).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits:2})}</td>
      <td>${Number(inv.total_amount_due) > 0 ? 'Pending' : 'Paid'}</td>
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

// ==========================
// INVOICE ACTION BUTTONS
// ==========================
function viewInvoice(invoiceNo) {
  window.location.href = `/replica.html?invoice_no=${encodeURIComponent(invoiceNo)}`;
}

function editInvoice(invoiceNo) {
  window.location.href = `/invoice?invoice_no=${encodeURIComponent(invoiceNo)}&edit=true`;
}

async function deleteInvoice(invoiceNo) {
  if (!confirm(`Are you sure you want to delete invoice ${invoiceNo}? This action cannot be undone.`)) return;

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

// ==========================
// BULK DELETE (API ENDPOINT)
// ==========================
document.getElementById("bulkDeleteBtn")?.addEventListener("click", async () => {
  const selected = [...document.querySelectorAll(".select-invoice:checked")].map(cb => cb.dataset.invoice);
  if (!selected.length) return alert("No invoices selected for deletion.");
  if (!confirm(`Are you sure you want to delete ${selected.length} invoice(s)? This cannot be undone.`)) return;

  try {
    const res = await fetch('/api/invoices/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices: selected })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`${selected.length} invoice(s) deleted successfully!`);
      fetchInvoices();
    } else {
      alert(data.error || 'Failed to delete invoices');
    }
  } catch (err) {
    console.error('❌ Bulk delete error:', err);
    alert('Server error during bulk delete');
  }
});

// ==========================
// BULK DELETE (LOOP METHOD)
// ==========================
document.getElementById("deleteSelectedBtn").addEventListener("click", async () => {
  const selected = Array.from(document.querySelectorAll(".select-invoice:checked"))
                        .map(cb => cb.dataset.invoice);

  if (selected.length === 0) {
    alert("No invoices selected for deletion.");
    return;
  }

  if (!confirm(`Are you sure you want to delete ${selected.length} invoice(s)? This cannot be undone.`)) return;

  try {
    for (const invoiceNo of selected) {
      await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`, { method: 'DELETE' });
    }
    alert(`${selected.length} invoice(s) deleted successfully!`);
    fetchInvoices();
  } catch (err) {
    console.error("❌ Bulk delete error:", err);
    alert("Error deleting selected invoices.");
  }
});

// ==========================
// SELECT ALL CHECKBOX
// ==========================
const selectAll = document.getElementById("selectAllInvoices");
selectAll.addEventListener("change", function() {
  const checkboxes = document.querySelectorAll(".select-invoice");
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
});

// ==========================
// SEARCH FILTER
// ==========================
document.getElementById("searchInput").addEventListener("input", function() {
  const filter = this.value.toLowerCase();
  const rows = document.querySelectorAll("#invoiceTable tbody tr");
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? "" : "none";
  });
});

// ==========================
// INITIAL LOAD
// ==========================
window.addEventListener("DOMContentLoaded", fetchInvoices);

// ==========================
// HELPER: SETUP SELECT ALL (if needed)
// ==========================
function setupSelectAllCheckbox() {
  const selectAll = document.getElementById("selectAllInvoices");
  const checkboxes = document.querySelectorAll(".select-invoice");

  selectAll.addEventListener("change", function() {
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
  });
}