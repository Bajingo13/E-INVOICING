// elements
const contactBody = document.getElementById("contactBody");

const typeInput = document.getElementById("typeInput");
const codeInput = document.getElementById("codeInput");
const nameInput = document.getElementById("nameInput");
const phoneInput = document.getElementById("phoneInput");
const businessInput = document.getElementById("businessInput");
const addressInput = document.getElementById("addressInput");
const VatRegistrationInput = document.getElementById("VatRegistrationInput");
const TINInput = document.getElementById("TINInput");
const emailInput = document.getElementById("emailInput");

const addBtn = document.getElementById("addBtn");
const editBtn = document.getElementById("editBtn");
const deleteBtn = document.getElementById("deleteBtn");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const searchInput = document.getElementById("searchInput");

let contacts = [];
let editIndex = null;

// helpers: enable/disable form controls
function setFormEnabled(enabled) {
  [typeInput, codeInput, nameInput, phoneInput,
   businessInput, addressInput, VatRegistrationInput,
   TINInput, emailInput].forEach(el => el.disabled = !enabled);

  saveBtn.disabled = !enabled;
  cancelBtn.disabled = !enabled;

  // keep Add/Edit/Delete available always
  addBtn.disabled = false;
  editBtn.disabled = false;
  deleteBtn.disabled = false;
}

// initial state: form disabled
setFormEnabled(false);

// clear form fields
function clearForm() {
  typeInput.value = "Customer";
  codeInput.value = "";
  nameInput.value = "";
  phoneInput.value = "";
  businessInput.value = "";
  addressInput.value = "";
  VatRegistrationInput.value = "";
  TINInput.value = "";
  emailInput.value = "";
}

// ADD
addBtn.addEventListener("click", () => {
  editIndex = null;
  clearForm();
  setFormEnabled(true);
  codeInput.focus();
});

// SELECT ROW
contactBody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  contactBody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");
});

// EDIT
editBtn.addEventListener("click", () => {
  const selected = contactBody.querySelector("tr.selected");
  if (!selected) return alert("Select a row to edit.");
  editIndex = Number(selected.dataset.index);
  const item = contacts[editIndex];
  typeInput.value = item.type;
  codeInput.value = item.code;
  nameInput.value = item.name;
  phoneInput.value = item.phone;
  businessInput.value = item.business;
  addressInput.value = item.address;
  VatRegistrationInput.value = item.VatRegistration;
  TINInput.value = item.TIN;
  emailInput.value = item.email;
  setFormEnabled(true);
  codeInput.focus();
});

// DELETE
deleteBtn.addEventListener("click", () => {
  const selected = contactBody.querySelector("tr.selected");
  if (!selected) return alert("Select a row to delete.");
  const idx = Number(selected.dataset.index);
  if (!confirm("Delete selected contact?")) return;
  contacts.splice(idx, 1);
  refreshTable();
});

// SAVE
saveBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const obj = {
    type: typeInput.value,
    code: codeInput.value.trim(),
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim(),
    business: businessInput.value.trim(),
    address: addressInput.value.trim(),
    VatRegistration: VatRegistrationInput.value.trim(),
    TIN: TINInput.value.trim(),
    email: emailInput.value.trim()
  };

  if (!obj.code || !obj.name) {
    alert("Please provide at least Code and Name.");
    return;
  }

  if (editIndex === null) {
    contacts.push(obj);
  } else {
    contacts[editIndex] = obj;
  }

  refreshTable();
  clearForm();
  setFormEnabled(false);
  editIndex = null;
});

// CANCEL
cancelBtn.addEventListener("click", () => {
  clearForm();
  setFormEnabled(false);
  editIndex = null;
});

// SEARCH (live)
searchInput.addEventListener("input", () => {
  refreshTable(searchInput.value.trim().toLowerCase());
});

// refresh table display
function refreshTable(filter = "") {
  contactBody.innerHTML = "";
  contacts.forEach((c, i) => {
    const hay = `${c.type} ${c.code} ${c.name} ${c.business} ${c.address} ${c.email}`.toLowerCase();
    if (filter && !hay.includes(filter)) return;
    const tr = document.createElement("tr");
    tr.dataset.index = i;
    tr.innerHTML = `
      <td><input type="radio" name="selectRow"></td>
      <td>${escapeHtml(c.type)}</td>
      <td>${escapeHtml(c.code)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.business)}</td>
      <td>${escapeHtml(c.address)}</td>
      <td>${escapeHtml(c.VatRegistration)}</td>
      <td>${escapeHtml(c.TIN)}</td>
      <td>${escapeHtml(c.email)}</td>
    `;
    contactBody.appendChild(tr);
  });
}

// small helper
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

function setFormEnabled(enabled) {
  const allInputs = [
    typeInput, codeInput, nameInput, phoneInput,
    businessInput, addressInput, VatRegistrationInput,
    TINInput, emailInput
  ];

  allInputs.forEach(el => {
    el.disabled = !enabled;
    if (enabled) {
      el.classList.remove("disabled");
    }
  });

  saveBtn.disabled = !enabled;
  cancelBtn.disabled = !enabled;
}
