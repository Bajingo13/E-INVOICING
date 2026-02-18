/* =========================================================
   contacts.js (FULL READY-TO-PASTE)
   - Better UI/UX: selection sync, record count, empty state
   - Safe edit/add mode locking
   - Double-click to edit
   - Keyboard shortcuts: Ctrl+F search, Enter edit, Del delete, Esc cancel/clear
   - Works with your existing API:
     GET    /api/contacts
     POST   /api/contacts
     PUT    /api/contacts/:id
     DELETE /api/contacts/:id
========================================================= */

'use strict';

// -------------------- ELEMENTS --------------------
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

// Optional UI elements (won't break if not present)
const recordCount = document.getElementById("recordCount");
const selectedLabel = document.getElementById("selectedLabel");
const emptyState = document.getElementById("emptyState");

// -------------------- STATE --------------------
let contacts = [];
let editIndex = null;
let isEditing = false;
let currentFilter = "";

// -------------------- HELPERS --------------------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function normalizeContactFromServer(c) {
  // Make sure keys exist even if API returns null/undefined
  return {
    id: c.id,
    type: c.type ?? "Customer",
    code: c.code ?? "",
    name: c.name ?? "",
    phone: c.phone ?? "",
    business: c.business ?? "",
    address: c.address ?? "",
    vat_registration: c.vat_registration ?? "",
    tin: c.tin ?? "",
    email: c.email ?? ""
  };
}

function setMeta({ shownCount = null, selectedText = null } = {}) {
  if (recordCount && shownCount !== null) recordCount.textContent = String(shownCount);
  if (selectedLabel && selectedText !== null) selectedLabel.textContent = selectedText;
}

function getSelectedRowIndex() {
  const selected = contactBody?.querySelector("tr.selected");
  if (!selected) return null;
  const idx = Number(selected.dataset.index);
  return Number.isFinite(idx) ? idx : null;
}

function clearSelection() {
  if (!contactBody) return;
  contactBody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
  setMeta({ selectedText: "None" });
}

function selectRowByIndex(i) {
  if (!contactBody) return;
  const row = contactBody.querySelector(`tr[data-index="${i}"]`);
  if (!row) return;

  contactBody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
  row.classList.add("selected");

  const radio = row.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;

  const c = contacts[i];
  if (c) setMeta({ selectedText: `${c.code} • ${c.business || c.name || "Contact"}` });
}

function setFormEnabled(enabled) {
  isEditing = !!enabled;

  const allInputs = [
    typeInput, codeInput, nameInput, phoneInput,
    businessInput, addressInput, VatRegistrationInput,
    TINInput, emailInput
  ];

  allInputs.forEach(el => { if (el) el.disabled = !enabled; });
  if (saveBtn) saveBtn.disabled = !enabled;
  if (cancelBtn) cancelBtn.disabled = !enabled;

  // Prevent accidental conflicting actions while editing
  if (addBtn) addBtn.disabled = enabled;
  if (editBtn) editBtn.disabled = enabled;
  if (deleteBtn) deleteBtn.disabled = enabled;
}

function clearForm() {
  if (typeInput) typeInput.value = "Customer";
  if (codeInput) codeInput.value = "";
  if (nameInput) nameInput.value = "";
  if (phoneInput) phoneInput.value = "";
  if (businessInput) businessInput.value = "";
  if (addressInput) addressInput.value = "";
  if (VatRegistrationInput) VatRegistrationInput.value = "";
  if (TINInput) TINInput.value = "";
  if (emailInput) emailInput.value = "";
}

function fillFormFromContact(c) {
  if (!c) return;
  if (typeInput) typeInput.value = c.type || "Customer";
  if (codeInput) codeInput.value = c.code || "";
  if (nameInput) nameInput.value = c.name || "";
  if (phoneInput) phoneInput.value = c.phone || "";
  if (businessInput) businessInput.value = c.business || "";
  if (addressInput) addressInput.value = c.address || "";
  if (VatRegistrationInput) VatRegistrationInput.value = c.vat_registration || "";
  if (TINInput) TINInput.value = c.tin || "";
  if (emailInput) emailInput.value = c.email || "";
}

