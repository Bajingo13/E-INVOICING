// =============================
// GET ELEMENTS (fixed with IDs)
// =============================
const codeInput = document.getElementById("codeInput");
const dateInput = document.getElementById("dateInput");
const titleInput = document.getElementById("titleInput");
const classSelect = document.getElementById("classSelect");

const addBtn = document.getElementById("addBtn");
const editBtn = document.getElementById("editBtn");

const tableBody = document.querySelector('.coa-table tbody');
const tabs = document.querySelectorAll('.tab');

// Store all accounts added
let accounts = [];
let editingIndex = null;

// =============================
// DISABLE ALL INPUTS BY DEFAULT
// =============================
disableForm();

function disableForm() {
    codeInput.disabled = true;
    dateInput.disabled = true;
    titleInput.disabled = true;
    classSelect.disabled = true;
}

function enableForm() {
    codeInput.disabled = false;
    dateInput.disabled = false;
    titleInput.disabled = false;
    classSelect.disabled = false;
}

// =============================
// CLEAR FORM
// =============================
function clearForm() {
    codeInput.value = "";
    dateInput.value = "";
    titleInput.value = "";
    classSelect.value = "ASSET";
}

// =============================
// ADD BUTTON
// =============================
addBtn.addEventListener("click", () => {
    enableForm();
    clearForm();
    editingIndex = null;
});

// =============================
// EDIT BUTTON
// =============================
editBtn.addEventListener("click", () => {
    const selectedRow = document.querySelector('.row-selected');
    if (!selectedRow) {
        alert("Select a row to edit.");
        return;
    }

    enableForm();

    editingIndex = selectedRow.dataset.index;
    let acc = accounts[editingIndex];

    codeInput.value = acc.code;
    dateInput.value = acc.date;
    titleInput.value = acc.title;
    classSelect.value = acc.classType;
});

// =============================
// SELECT TABLE ROWS
// =============================
tableBody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;

    document.querySelectorAll('.row-selected').forEach(r => r.classList.remove('row-selected'));
    tr.classList.add('row-selected');
});

// =============================
// SAVE ON CHANGE OF CLASS
// =============================
classSelect.addEventListener("change", saveData);

function saveData() {
    const acc = {
        code: codeInput.value,
        date: dateInput.value,
        title: titleInput.value,
        classType: classSelect.value
    };

    if (editingIndex !== null) {
        accounts[editingIndex] = acc; // update
    } else {
        accounts.push(acc); // add new
    }

    refreshTable(document.querySelector('.tab.active').textContent.trim());
    disableForm();
    clearForm();
}

// =============================
// REFRESH TABLE
// =============================
function refreshTable(filter = "All Accounts") {
    tableBody.innerHTML = "";

    accounts.forEach((acc, index) => {
        if (filter !== "All Accounts") {
            let conv = convertFilterName(filter);
            if (acc.classType !== conv) return;
        }

        const tr = document.createElement("tr");
        tr.dataset.index = index;

        tr.innerHTML = `
            <td><input type="checkbox"></td>
            <td>${acc.code}</td>
            <td>${acc.title}</td>
            <td>${acc.classType}</td>
            <td>Tax Exempt (0%)</td>
            <td>0.00</td>
        `;

        tableBody.appendChild(tr);
    });
}

// converts tab names → class types
function convertFilterName(tabName) {
    switch (tabName) {
        case "Assets": return "ASSET";
        case "Liabilities": return "LIABILITY";
        case "Equity": return "EQUITY";
        case "Expenses": return "EXPENSE";
        case "Revenue": return "REVENUE";
        default: return "All Accounts";
    }
}

// =============================
// TAB CLICK
// =============================
tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelector(".tab.active").classList.remove("active");
        tab.classList.add("active");

        refreshTable(tab.textContent.trim());
    });
});
