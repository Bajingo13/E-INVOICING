// ================== coaImport.js ==================
const importFileInput = document.getElementById("importFile");
const uploadBtn = document.getElementById("uploadBtn");
const saveImportBtn = document.getElementById("saveImportBtn");
const importMessage = document.getElementById("importMessage");
const importPreviewBody = document.getElementById("importPreviewBody");
const importErrors = document.getElementById("importErrors");

let previewData = [];
let validationErrors = [];

// ----------------- Upload & Preview -----------------
uploadBtn.addEventListener("click", async () => {
  const file = importFileInput.files[0];
  if (!file) {
    importMessage.textContent = "Please select a file first.";
    return;
  }

  importMessage.textContent = "Uploading and parsing...";
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/import", { method: "POST", body: formData });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || "Failed to upload file");

    previewData = json.preview || [];
    validationErrors = json.errors || [];

    renderPreview();
    renderErrors();

    importMessage.textContent = "Preview loaded successfully.";
  } catch (err) {
    console.error(err);
    importMessage.textContent = "Error: Unable to load preview.";
  }
});

// ----------------- Save to Database -----------------
saveImportBtn.addEventListener("click", async () => {
  if (!previewData.length) {
    importMessage.textContent = "No data to save.";
    return;
  }

  importMessage.textContent = "Saving data to database...";
  try {
    const res = await fetch("/api/import/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(previewData)
    });
    const json = await res.json();

    if (json.ok) {
      importMessage.textContent = `Successfully saved ${previewData.length} accounts!`;
      previewData = [];
      validationErrors = [];
      renderPreview();
      renderErrors();
    } else {
      importMessage.textContent = json.error || "Failed to save data.";
    }
  } catch (err) {
    console.error(err);
    importMessage.textContent = "Error: Could not save data.";
  }
});

// ----------------- Render Preview Table -----------------
function renderPreview() {
  importPreviewBody.innerHTML = "";

  if (!previewData.length) {
    importPreviewBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No data to preview</td></tr>`;
    return;
  }

  previewData.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${row.code || ""}</td>
      <td>${row.title || ""}</td>
      <td>${row.class_type || ""}</td>
      <td>${row.tax_rate ?? ""}</td>
      <td>${row.date || ""}</td>
    `;
    importPreviewBody.appendChild(tr);
  });
}

// ----------------- Render Validation Errors -----------------
function renderErrors() {
  importErrors.innerHTML = "";

  if (!validationErrors.length) {
    importErrors.innerHTML = "<li>No validation errors.</li>";
    return;
  }

  validationErrors.forEach(err => {
    const li = document.createElement("li");
    li.textContent = `Row ${err.row}: ${err.errors.join(", ")}`;
    importErrors.appendChild(li);
  });
}
