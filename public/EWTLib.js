// ===============================
// public/EWTLib.js (COA-style UX + Meta Pills)
// ===============================
'use strict';

const code = document.getElementById("code");
const nature = document.getElementById("nature");
const taxRate = document.getElementById("taxRate");

const btnAdd = document.getElementById("btnAdd");
const btnEdit = document.getElementById("btnEdit");
const btnDelete = document.getElementById("btnDelete");
const btnImport = document.getElementById("btnImport");
const btnPrint = document.getElementById("btnPrint"); // optional
const btnSave = document.getElementById("btnSave");
const btnCancel = document.getElementById("btnCancel");

const tableBody = document.getElementById("ewtTableBody");

const searchInput = document.getElementById("search");
const searchFilter = document.getElementById("searchFilter");
const btnSearch = document.getElementById("btnSearch");

// ✅ Meta pills (like COA)
const shownCountEl = document.getElementById("shownCount");
const selectedCountEl = document.getElementById("selectedCount");

let ewtList = [];
let selectedId = null;     // COA-style: keep stable selection
let isEditing = false;
let mode = "";             // 'add' or 'edit'

// ------------------ Meta helpers ------------------
function setMeta({ shown = null, selected = null } = {}) {
  if (shownCountEl && shown !== null) shownCountEl.textContent = String(shown);
  if (selectedCountEl && selected !== null) selectedCountEl.textContent = String(selected);
}

function updateSelectedMeta() {
  setMeta({ selected: selectedId ? 1 : 0 });
}

// ------------------ Utils ------------------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function formatPercent(val) {
  if (val === "" || val === null || val === undefined) return "";
  const num = parseFloat(String(val).replace("%", ""));
  if (Number.isNaN(num)) return "";
  const out = (num % 1 === 0) ? num.toFixed(0) : String(num);
  return out + "%";
}

function parsePercent(val) {
  const num = parseFloat(String(val || "").replace("%", "").trim());
  return Number.isNaN(num) ? 0 : num;
}

// ------------------ Form Control (COA pattern) ------------------
function disableForm() {
  isEditing = false;

  [code, nature, taxRate].forEach(el => { if (el) el.disabled = true; });

  if (btnAdd) btnAdd.disabled = false;
  if (btnEdit) btnEdit.disabled = false;
  if (btnDelete) btnDelete.disabled = false;
  if (btnImport) btnImport.disabled = false;
  if (btnPrint) btnPrint.disabled = false;

  if (btnSave) btnSave.disabled = true;
  if (btnCancel) btnCancel.disabled = true;
}

function enableForm() {
  isEditing = true;

  [code, nature, taxRate].forEach(el => { if (el) el.disabled = false; });

  if (btnSave) btnSave.disabled = false;
  if (btnCancel) btnCancel.disabled = false;

  if (btnAdd) btnAdd.disabled = true;
  if (btnEdit) btnEdit.disabled = true;
  if (btnDelete) btnDelete.disabled = true;
  if (btnImport) btnImport.disabled = true;
  if (btnPrint) btnPrint.disabled = true;
}

function clearForm() {
  if (code) code.value = "";
  if (nature) nature.value = "";
  if (taxRate) taxRate.value = "";
}

function clearRowSelection() {
  selectedId = null;
  document.querySelectorAll("#ewtTableBody tr").forEach(tr => tr.classList.remove("row-selected"));
  updateSelectedMeta(); // ✅
}

function setRowSelected(id) {
  selectedId = String(id);
  document.querySelectorAll("#ewtTableBody tr").forEach(tr => {
    tr.classList.toggle("row-selected", tr.dataset.id === String(id));
  });
  updateSelectedMeta(); // ✅
}

function getSelectedItem() {
  if (!selectedId) return null;
  return ewtList.find(x => String(x.id) === String(selectedId)) || null;
}

function fillFormFromItem(item) {
  if (!item) return;
  code.value = item.code || "";
  nature.value = item.nature || "";
  taxRate.value = formatPercent(item.tax_rate);
}

// ------------------ Load EWT from backend ------------------
async function loadEWT() {
  try {
    const res = await fetch("/api/ewt");
    if (!res.ok) throw new Error("Failed to fetch EWT");
    const data = await res.json();

    ewtList = (data || []).map(e => ({
      id: e.id,
      code: e.code ?? "",
      nature: e.nature ?? "",
      tax_rate: Number(e.tax_rate ?? 0)
    }));

    refreshTable(); // COA pattern
  } catch (err) {
    console.error("Failed to load EWT:", err);
    alert("Failed to load EWT library.");
  }
}

