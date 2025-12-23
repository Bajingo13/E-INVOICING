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
  "E": "Expenses",
  "L": "Liabilities",
  "I": "Revenue",
  "C": "Equity"
};

function letterToClass(letter) { return CLASS_MAP[letter] || letter; }
function classToLetter(name) {
  for (let key in CLASS_MAP) { if (CLASS_MAP[key] === name) return key; }
  return name;
}

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
    const res = await fetch("/api/ewt"); // Must return JSON: [{id, code, rate, nature_of_income}]
    ewtList = await res.json();

    ewtSelect.innerHTML = `<option value="">-- Select EWT --</option>`;
    ewtList.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = `${e.code} - ${e.nature_of_income} (${e.rate}%)`;
      ewtSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load EWT:", err);
  }
}

// --- Load COA ---
async function loadCOA() {
  try {
    const res = await fetch('/api/coa');
    const data = await res.json();

    accounts = data.map(acc => ({
      id: acc.id,
      code: acc.code,
      date: acc.date || "",
      title: acc.title,
      classType: acc.class_type,
      taxRate: acc.tax_rate || "0",
      ewtId: acc.ewt_id || null, // consistent naming
      archived: acc.archived || 0
    }));

    refreshTable(document.querySelector(".tab.active").textContent.trim());
  } catch (err) {
    console.error("Failed to load COA:", err);
  }
}

// --- Initial load ---
loadEWT();
loadCOA();

// --- Add / Edit ---
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

  // Tax rate
  if (["0","1","5","12","18"].includes(acc.taxRate)) {
    taxRateSelect.value = acc.taxRate;
    customTaxInput.style.display = "none";
  } else {
    taxRateSelect.value = "custom";
    customTaxInput.style.display = "block";
    customTaxInput.value = acc.taxRate;
  }

  // EWT
  ewtSelect.value = acc.ewtId || "";
});

// --- Delete ---
deleteBtn.addEventListener("click", async () => {
  const selected = document.querySelector(".row-selected");
  if (!selected) return alert("Select a row to delete!");
  const acc = accounts[selected.dataset.index];
  if (!confirm("Are you sure you want to delete this account?")) return;

  await fetch(`/api/coa/${acc.id}`, { method: "DELETE" });
  accounts.splice(selected.dataset.index,1);
  refreshTable(document.querySelector(".tab.active").textContent.trim());
  editingIndex = null;
  clearForm();
  disableForm();
});

// --- Row selection ---
tableBody.addEventListener("click", e => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  document.querySelectorAll(".row-selected").forEach(r=>r.classList.remove("row-selected"));
  tr.classList.add("row-selected");
});

// --- Save ---
saveBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!codeInput.value.trim() || !dateInput.value.trim() || !titleInput.value.trim())
    return alert("Code, Date, and Title are required.");

  let tax = taxRateSelect.value;
  if (tax === "custom") {
    if (customTaxInput.value.trim() === "" || isNaN(customTaxInput.value))
      return alert("Enter a valid custom VAT.");
    tax = parseFloat(customTaxInput.value).toString();
  }

  const acc = {
    code: codeInput.value,
    date: dateInput.value,
    title: titleInput.value,
    classType: classSelect.value,
    taxRate: tax,
    ewtId: ewtSelect.value || null
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
          tax_rate: acc.taxRate,
          ewt_id: acc.ewtId
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
          tax_rate: acc.taxRate,
          ewt_id: acc.ewtId
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
  } catch(err) {
    console.error(err);
    alert("Failed to save. Check console.");
  }
});

// --- Cancel ---
cancelBtn.addEventListener("click", () => { clearForm(); disableForm(); editingIndex = null; });

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

// --- Import button ---
document.getElementById("importBtn").addEventListener("click", () => {
  window.location.href = "coaImport.html";
});

// --- Refresh table ---
function refreshTable(filter="All Accounts") {
  tableBody.innerHTML = "";
  const search = searchInput.value.trim().toLowerCase();
  const isArchiveTab = filter === "Archive";

  let filtered = accounts.filter(acc => {
    const className = letterToClass(acc.classType);
    if (isArchiveTab && acc.archived != 1) return false;
    if (!isArchiveTab && acc.archived == 1) return false;

    const matchesTab = filter === "All Accounts" || filter === "Archive" || className === filter;
    const matchesSearch = acc.code.toLowerCase().includes(search) || acc.title.toLowerCase().includes(search) || className.toLowerCase().includes(search) || acc.taxRate.toString().includes(search);

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
    const tr = document.createElement("tr");
    tr.dataset.index = accounts.indexOf(acc);

    const taxLabel = acc.taxRate === "0" ? "Tax Exempt (0%)" : parseFloat(acc.taxRate) + "%";

    let ewtLabel = "-";
    if (acc.ewtId) {
      const ewt = ewtList.find(e => String(e.id) === String(acc.ewtId));
      if (ewt) ewtLabel = `${ewt.code} (${ewt.rate}%)`;
    }

    tr.innerHTML = `
      <td>${acc.code}</td>
      <td>${acc.title}</td>
      <td>${letterToClass(acc.classType)}</td>
      <td>${taxLabel}</td>
      <td>${ewtLabel}</td>
      <td>${isArchiveTab 
            ? `<button class="tb-btn unarchive-btn" data-id="${acc.id}">Unarchive</button>` 
            : `<button class="tb-btn archive-btn" data-id="${acc.id}">Archive</button>`}
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

// --- Search events ---
searchInput.addEventListener("input", () => refreshTable(document.querySelector(".tab.active").textContent.trim()));
searchBtn.addEventListener("click", () => refreshTable(document.querySelector(".tab.active").textContent.trim()));
