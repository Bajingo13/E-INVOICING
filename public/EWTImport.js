const fileInput = document.getElementById("fileImport");
const btnChoose = document.getElementById("btnChoose");
const btnUpload = document.getElementById("btnUpload");
const btnBack = document.getElementById("btnBack");
const previewBody = document.getElementById("previewBody");
const statusDiv = document.getElementById("status");

let selectedFile = null;
let parsedPreview = [];

btnChoose.addEventListener("click", () => fileInput.click());

btnBack.addEventListener("click", () => {
  window.location.href = "/EWTLib.html";
});

function parseTaxRate(value) {
  if (!value) return null;
  if (typeof value === "number") return value < 1 ? value * 100 : value;
  const str = value.toString().trim();
  if (str === "1/2%" || str === "0.5%") return 0.5;
  if (str.endsWith("%")) {
    const num = parseFloat(str.replace("%", ""));
    return isNaN(num) ? null : num;
  }
  const num = parseFloat(str);
  return !isNaN(num) ? (num < 1 ? num * 100 : num) : null;
}

/* ===============================
   PREVIEW FILE
   =============================== */
fileInput.addEventListener("change", async () => {
  selectedFile = fileInput.files[0];
  previewBody.innerHTML = "";
  statusDiv.textContent = "Reading file...";
  if (!selectedFile) return;

  const data = await selectedFile.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let currentNature = null;
  parsedPreview = [];

  for (const row of rows) {
    const description = row[1]; // Nature
    const taxRateRaw = row[2];  // Tax Rate
    const codeInd = row[3];     // WI
    const codeCorp = row[4];    // WC

    if (description && typeof description === "string" && !codeInd && !codeCorp) {
      currentNature = description.trim();
      continue;
    }

    if (!currentNature || !taxRateRaw) continue;

    const taxRate = parseTaxRate(taxRateRaw);
    if (taxRate === null) continue;

    if (codeInd) parsedPreview.push({ code: codeInd.trim(), nature: currentNature, tax_rate: taxRate.toFixed(2) });
    if (codeCorp) parsedPreview.push({ code: codeCorp.trim(), nature: currentNature, tax_rate: taxRate.toFixed(2) });
  }

  if (parsedPreview.length === 0) {
    previewBody.innerHTML = `<tr><td colspan="3">No valid records found</td></tr>`;
    statusDiv.textContent = "No preview available";
    return;
  }

  previewBody.innerHTML = "";
  parsedPreview.forEach(row => {
    previewBody.innerHTML += `<tr>
      <td>${row.code}</td>
      <td>${row.nature}</td>
      <td>${row.tax_rate}%</td>
    </tr>`;
  });

  statusDiv.textContent = `Preview ready (${parsedPreview.length} records)`;
});

/* ===============================
   UPLOAD TO SERVER
   =============================== */
btnUpload.addEventListener("click", async () => {
  if (!selectedFile) return alert("Please select an Excel file.");
  statusDiv.textContent = "Importing...";

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const res = await fetch("/api/ewt/import", { method: "POST", body: formData });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message);

    statusDiv.textContent = `Import successful! ${result.inserted} records added.`;
    setTimeout(() => window.location.href = "/EWTLib.html", 1500);

  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Import failed. Please check file format.";
  }
});
