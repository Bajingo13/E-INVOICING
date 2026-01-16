const code = document.getElementById("code");
const nature = document.getElementById("nature");
const taxRate = document.getElementById("taxRate");

const btnAdd = document.getElementById("btnAdd");
const btnEdit = document.getElementById("btnEdit");
const btnDelete = document.getElementById("btnDelete");
const btnSave = document.getElementById("btnSave");
const btnCancel = document.getElementById("btnCancel");

const tableBody = document.getElementById("ewtTableBody");

let ewtList = [];
let editingIndex = null;
let mode = ""; // 'add' or 'edit'

// ------------------ Helpers ------------------
function disableFields(state) {
    code.disabled = state;
    nature.disabled = state;
    taxRate.disabled = state;
}

function disableSaveCancel(state) {
    btnSave.disabled = state;
    btnCancel.disabled = state;
}

function formatPercent(val) {
    if (val === "") return "";
    let num = parseFloat(val.toString().replace("%", ""));
    return isNaN(num) ? "" : num + "%";
}

// ------------------ Initial Setup ------------------
disableFields(true);
disableSaveCancel(true);

// ------------------ Load EWT from backend ------------------
async function loadEWT() {
    try {
        const res = await fetch("/api/ewt");
        ewtList = await res.json();
        renderTable();
    } catch (err) {
        console.error("Failed to load EWT:", err);
        alert("Failed to load EWT library.");
    }
}

// ------------------ Render Table ------------------
function renderTable() {
    tableBody.innerHTML = "";
    ewtList.forEach((item, index) => {
        const row = `
            <tr onclick="selectRow(${index})">
                <td>${item.code}</td>
                <td>${item.nature}</td>
                <td>${formatPercent(item.tax_rate)}</td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}

// ------------------ Row Selection ------------------
window.selectRow = function(index) {
    editingIndex = index;
    const item = ewtList[index];

    code.value = item.code;
    nature.value = item.nature;
    taxRate.value = formatPercent(item.tax_rate);
};

// ------------------ Auto % Formatting ------------------
taxRate.addEventListener("blur", () => {
    taxRate.value = formatPercent(taxRate.value);
});

// ------------------ Add Mode ------------------
btnAdd.addEventListener("click", () => {
    disableFields(false);
    disableSaveCancel(false);

    mode = "add";
    editingIndex = null;

    code.value = "";
    nature.value = "";
    taxRate.value = "";

    code.focus();
});

// ------------------ Edit Mode ------------------
btnEdit.addEventListener("click", () => {
    if (editingIndex === null) {
        alert("Please select a row to edit.");
        return;
    }
    disableFields(false);
    disableSaveCancel(false);
    mode = "edit";
});

// ------------------ Save ------------------
btnSave.addEventListener("click", async () => {
    const payload = {
        code: code.value.trim(),
        nature: nature.value.trim(),
        taxRate: parseFloat(taxRate.value.replace("%", "")) || 0
    };

    try {
        if (mode === "add") {
            await fetch("/api/ewt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } else if (mode === "edit" && editingIndex !== null) {
            const id = ewtList[editingIndex].id;
            await fetch(`/api/ewt/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        await loadEWT();
        disableFields(true);
        disableSaveCancel(true);

        code.value = "";
        nature.value = "";
        taxRate.value = "";
        editingIndex = null;

    } catch (err) {
        console.error("Failed to save EWT:", err);
        alert("Failed to save EWT.");
    }
});

// ------------------ Delete ------------------
btnDelete.addEventListener("click", async () => {
    if (editingIndex === null) {
        alert("Please select a row to delete.");
        return;
    }

    if (!confirm("Delete selected EWT?")) return;

    try {
        const id = ewtList[editingIndex].id;
        await fetch(`/api/ewt/${id}`, { method: "DELETE" });

        await loadEWT();

        code.value = "";
        nature.value = "";
        taxRate.value = "";
        editingIndex = null;

    } catch (err) {
        console.error("Failed to delete EWT:", err);
        alert("Failed to delete EWT.");
    }
});

// ----------------- Import ------------------
btnImport.addEventListener("click", () => {
    window.location.href = "/EWTImport.html";
});


// ------------------ Cancel ------------------
btnCancel.addEventListener("click", () => {
    disableFields(true);
    disableSaveCancel(true);

    code.value = "";
    nature.value = "";
    taxRate.value = "";
    editingIndex = null;
});


const searchInput = document.getElementById("search");
const searchFilter = document.getElementById("searchFilter");
const btnSearch = document.getElementById("btnSearch");

// Function to filter table based on term and selected field
function filterTable() {
    const term = searchInput.value.trim().toLowerCase();
    const filterBy = searchFilter.value;

    if (!term) {
        renderTable(); // Show all if input is empty
        return;
    }

    const filtered = ewtList.filter(item => {
        if (filterBy === "code") {
            return item.code.toLowerCase().includes(term);
        } else if (filterBy === "nature") {
            return item.nature.toLowerCase().includes(term);
        }
        return false;
    });

    renderTable(filtered);
}

// Live search: filter table as user types
searchInput.addEventListener("input", filterTable);

// Button search: filter table when clicking the button
btnSearch.addEventListener("click", filterTable);

// Render table with optional filtered list
function renderTable(list = ewtList) {
    tableBody.innerHTML = "";
    list.forEach((item, index) => {
        const row = `
            <tr onclick="selectRow(${index})">
                <td>${item.code}</td>
                <td>${item.nature}</td>
                <td>${formatPercent(item.tax_rate)}</td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}



// ------------------ Initial Load ------------------
loadEWT();
