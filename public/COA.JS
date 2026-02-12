// ===============================
// public/COA.js  (UPDATED UI/UX + READY TO PASTE)
// ===============================

'use strict';

const codeInput = document.getElementById("codeInput");
const dateInput = document.getElementById("dateInput");
const titleInput = document.getElementById("titleInput");
const classSelect = document.getElementById("classSelect");
const taxRateSelect = document.getElementById("taxRateSelect");
const customTaxInput = document.getElementById("customTaxInput");
const ewtSelect = document.getElementById("ewtSelect");

const addBtn = document.getElementById("addBtn");
const editBtn = document.getElementById("editBtn");
const deleteBtn = document.getElementById("deleteBtn");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");

const tableBody = document.querySelector(".coa-table tbody");
const tabs = document.querySelectorAll(".tab");
const tableHeaders = document.querySelectorAll(".coa-table thead th");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

const importBtn = document.getElementById("importBtn");
const printBtn = document.getElementById("printBtn"); // optional

// Optional UI elements from the new HTML
const shownCountEl = document.getElementById("shownCount");
const selectedCountEl = document.getElementById("selectedCount");
const emptyState = document.getElementById("emptyState");

const selectAll = document.getElementById("selectAll");

let accounts = [];
let ewtList = [];
let editingIndex = null;

let sortColumn = null;
let sortAsc = true;

let isEditing = false;

// --- Class type mapping ---
const CLASS_MAP = {
  "A": "Assets",
  "L": "Liabilities",
  "C": "Equity",
  "I": "Revenue",
  "E": "Expenses"
};
function letterToClass(letter) { return CLASS_MAP[letter] || letter; }

// --- Utils ---
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ensureDateFilled() {
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = todayYYYYMMDD();
}


function setMeta({ shown = null, selected = null } = {}) {
  if (shownCountEl && shown !== null) shownCountEl.textContent = String(shown);
  if (selectedCountEl && selected !== null) selectedCountEl.textContent = String(selected);
}

function getActiveTabName() {
  return document.querySelector(".tab.active")?.textContent.trim() || "All Accounts";
}

function clearRowSelection() {
  document.querySelectorAll(".row-selected").forEach(r => r.classList.remove("row-selected"));
}

function getSelectedRowEl() {
  return document.querySelector(".row-selected");
}

function getSelectedRowIndex() {
  const row = getSelectedRowEl();
  if (!row) return null;
  const idx = Number(row.dataset.index);
  return Number.isFinite(idx) ? idx : null;
}

function updateSelectedCount() {
  const checked = document.querySelectorAll(".row-check:checked").length;
  setMeta({ selected: checked });
  if (selectAll) {
    const all = document.querySelectorAll(".row-check").length;
    selectAll.checked = all > 0 && checked === all;
    selectAll.indeterminate = checked > 0 && checked < all;
  }
}

// --- Form Control ---
function disableForm() {
  isEditing = false;
  [codeInput, dateInput, titleInput, classSelect, taxRateSelect, customTaxInput, ewtSelect].forEach(el => {
    if (el) el.disabled = true;
  });

  // Lock toolbar while editing (prevents accidental delete)
  if (addBtn) addBtn.disabled = false;
  if (editBtn) editBtn.disabled = false;
  if (deleteBtn) deleteBtn.disabled = false;
  if (importBtn) importBtn.disabled = false;
  if (printBtn) printBtn.disabled = false;

  if (saveBtn) saveBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
}

function enableForm() {
  isEditing = true;
  [codeInput, dateInput, titleInput, classSelect, taxRateSelect, ewtSelect].forEach(el => {
    if (el) el.disabled = false;
  });

  // customTaxInput enabled only if shown
  if (customTaxInput) customTaxInput.disabled = (taxRateSelect?.value !== "custom");

  if (saveBtn) saveBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;

  if (addBtn) addBtn.disabled = true;
  if (editBtn) editBtn.disabled = true;
  if (deleteBtn) deleteBtn.disabled = true;
  if (importBtn) importBtn.disabled = true;
  if (printBtn) printBtn.disabled = true;
}

function clearForm() {
  if (codeInput) codeInput.value = "";
  if (dateInput) dateInput.value = "";
  if (titleInput) titleInput.value = "";
  if (classSelect) classSelect.value = "A";
  if (taxRateSelect) taxRateSelect.value = "0";

  if (customTaxInput) {
    customTaxInput.value = "";
    customTaxInput.style.display = "none";
    customTaxInput.disabled = true;
  }
  if (ewtSelect) ewtSelect.value = "";
}

// --- Tax Rate change ---
taxRateSelect?.addEventListener("change", () => {
  if (!customTaxInput) return;
  if (taxRateSelect.value === "custom") {
    customTaxInput.style.display = "block";
    customTaxInput.disabled = false;
    customTaxInput.focus();
  } else {
    customTaxInput.style.display = "none";
    customTaxInput.value = "";
    customTaxInput.disabled = true;
  }
});

