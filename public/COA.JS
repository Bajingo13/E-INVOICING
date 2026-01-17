// ===============================
// public/COA.js
// ===============================

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

let accounts = [];
let ewtList = [];
let editingIndex = null;
let sortColumn = null;
let sortAsc = true;

// --- Class type mapping ---
const CLASS_MAP = {
  "A": "Assets",
  "L": "Liabilities",
  "C": "Equity",
  "I": "Revenue",
  "E": "Expenses"
};

function letterToClass(letter) { return CLASS_MAP[letter] || letter; }

// --- Form Control ---
disableForm();
function disableForm() {
  [codeInput, dateInput, titleInput, classSelect, taxRateSelect, customTaxInput, ewtSelect].forEach(el => el.disabled = true);
}
function enableForm() {
  [codeInput, dateInput, titleInput, classSelect, taxRateSelect, customTaxInput, ewtSelect].forEach(el => el.disabled = false);
}
function clearForm() {
  codeInput.value = "";
  dateInput.value = "";
  titleInput.value = "";
  classSelect.value = "A";
  taxRateSelect.value = "0";
  customTaxInput.value = "";
  customTaxInput.style.display = "none";
  ewtSelect.value = "";
}

// --- Tax Rate change ---
taxRateSelect.addEventListener("change", () => {
  if (taxRateSelect.value === "custom") {
    customTaxInput.style.display = "block";
    customTaxInput.focus();
  } else {
    customTaxInput.style.display = "none";
    customTaxInput.value = "";
  }
});

// --- Load EWT ---
async function loadEWT() {
  try {
    const res = await fetch("/api/ewt");
    ewtList = await res.json();
    ewtSelect.innerHTML = `<option value="">-- Select EWT --</option>`;
    ewtList.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = `${e.code} (${e.tax_rate}%)`;
      ewtSelect.appendChild(opt);
    });
  } catch (err) { console.error("Failed to load EWT:", err); }
}

// --- Load COA ---
async function loadCOA() {
  try {
    const res = await fetch("/api/coa");
    const data = await res.json();
    accounts = data.map(a => ({
      id: a.id,
      code: a.code,
      date: a.date || "",
      title: a.title,
      classType: a.class_type,
      taxRate: a.tax_rate,
      ewtId: a.ewt_id || null,
      archived: a.archived || 0
    }));
    refreshTable(document.querySelector(".tab.active").textContent.trim());
  } catch (err) { console.error("Failed to load COA:", err); }
}


// --- Save Account ---
saveBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!codeInput.value.trim() || !dateInput.value.trim() || !titleInput.value.trim()) {
    return alert("Code, Date, and Title are required.");
  }

  // --- Get tax rate (VAT) ---
  let tax = taxRateSelect.value;
  if (tax === "custom") {
    if (customTaxInput.value.trim() === "" || isNaN(customTaxInput.value)) {
      return alert("Enter a valid custom VAT.");
    }
    tax = parseFloat(customTaxInput.value);
  } else {
    tax = parseFloat(tax); // convert standard option to number
  }

  // --- Get EWT selection ---
  const selectedEWT = ewtSelect.value || null;

  const acc = {
    code: codeInput.value,
    date: dateInput.value,
    title: titleInput.value,
    classType: classSelect.value,
    taxRate: tax,
    ewtId: selectedEWT
  };

  try {
    if (editingIndex !== null) {
      const id = accounts[editingIndex].id;
      await fetch(`/api/coa/${id}`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: acc.code,
          date: acc.date,
          title: acc.title,
          class_type: acc.classType,
          tax_rate: acc.taxRate,   // only VAT
          ewt_id: acc.ewtId        // only EWT
        })
      });
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
          tax_rate: acc.taxRate,   // only VAT
          ewt_id: acc.ewtId        // only EWT
        })
      });
      const result = await res.json();
      acc.id = result.id;
      acc.archived = 0;
      accounts.push(acc);
    }

    refreshTable(document.querySelector(".tab.active").textContent.trim());
    disableForm();
    clearForm();
    editingIndex = null;
  } catch(err) {
    console.error(err);
    alert("Failed to save. Check console.");
  }
});


const importBtn = document.getElementById("importBtn");

if (importBtn) {
  importBtn.addEventListener("click", () => {
    window.location.href = "/coaImport.html"; // or whatever route you use
  });
}


// --- Add / Edit / Cancel Buttons ---
addBtn.addEventListener("click", () => { enableForm(); clearForm(); editingIndex = null; });

editBtn.addEventListener("click", () => {
  const selected = document.querySelector(".row-selected");
  if (!selected) return alert("Select a row to edit!");
  enableForm();
  editingIndex = selected.dataset.index;
  const acc = accounts[editingIndex];

  codeInput.value = acc.code;
  dateInput.value = acc.date;
  titleInput.value = acc.title;
  classSelect.value = acc.classType;

  if ([0,1,5,12,18].includes(Number(acc.taxRate))) {
    taxRateSelect.value = acc.taxRate;
    customTaxInput.style.display = "none";
  } else {
    taxRateSelect.value = "custom";
    customTaxInput.style.display = "block";
    customTaxInput.value = acc.taxRate;
  }

  ewtSelect.value = acc.ewtId || "";
});

cancelBtn.addEventListener("click", () => { clearForm(); disableForm(); editingIndex = null; });