function buildContactObjectFromForm() {
  return {
    type: (typeInput?.value || "Customer").trim(),
    code: (codeInput?.value || "").trim(),
    name: (nameInput?.value || "").trim(),
    phone: (phoneInput?.value || "").trim(),
    business: (businessInput?.value || "").trim(),
    address: (addressInput?.value || "").trim(),
    vat_registration: (VatRegistrationInput?.value || "").trim(),
    tin: (TINInput?.value || "").trim(),
    email: (emailInput?.value || "").trim()
  };
}

function validateContact(obj) {
  if (!obj.code) return "Please provide Code.";
  if (!obj.name && !obj.business) return "Please provide at least Contact Person or Company Name.";
  // basic email validation (optional)
  if (obj.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj.email)) {
    return "Please provide a valid email address.";
  }
  return null;
}

// -------------------- TABLE RENDER --------------------
function refreshTable(filter = "") {
  currentFilter = (filter || "").toLowerCase();

  const prevSelected = getSelectedRowIndex();

  contactBody.innerHTML = "";
  let shown = 0;

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];

    const hay = `${c.type} ${c.code} ${c.name} ${c.phone} ${c.business} ${c.address} ${c.vat_registration} ${c.tin} ${c.email}`.toLowerCase();
    if (currentFilter && !hay.includes(currentFilter)) continue;

    shown++;

    const tr = document.createElement("tr");
    tr.dataset.index = i;
    tr.innerHTML = `
      <td><input type="radio" name="selectRow" aria-label="Select contact"></td>
      <td>${escapeHtml(c.type)}</td>
      <td><b>${escapeHtml(c.code)}</b></td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.business)}</td>
      <td>${escapeHtml(c.address)}</td>
      <td>${escapeHtml(c.vat_registration)}</td>
      <td>${escapeHtml(c.tin)}</td>
      <td>${escapeHtml(c.email)}</td>
    `;
    contactBody.appendChild(tr);
  }

  setMeta({ shownCount: shown });

  if (emptyState) emptyState.style.display = shown ? "none" : "block";

  // Restore selection if still visible in filtered results
  if (prevSelected !== null) {
    // Only restore if selected contact still passes filter
    const c = contacts[prevSelected];
    if (c) {
      const hay = `${c.type} ${c.code} ${c.name} ${c.phone} ${c.business} ${c.address} ${c.vat_registration} ${c.tin} ${c.email}`.toLowerCase();
      if (!currentFilter || hay.includes(currentFilter)) {
        selectRowByIndex(prevSelected);
        return;
      }
    }
  }

  // If no selection restored
  setMeta({ selectedText: "None" });
}

// -------------------- API --------------------
async function loadContacts() {
  try {
    const res = await fetch('/api/contacts');
    if (!res.ok) throw new Error(`GET /api/contacts failed: ${res.status}`);

    const rows = await res.json();
    contacts = Array.isArray(rows) ? rows.map(normalizeContactFromServer) : [];
    refreshTable(searchInput?.value?.trim() || "");
  } catch (err) {
    console.error("Failed to load contacts:", err);
    contacts = [];
    refreshTable(searchInput?.value?.trim() || "");
    alert("Failed to load contacts. Check console for details.");
  }
}

// -------------------- EVENTS --------------------

// Add
addBtn?.addEventListener("click", () => {
  editIndex = null;
  clearForm();
  clearSelection();
  setFormEnabled(true);

  // If you want Code editable on add only:
  // codeInput.readOnly = false;

  codeInput?.focus();
});

// Select row (single click)
contactBody?.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;

  // Optional: lock selection while editing
  if (isEditing) return;

  const i = Number(tr.dataset.index);
  if (!Number.isFinite(i)) return;

  selectRowByIndex(i);
});

// Double-click to edit
contactBody?.addEventListener("dblclick", () => {
  if (isEditing) return;
  editBtn?.click();
});

// Edit
editBtn?.addEventListener("click", () => {
  const idx = getSelectedRowIndex();
  if (idx === null) return alert("Select a row to edit.");

  editIndex = idx;
  const item = contacts[editIndex];

  fillFormFromContact(item);
  setFormEnabled(true);

  // Optional: prevent changing code during edit
  // codeInput.readOnly = true;

  codeInput?.focus();
});