// --- Load EWT ---
async function loadEWT() {
  try {
    const res = await fetch("/api/ewt");
    if (!res.ok) throw new Error("Failed to fetch EWT");
    const data = await res.json();

    ewtList = (data || []).map(e => ({
      id: Number(e.id),
      code: e.code || e.ewt_code || e.name || '',
      tax_rate: Number(e.tax_rate ?? e.taxRate ?? e.rate ?? 0)
    }));

    if (ewtSelect) {
      ewtSelect.innerHTML = `<option value="">-- Select EWT --</option>`;
      ewtList.forEach(e => {
        const opt = document.createElement("option");
        opt.value = String(e.id);
        opt.textContent = `${e.code} (${e.tax_rate}%)`;
        ewtSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Failed to load EWT:", err);
    ewtList = [];
    if (ewtSelect) ewtSelect.innerHTML = `<option value="">-- Select EWT --</option>`;
  }
}

// --- Load COA ---
async function loadCOA() {
  try {
    const res = await fetch("/api/coa");
    if (!res.ok) throw new Error("Failed to fetch COA");
    const data = await res.json();

    accounts = (data || []).map(a => ({
      id: Number(a.id),
      code: a.code || "",
      date: a.date || "",
      title: a.title || "",
      classType: a.class_type || "A",
      taxRate: Number(a.tax_rate ?? 0),
      ewtId: (a.ewt_id === null || a.ewt_id === undefined || a.ewt_id === "" || Number.isNaN(Number(a.ewt_id)))
        ? null
        : Number(a.ewt_id),
      archived: Number(a.archived || 0)
    }));

    refreshTable(getActiveTabName());
  } catch (err) {
    console.error("Failed to load COA:", err);
  }
}

// --- Save Account ---
saveBtn?.addEventListener("click", async (e) => {
  e.preventDefault();

  const code = (codeInput?.value || "").trim();
  const date = (dateInput?.value || "").trim();
  const title = (titleInput?.value || "").trim();

  if (!code || !date || !title) {
    return alert("Code, Date, and Title are required.");
  }

  // VAT
  let tax = taxRateSelect?.value ?? "0";
  if (tax === "custom") {
    const raw = (customTaxInput?.value || "").trim();
    if (!raw || isNaN(raw)) return alert("Enter a valid custom VAT.");
    tax = parseFloat(raw);
  } else {
    tax = parseFloat(tax);
  }

  const selectedEWT = ewtSelect?.value ? Number(ewtSelect.value) : null;

  const acc = {
    code,
    date,
    title,
    classType: classSelect?.value || "A",
    taxRate: tax,
    ewtId: selectedEWT
  };

  try {
    if (editingIndex !== null) {
      const id = accounts[editingIndex].id;

      const res = await fetch(`/api/coa/${id}`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: acc.code,
          date: acc.date,
          title: acc.title,
          class_type: acc.classType,
          tax_rate: acc.taxRate,
          ewt_id: acc.ewtId
        })
      });

      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch {}
        return alert(data.error || "Failed to update account.");
      }

      acc.id = id;
      acc.archived = accounts[editingIndex].archived;
      accounts[editingIndex] = acc;

    } else {
      const res = await fetch('/api/coa', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: acc.code,
          date: acc.date,
          title: acc.title,
          class_type: acc.classType,
          tax_rate: acc.taxRate,
          ewt_id: acc.ewtId
        })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) return alert(result.error || "Failed to create account.");

      acc.id = result.id;
      acc.archived = 0;
      accounts.push(acc);
    }

    refreshTable(getActiveTabName());
    disableForm();
    clearForm();
    editingIndex = null;

  } catch (err) {
    console.error(err);
    alert("Failed to save. Check console.");
  }
});

// --- Add / Edit / Cancel ---
addBtn?.addEventListener("click", () => {
  clearRowSelection();
  enableForm();
  clearForm();
  editingIndex = null;

  ensureDateFilled();     // ✅ auto-fill today
  codeInput?.focus();
});

editBtn?.addEventListener("click", () => {
  const idx = getSelectedRowIndex();
  if (idx === null) return alert("Select a row to edit!");

  enableForm();
  editingIndex = idx;

  const acc = accounts[editingIndex];

  codeInput.value = acc.code;
  dateInput.value = acc.date || "";
  titleInput.value = acc.title;
  classSelect.value = acc.classType;

  ensureDateFilled();

  if ([0, 1, 5, 12, 18].includes(Number(acc.taxRate))) {
    taxRateSelect.value = String(acc.taxRate);
    if (customTaxInput) {
      customTaxInput.style.display = "none";
      customTaxInput.value = "";
      customTaxInput.disabled = true;
    }
  } else {
    taxRateSelect.value = "custom";
    if (customTaxInput) {
      customTaxInput.style.display = "block";
      customTaxInput.value = String(acc.taxRate);
      customTaxInput.disabled = false;
    }
  }

  ewtSelect.value = acc.ewtId ? String(acc.ewtId) : "";
  codeInput?.focus();
});