// --- Delete ---
deleteBtn.addEventListener("click", async () => {
  const checked = [...document.querySelectorAll(".row-check:checked")];

  // =========================
  // HARD BULK DELETE
  // =========================
  if (checked.length > 0) {
    if (!confirm(`Permanently delete ${checked.length} account(s)? This cannot be undone.`)) {
      return;
    }

    try {
      for (const cb of checked) {
        await fetch(`/api/coa/${cb.dataset.id}`, { method: "DELETE" });

        const idx = accounts.findIndex(a => a.id == cb.dataset.id);
        if (idx !== -1) accounts.splice(idx, 1);
      }

      document.getElementById("selectAll").checked = false;
      refreshTable(document.querySelector(".tab.active").textContent.trim());
      clearForm();
      disableForm();
      editingIndex = null;

    } catch (err) {
      console.error(err);
      alert("Hard delete failed.");
    }
    return;
  }

  // =========================
  // HARD SINGLE DELETE
  // =========================
  const selected = document.querySelector(".row-selected");
  if (!selected) {
    return alert("Select a row or use checkboxes.");
  }

  const acc = accounts[selected.dataset.index];

  if (!confirm("Permanently delete this account? This cannot be undone.")) {
    return;
  }

  try {
    await fetch(`/api/coa/${acc.id}`, { method: "DELETE" });
    accounts.splice(selected.dataset.index, 1);

    refreshTable(document.querySelector(".tab.active").textContent.trim());
    clearForm();
    disableForm();
    editingIndex = null;

  } catch (err) {
    console.error(err);
    alert("Hard delete failed.");
  }
});


// --- Row selection ---
tableBody.addEventListener("click", e => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  document.querySelectorAll(".row-selected").forEach(r=>r.classList.remove("row-selected"));
  tr.classList.add("row-selected");
});

// --- Archive / Unarchive ---
async function archiveAccount(id) {
  if (!confirm("Archive this account?")) return;
  await fetch(`/api/coa/archive/${id}`, { method: "PUT" });
  const idx = accounts.findIndex(a => a.id == id);
  accounts[idx].archived = 1;
  refreshTable(document.querySelector(".tab.active").textContent.trim());
}

async function unarchiveAccount(id) {
  if (!confirm("Restore this account?")) return;
  await fetch(`/api/coa/unarchive/${id}`, { method: "PUT" });
  const idx = accounts.findIndex(a => a.id == id);
  accounts[idx].archived = 0;
  refreshTable("Archive");
}

document.addEventListener("click", e => {
  if (e.target.classList.contains("archive-btn")) archiveAccount(e.target.dataset.id);
  if (e.target.classList.contains("unarchive-btn")) unarchiveAccount(e.target.dataset.id);
});

// --- Sorting ---
tableHeaders.forEach(th => {
  th.addEventListener("click", () => {
    const column = th.dataset.sort;
    if (!column) return;
    if (sortColumn === column) sortAsc = !sortAsc;
    else { sortColumn = column; sortAsc = true; }
    refreshTable(document.querySelector(".tab.active").textContent.trim());
  });
});

// --- Tabs ---
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelector(".tab.active").classList.remove("active");
    tab.classList.add("active");
    refreshTable(tab.textContent.trim());
  });
});

// --- Search ---
searchInput.addEventListener("input", () => refreshTable(document.querySelector(".tab.active").textContent.trim()));
searchBtn.addEventListener("click", () => refreshTable(document.querySelector(".tab.active").textContent.trim()));

// --- Refresh Table ---
function refreshTable(filter="All Accounts") {
  tableBody.innerHTML = "";
  const search = searchInput.value.trim().toLowerCase();
  const isArchiveTab = filter === "Archive";

  let filtered = accounts.filter(acc => {
    const className = letterToClass(acc.classType);
    if (isArchiveTab && acc.archived != 1) return false;
    if (!isArchiveTab && acc.archived == 1) return false;

    const matchesTab = filter === "All Accounts" || filter === "Archive" || className === filter;
    const matchesSearch = acc.code.toLowerCase().includes(search) ||
                          acc.title.toLowerCase().includes(search) ||
                          className.toLowerCase().includes(search) ||
                          String(acc.taxRate).includes(search);

    return matchesTab && matchesSearch;
  });

  if (sortColumn) {
    filtered.sort((a,b) => {
      let valA = a[sortColumn], valB = b[sortColumn];
      if (sortColumn === "taxRate") { valA = parseFloat(valA); valB = parseFloat(valB); }
      else if (sortColumn === "classType") { valA = letterToClass(valA); valB = letterToClass(valB); }
      else { valA = valA.toString().toLowerCase(); valB = valB.toString().toLowerCase(); }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }

 filtered.forEach(acc => {
  const taxLabel = acc.taxRate == 0 ? "Tax Exempt (0%)" : parseFloat(acc.taxRate) + "%";

  // Map ewtId to ewt code and tax
  const ewtLabel = acc.ewtId
    ? (() => {
        const e = ewtList.find(x => Number(x.id) === Number(acc.ewtId));
        return e ? `${e.code} (${e.tax_rate}%)` : "-";
      })()
    : "-";

  const tr = document.createElement("tr");
  tr.dataset.index = accounts.indexOf(acc);
  tr.innerHTML = `
  <td>
    <input type="checkbox"
           class="row-check"
           data-id="${acc.id}">
  </td>
  <td>${acc.code}</td>
  <td>${acc.title}</td>
  <td>${letterToClass(acc.classType)}</td>
  <td>${taxLabel}</td>
  <td>${ewtLabel}</td>
`;

  tableBody.appendChild(tr);
});
}
// --- Select All Checkbox ---
const selectAll = document.getElementById("selectAll");

selectAll.addEventListener("change", () => {
  document.querySelectorAll(".row-check").forEach(cb => {
    cb.checked = selectAll.checked;
  });
});


// --- Initialization ---
async function initCOA() {
  await loadEWT();  // populate ewtList
  await loadCOA();  // map ewtId to label
}
initCOA();