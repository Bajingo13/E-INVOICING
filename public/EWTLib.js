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
let mode = "";           

function disableFields(state) {
    code.disabled = state;
    nature.disabled = state;
    taxRate.disabled = state;
}

function disableSaveCancel(state) {
    btnSave.disabled = state;
    btnCancel.disabled = state;
}

// Initial disabled state
disableFields(true);
disableSaveCancel(true);

// Auto convert to percent when user leaves field
taxRate.addEventListener("blur", () => {
    let val = taxRate.value.trim().replace("%", "");

    if (val === "") return;

    let num = parseFloat(val);
    if (!isNaN(num)) {
        taxRate.value = num + "%";
    }
});

// Render table
function renderTable() {
    tableBody.innerHTML = "";

    ewtList.forEach((item, index) => {
        const row = `
            <tr onclick="selectRow(${index})">
                <td>${item.code}</td>
                <td>${item.nature}</td>
                <td>${item.taxRate}</td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}

// Select row
window.selectRow = function(index) {
    editingIndex = index;
    const item = ewtList[index];

    code.value = item.code;
    nature.value = item.nature;
    taxRate.value = item.taxRate;
};

// Add mode
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

// Edit mode
btnEdit.addEventListener("click", () => {
    if (editingIndex === null) {
        alert("Please select a row to edit.");
        return;
    }

    disableFields(false);
    disableSaveCancel(false);

    mode = "edit";
});

// Save
btnSave.addEventListener("click", () => {
    // force percentage formatting before saving
    let rateVal = taxRate.value.trim().replace("%", "");
    if (!isNaN(parseFloat(rateVal))) {
        taxRate.value = parseFloat(rateVal) + "%";
    }

    const newItem = {
        code: code.value,
        nature: nature.value,
        taxRate: taxRate.value
    };

    if (mode === "add") {
        ewtList.push(newItem);
    } 
    else if (mode === "edit" && editingIndex !== null) {
        ewtList[editingIndex] = newItem;
    }

    renderTable();

    disableFields(true);
    disableSaveCancel(true);
});

// Delete
btnDelete.addEventListener("click", () => {
    if (editingIndex === null) {
        alert("Please select a row to delete.");
        return;
    }

    if (confirm("Delete selected EWT?")) {
        ewtList.splice(editingIndex, 1);
        renderTable();

        code.value = "";
        nature.value = "";
        taxRate.value = "";

        editingIndex = null;
    }
});

// Cancel
btnCancel.addEventListener("click", () => {
    disableFields(true);
    disableSaveCancel(true);

    code.value = "";
    nature.value = "";
    taxRate.value = "";
});