cancelBtn?.addEventListener("click", () => {
  clearForm();
  disableForm();
  editingIndex = null;
});

// --- Delete (Bulk + Single) ---
deleteBtn?.addEventListener("click", async () => {
  const checked = [...document.querySelectorAll(".row-check:checked")];

  // BULK DELETE
  if (checked.length > 0) {
    if (!confirm(`Permanently delete ${checked.length} account(s)? This cannot be undone.`)) return;

    try {
      for (const cb of checked) {
        const id = cb.dataset.id;
        const res = await fetch(`/api/coa/${id}`, { method: "DELETE" });
        if (!res.ok) {
          let data = {};
          try { data = await res.json(); } catch {}
          alert(data.error || `Delete failed for ID ${id}`);
          // continue deleting others
        }
        const idx = accounts.findIndex(a => String(a.id) === String(id));
        if (idx !== -1) accounts.splice(idx, 1);
      }

      if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      }

      refreshTable(getActiveTabName());
      clearForm();
      disableForm();
      editingIndex = null;

    } catch (err) {
      console.error(err);
      alert("Hard delete failed.");
    }
    return;
  }

  // SINGLE DELETE (selected row)
  const idx = getSelectedRowIndex();
  if (idx === null) return alert("Select a row or use checkboxes.");

  const acc = accounts[idx];
  if (!confirm("Permanently delete this account? This cannot be undone.")) return;

  try {
    const res = await fetch(`/api/coa/${acc.id}`, { method: "DELETE" });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch {}
      return alert(data.error || "Hard delete failed.");
    }

    accounts.splice(idx, 1);
    refreshTable(getActiveTabName());
    clearForm();
    disableForm();
    editingIndex = null;

  } catch (err) {
    console.error(err);
    alert("Hard delete failed.");
  }
});

// --- Row selection + checkbox UX ---
tableBody?.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;

  // If user clicks checkbox, don't block selection, but handle counts
  const clickedCheckbox = e.target.classList?.contains("row-check");

  if (!isEditing) {
    clearRowSelection();
    tr.classList.add("row-selected");
  }

  // Clicking anywhere on row toggles checkbox (nice UX)
  if (!clickedCheckbox) {
    const cb = tr.querySelector(".row-check");
    if (cb && !isEditing) cb.checked = !cb.checked;
  }

  updateSelectedCount();
});

// Double click row -> edit
tableBody?.addEventListener("dblclick", () => {
  if (isEditing) return;
  editBtn?.click();
});

// Select All checkbox
selectAll?.addEventListener("change", () => {
  document.querySelectorAll(".row-check").forEach(cb => {
    cb.checked = selectAll.checked;
  });
  updateSelectedCount();
});

// --- Archive / Unarchive ---
async function archiveAccount(id) {
  if (!confirm("Archive this account?")) return;
  const res = await fetch(`/api/coa/archive/${id}`, { method: "PUT" });
  if (!res.ok) return alert("Archive failed.");
  const idx = accounts.findIndex(a => String(a.id) === String(id));
  if (idx !== -1) accounts[idx].archived = 1;
  refreshTable(getActiveTabName());
}

async function unarchiveAccount(id) {
  if (!confirm("Restore this account?")) return;
  const res = await fetch(`/api/coa/unarchive/${id}`, { method: "PUT" });
  if (!res.ok) return alert("Restore failed.");
  const idx = accounts.findIndex(a => String(a.id) === String(id));
  if (idx !== -1) accounts[idx].archived = 0;
  refreshTable("Archive");
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("archive-btn")) archiveAccount(e.target.dataset.id);
  if (e.target.classList.contains("unarchive-btn")) unarchiveAccount(e.target.dataset.id);
});

// --- Sorting (adds ▲▼ indicator with aria-sort, no HTML change required) ---
function clearSortIndicators() {
  tableHeaders.forEach(th => {
    th.removeAttribute("aria-sort");
    th.classList.remove("sorted-asc", "sorted-desc");
  });
}

tableHeaders.forEach(th => {
  th.addEventListener("click", () => {
    const column = th.dataset.sort;
    if (!column) return;

    if (sortColumn === column) sortAsc = !sortAsc;
    else { sortColumn = column; sortAsc = true; }

    clearSortIndicators();
    th.setAttribute("aria-sort", sortAsc ? "ascending" : "descending");
    th.classList.add(sortAsc ? "sorted-asc" : "sorted-desc");

    refreshTable(getActiveTabName());
  });
});

