// public/COA.js

const codeInput = document.getElementById("codeInput");
const dateInput = document.getElementById("dateInput");
const titleInput = document.getElementById("titleInput");
const classSelect = document.getElementById("classSelect");
const taxRateSelect = document.getElementById("taxRateSelect");
const customTaxInput = document.getElementById("customTaxInput");

const addBtn = document.getElementById("addBtn");
const editBtn = document.getElementById("editBtn");
const deleteBtn = document.getElementById("deleteBtn");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");

const tableBody = document.querySelector(".coa-table tbody");
const tabs = document.querySelectorAll(".tab");

let accounts = [];
let editingIndex = null;

// --- Form Control ---
disableForm();

function disableForm() {
  codeInput.disabled = true;
  dateInput.disabled = true;
  titleInput.disabled = true;
  classSelect.disabled = true;
  taxRateSelect.disabled = true;
  customTaxInput.disabled = true;
}

function enableForm() {
  codeInput.disabled = false;
  dateInput.disabled = false;
  titleInput.disabled = false;
  classSelect.disabled = false;
  taxRateSelect.disabled = false;
  customTaxInput.disabled = false;
}

function clearForm() {
  codeInput.value = "";
  dateInput.value = "";
  titleInput.value = "";
  classSelect.value = "ASSET";
  taxRateSelect.value = "0";
  customTaxInput.value = "";
  customTaxInput.style.display = "none";
}

// Show custom VAT input when needed
taxRateSelect.addEventListener("change", () => {
  if (taxRateSelect.value === "custom") {
    customTaxInput.style.display = "block";
    customTaxInput.focus();
  } else {
    customTaxInput.style.display = "none";
    customTaxInput.value = "";
  }
});

// --- Load COA from backend ---
async function loadCOA() {
  try {
    const res = await fetch('/api/coa');
    const data = await res.json();
    accounts = data.map(acc => ({
      id: acc.id,
      code: acc.code,
      date: acc.date || "",
      title: acc.description,
      classType: acc.type,
      taxRate: acc.tax_rate || "0"
    }));
    refreshTable(document.querySelector(".tab.active").textContent.trim());
  } catch (err) {
    console.error("Failed to load COA:", err);
  }
}

loadCOA();

// --- ADD ---
addBtn.addEventListener("click", () => {
  enableForm();
  clearForm();
  editingIndex = null;
});

// --- EDIT ---
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

  if (["0", "1", "5", "12", "18"].includes(acc.taxRate)) {
    taxRateSelect.value = acc.taxRate;
    customTaxInput.style.display = "none";
  } else {
    taxRateSelect.value = "custom";
    customTaxInput.style.display = "block";
    customTaxInput.value = acc.taxRate;
  }
});

// --- DELETE ---
deleteBtn.addEventListener("click", async () => {
  const selected = document.querySelector(".row-selected");
  if (!selected) return alert("Select a row to delete!");
  const index = selected.dataset.index;
  const acc = accounts[index];

  if (confirm("Are you sure you want to delete this account?")) {
    await fetch(`/api/coa/${acc.id}`, { method: "DELETE" });
    accounts.splice(index, 1);
    refreshTable(document.querySelector(".tab.active").textContent.trim());
    editingIndex = null;
    clearForm();
    disableForm();
  }
});

// --- Select row ---
tableBody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;

  document.querySelectorAll(".row-selected")
    .forEach(row => row.classList.remove("row-selected"));

  tr.classList.add("row-selected");
});

// --- SAVE ---
saveBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  if (!codeInput.value.trim()) return alert("Code is required.");
  if (!dateInput.value.trim()) return alert("Date is required.");
  if (!titleInput.value.trim()) return alert("Title is required.");

  let tax = taxRateSelect.value;
  if (tax === "custom") {
    if (customTaxInput.value.trim() === "" || isNaN(customTaxInput.value)) {
      return alert("Enter a valid custom VAT (decimals allowed).");
    }
    tax = parseFloat(customTaxInput.value).toString();
  }

  const acc = {
    code: codeInput.value,
    date: dateInput.value,
    title: titleInput.value,
    classType: classSelect.value,
    taxRate: tax
  };

  try {
    if (editingIndex !== null) {
      // Update existing record
      const id = accounts[editingIndex].id;
      await fetch(`/api/coa/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: acc.code,
          description: acc.title,
          type: acc.classType,
          tax_rate: acc.taxRate
        })
      });
      acc.id = id;
      accounts[editingIndex] = acc;
    } else {
      // Add new record
      const res = await fetch('/api/coa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: acc.code,
          description: acc.title,
          type: acc.classType,
          tax_rate: acc.taxRate
        })
      });
      const result = await res.json();
      acc.id = result.id;
      accounts.push(acc);
    }

    refreshTable(document.querySelector(".tab.active").textContent.trim());
    disableForm();
    clearForm();
  } catch (err) {
    console.error("Failed to save COA:", err);
    alert("Failed to save. Check console.");
  }
});

// --- CANCEL ---
cancelBtn.addEventListener("click", () => {
  clearForm();
  disableForm();
  editingIndex = null;
});

// --- TABLE REFRESH ---
function refreshTable(filter = "All Accounts") {
  tableBody.innerHTML = "";

  accounts.forEach((acc, index) => {
    if (filter !== "All Accounts" && acc.classType !== convertFilterName(filter)) return;

    const tr = document.createElement("tr");
    tr.dataset.index = index;

    const taxLabel = acc.taxRate === "0" 
      ? "Tax Exempt (0%)" 
      : parseFloat(acc.taxRate) + "%";

    tr.innerHTML = `
      <td>${acc.code}</td>
      <td>${acc.title}</td>
      <td>${acc.classType}</td>
      <td>${taxLabel}</td>
    `;

    tableBody.appendChild(tr);
  });
}

function convertFilterName(name) {
  switch (name) {
    case "Assets": return "ASSET";
    case "Liabilities": return "LIABILITY";
    case "Equity": return "EQUITY";
    case "Expenses": return "EXPENSE";
    case "Revenue": return "REVENUE";
    default: return "All Accounts";
  }
}

// --- TABS ---
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelector(".tab.active").classList.remove("active");
    tab.classList.add("active");

    refreshTable(tab.textContent.trim());
  });
});