// Delete
deleteBtn?.addEventListener("click", async () => {
  const idx = getSelectedRowIndex();
  if (idx === null) return alert("Select a row to delete.");

  const id = contacts[idx]?.id;
  if (!id) return alert("Selected contact has no id.");

  if (!confirm("Delete selected contact?")) return;

  try {
    const res = await fetch(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch {}
      return alert(data?.error || "Failed to delete contact.");
    }

    contacts.splice(idx, 1);
    refreshTable(searchInput?.value?.trim() || "");
    clearForm();
    setFormEnabled(false);
    editIndex = null;
    clearSelection();
  } catch (err) {
    console.error(err);
    alert("Failed to delete contact. Check console for details.");
  }
});

// Save
saveBtn?.addEventListener("click", async (e) => {
  e.preventDefault();

  const obj = buildContactObjectFromForm();
  const errMsg = validateContact(obj);
  if (errMsg) return alert(errMsg);

  try {
    let res, data;

    if (editIndex === null) {
      // ADD NEW
      res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj)
      });

      data = await res.json().catch(() => ({}));

      if (!res.ok) return alert(data.error || "Failed to save contact.");

      const newItem = { ...obj, id: data.id };
      contacts.push(newItem);

      refreshTable(searchInput?.value?.trim() || "");
      // auto-select newly added row (best effort)
      const newIndex = contacts.length - 1;
      selectRowByIndex(newIndex);

    } else {
      // EDIT EXISTING
      const id = contacts[editIndex]?.id;
      if (!id) return alert("Selected contact has no id.");

      res = await fetch(`/api/contacts/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj)
      });

      data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "Failed to update contact.");

      contacts[editIndex] = { ...obj, id };
      refreshTable(searchInput?.value?.trim() || "");
      selectRowByIndex(editIndex);
    }

    clearForm();
    setFormEnabled(false);
    editIndex = null;

  } catch (err) {
    console.error(err);
    alert("Failed to save contact. Check console for details.");
  }
});

// Cancel
cancelBtn?.addEventListener("click", () => {
  clearForm();
  setFormEnabled(false);
  editIndex = null;

  // keep selection, just stop editing
  const idx = getSelectedRowIndex();
  if (idx !== null) selectRowByIndex(idx);
});

// Search
searchInput?.addEventListener("input", () => {
  refreshTable(searchInput.value.trim());
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Ctrl+F focuses search
  if (e.ctrlKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    searchInput?.focus();
    return;
  }

  // Esc: cancel edit or clear selection
  if (e.key === "Escape") {
    if (!cancelBtn?.disabled) cancelBtn.click();
    else clearSelection();
    return;
  }

  // Enter edits selected (when not editing)
  if (e.key === "Enter" && !isEditing) {
    const idx = getSelectedRowIndex();
    if (idx !== null) editBtn?.click();
    return;
  }

  // Delete/Backspace deletes selected (when not editing, and not typing in input)
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  const isTyping = tag === "input" || tag === "textarea" || tag === "select";

  if (!isTyping && !isEditing && (e.key === "Delete" || e.key === "Backspace")) {
    const idx = getSelectedRowIndex();
    if (idx !== null) deleteBtn?.click();
  }
});

const importBtn = document.getElementById("importContactsBtn");
const importFileInput = document.getElementById("contactsImportFile");

importBtn?.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const typeRaw = prompt("Import as Customer or Supplier? (C/S)");
if (!typeRaw) return;
const type = typeRaw.trim().toUpperCase();

  if (!["C","S"].includes(type)) {
    alert("Invalid type. Enter C or S.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type === "C" ? "Customer" : "Supplier");

  try {
    const res = await fetch("/api/contacts/import", {
      method: "POST",
      body: formData
    });

    const result = await res.json();

    if (!res.ok) return alert(result.error || "Import failed.");

    alert(`Imported ${result.count} contacts successfully.`);
    loadContacts(); // refresh table

  } catch (err) {
    console.error(err);
    alert("Import failed.");
  }
});


// -------------------- INIT --------------------
setMeta({ shownCount: 0, selectedText: "None" });
setFormEnabled(false);
clearForm();
loadContacts();