// --- Tabs ---
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelector(".tab.active")?.classList.remove("active");
    tab.classList.add("active");
    refreshTable(tab.textContent.trim());
  });
});

// --- Search ---
searchInput?.addEventListener("input", () => refreshTable(getActiveTabName()));
searchBtn?.addEventListener("click", () => refreshTable(getActiveTabName()));

// Keyboard shortcuts (optional, matches your F-keys idea)
// Enter = Edit, Del = Delete, Esc = Cancel, Ctrl+F = focus search
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    searchInput?.focus();
    return;
  }

  if (e.key === "Escape") {
    if (isEditing) cancelBtn?.click();
    else {
      clearRowSelection();
      document.querySelectorAll(".row-check").forEach(cb => cb.checked = false);
      if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      }
      updateSelectedCount();
    }
    return;
  }

  // Avoid deleting while typing in inputs
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  const isTyping = tag === "input" || tag === "textarea" || tag === "select";

  if (!isTyping && !isEditing && (e.key === "Delete" || e.key === "Backspace")) {
    const anyChecked = document.querySelectorAll(".row-check:checked").length > 0;
    const hasSelected = !!getSelectedRowEl();
    if (anyChecked || hasSelected) deleteBtn?.click();
  }

  if (!isTyping && !isEditing && e.key === "Enter") {
    const hasSelected = !!getSelectedRowEl();
    if (hasSelected) editBtn?.click();
  }
});

// --- Refresh Table ---
function refreshTable(filter = "All Accounts") {
  tableBody.innerHTML = "";

  const search = (searchInput?.value || "").trim().toLowerCase();
  const isArchiveTab = filter === "Archive";

  let filtered = accounts.filter(acc => {
    const className = letterToClass(acc.classType);

    if (isArchiveTab && acc.archived != 1) return false;
    if (!isArchiveTab && acc.archived == 1) return false;

    const matchesTab = filter === "All Accounts" || filter === "Archive" || className === filter;

    const matchesSearch =
      (acc.code || "").toLowerCase().includes(search) ||
      (acc.title || "").toLowerCase().includes(search) ||
      className.toLowerCase().includes(search) ||
      String(acc.taxRate ?? "").includes(search);

    return matchesTab && matchesSearch;
  });

  if (sortColumn) {
    filtered.sort((a, b) => {
      let valA = a[sortColumn], valB = b[sortColumn];

      if (sortColumn === "taxRate") {
        valA = parseFloat(valA ?? 0); valB = parseFloat(valB ?? 0);
      } else if (sortColumn === "classType") {
        valA = letterToClass(valA); valB = letterToClass(valB);
      } else if (sortColumn === "ewtId") {
        valA = Number(valA ?? -1); valB = Number(valB ?? -1);
      } else {
        valA = String(valA ?? "").toLowerCase();
        valB = String(valB ?? "").toLowerCase();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  filtered.forEach(acc => {
    const taxLabel = Number(acc.taxRate) === 0 ? "Tax Exempt (0%)" : `${parseFloat(acc.taxRate)}%`;

    const ewtLabel = (() => {
      if (!acc.ewtId) return "-";
      const e = ewtList.find(x => Number(x.id) === Number(acc.ewtId));
      if (!e) return `EWT#${acc.ewtId}`;
      return `${escapeHtml(e.code)} (${e.tax_rate}%)`;
    })();

    const tr = document.createElement("tr");
    tr.dataset.index = String(accounts.indexOf(acc));

    tr.innerHTML = `
      <td>
        <input type="checkbox" class="row-check" data-id="${escapeHtml(acc.id)}">
      </td>
      <td>${escapeHtml(acc.code)}</td>
      <td>${escapeHtml(acc.title)}</td>
      <td>${escapeHtml(letterToClass(acc.classType))}</td>
      <td>${escapeHtml(taxLabel)}</td>
      <td>${ewtLabel}</td>
    `;

    tableBody.appendChild(tr);
  });

  setMeta({ shown: filtered.length });
  updateSelectedCount();

  if (emptyState) emptyState.style.display = filtered.length ? "none" : "block";

  // Keep current selected row if still present, otherwise clear
  // (we keep it simple: if row-selected is missing after refresh, clear)
  if (!document.querySelector(".row-selected")) {
    // nothing
  }
}

// -- Import Button ---
importBtn?.addEventListener("click", () => {
  window.location.href = "/coaImport.html";
});

// Optional print (if you implement later)
printBtn?.addEventListener("click", () => {
  window.print();
});

// --- Initialization ---
async function initCOA() {
  disableForm();
  clearForm();
  setMeta({ shown: 0, selected: 0 });

  await loadEWT();
  await loadCOA();
}
initCOA();