// ------------------ Refresh Table (COA-style) ------------------
function refreshTable() {
  tableBody.innerHTML = "";

  const term = (searchInput?.value || "").trim().toLowerCase();
  const filterBy = (searchFilter?.value || "code");

  let filtered = ewtList;

  if (term) {
    filtered = ewtList.filter(item => {
      if (filterBy === "code") return String(item.code || "").toLowerCase().includes(term);
      if (filterBy === "nature") return String(item.nature || "").toLowerCase().includes(term);
      return false;
    });
  }

  filtered.forEach(item => {
    const tr = document.createElement("tr");
    tr.dataset.id = String(item.id);

    tr.innerHTML = `
      <td>${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.nature)}</td>
      <td>${escapeHtml(formatPercent(item.tax_rate))}</td>
    `;

    tableBody.appendChild(tr);
  });

  // ✅ meta shown
  setMeta({ shown: filtered.length });

  // keep highlight if still present
  if (selectedId) setRowSelected(selectedId);
  else updateSelectedMeta();
}

// ------------------ Row selection (COA-style) ------------------
tableBody?.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;

  if (!isEditing) {
    clearRowSelection();
    tr.classList.add("row-selected");
    selectedId = tr.dataset.id;
    fillFormFromItem(getSelectedItem());
    updateSelectedMeta(); // ✅
  }
});

// Double click row -> edit
tableBody?.addEventListener("dblclick", () => {
  if (isEditing) return;
  btnEdit?.click();
});

// ------------------ Auto % Formatting ------------------
taxRate?.addEventListener("blur", () => {
  taxRate.value = formatPercent(taxRate.value);
});

// ------------------ Add / Edit / Cancel ------------------
btnAdd?.addEventListener("click", () => {
  clearRowSelection();
  enableForm();
  clearForm();
  mode = "add";
  code?.focus();
});

btnEdit?.addEventListener("click", () => {
  const item = getSelectedItem();
  if (!item) return alert("Please select a row to edit.");

  enableForm();
  mode = "edit";
  fillFormFromItem(item);
  code?.focus();
});

btnCancel?.addEventListener("click", () => {
  clearForm();
  disableForm();
  mode = "";
});

// ------------------ Save ------------------
btnSave?.addEventListener("click", async () => {
  const payload = {
    code: (code.value || "").trim(),
    nature: (nature.value || "").trim(),
    taxRate: parsePercent(taxRate.value)
  };

  if (!payload.code || !payload.nature) {
    return alert("Code and Nature of Income are required.");
  }

  try {
    if (mode === "add") {
      const res = await fetch("/api/ewt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("POST /api/ewt failed");
    } else if (mode === "edit") {
      const item = getSelectedItem();
      if (!item) return alert("Select a row to update.");

      const res = await fetch(`/api/ewt/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("PUT /api/ewt/:id failed");
    }

    await loadEWT();
    clearForm();
    clearRowSelection();
    disableForm();
    mode = "";

  } catch (err) {
    console.error("Failed to save EWT:", err);
    alert("Failed to save EWT.");
  }
});

// ------------------ Delete ------------------
btnDelete?.addEventListener("click", async () => {
  const item = getSelectedItem();
  if (!item) return alert("Please select a row to delete.");

  if (!confirm("Delete selected EWT? This cannot be undone.")) return;

  try {
    const res = await fetch(`/api/ewt/${item.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("DELETE /api/ewt/:id failed");

    await loadEWT();
    clearForm();
    clearRowSelection();
    disableForm();
    mode = "";

  } catch (err) {
    console.error("Failed to delete EWT:", err);
    alert("Failed to delete EWT.");
  }
});

// ------------------ Import / Print ------------------
btnImport?.addEventListener("click", () => {
  window.location.href = "/EWTImport.html";
});

btnPrint?.addEventListener("click", () => {
  window.print();
});

// ------------------ Search (COA-style) ------------------
searchInput?.addEventListener("input", () => refreshTable());
btnSearch?.addEventListener("click", () => refreshTable());

// ------------------ Keyboard shortcuts (same as COA) ------------------
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    searchInput?.focus();
    return;
  }

  if (e.key === "Escape") {
    if (isEditing) btnCancel?.click();
    else {
      clearRowSelection();
      clearForm();
    }
    return;
  }

  const tag = (document.activeElement?.tagName || "").toLowerCase();
  const isTyping = tag === "input" || tag === "textarea" || tag === "select";

  if (!isTyping && !isEditing && (e.key === "Delete" || e.key === "Backspace")) {
    if (selectedId) btnDelete?.click();
  }

  if (!isTyping && !isEditing && e.key === "Enter") {
    if (selectedId) btnEdit?.click();
  }
});

// ------------------ Init ------------------
function initEWT() {
  disableForm();
  clearForm();
  clearRowSelection();
  setMeta({ shown: 0, selected: 0 }); // ✅ init pills
  loadEWT();
}
initEWT();
