// ✅ EINVOICING.js loaded

// -------------------- 0. UTILITY FUNCTIONS --------------------

// Converts various date formats to YYYY-MM-DD for consistency
function dateToYYYYMMDD(dateValue) {
  if (!dateValue) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;

  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
} 

function populateDates() {
    const issueDate = document.getElementById('issueDate').value;

    // 1. Billing info table
    const billingDateInput = document.querySelector('input[name="date"]');
    if (billingDateInput) billingDateInput.value = issueDate;

    // 2. Payment section
    const payDateInput = document.querySelector('input[name="payDate"]');
    if (payDateInput) payDateInput.value = issueDate;

    // 3. Footer ATP/BIR dates
    const footerAtpDateInput = document.querySelector('input[name="footerAtpDate"]');
    if (footerAtpDateInput) footerAtpDateInput.value = issueDate;

    const footerBirDateInput = document.querySelector('input[name="footerBirDate"]');
    if (footerBirDateInput) footerBirDateInput.value = issueDate;
}
function updateDueDate() {
  const start = document.getElementById("start_date")?.value;
  const due = document.getElementById("due_date");
  if (start && due) {
    // Set due date 30 days after start date (adjust as needed)
    const s = new Date(start);
    s.setDate(s.getDate() + 30);
    due.value = s.toISOString().split("T")[0];
  }
}


// -------------------- 1. COMPANY INFO LOAD --------------------

// Loads company info from backend and updates form/header/logo
async function loadCompanyInfo() {
  try {
    const res = await fetch('/get-company-info');
    const company = await res.json();
    if (!company) return;

    // Fill form fields
    document.querySelector('input[name="billTo"]').value = company.company_name || '';
    document.querySelector('input[name="address1"]').value = company.company_address || '';
    document.querySelector('input[name="address2"]').value = '';
    document.querySelector('input[name="tin"]').value = company.vat_tin || '';

    // Fill header
    document.getElementById('company-name').textContent = company.company_name || '';
    document.getElementById('company-address').textContent = company.company_address || '';
    document.getElementById('company-tel').textContent = company.tel_no || '';
    document.getElementById('company-tin').textContent = company.vat_tin || '';

    // Handle logo preview
    const logoEl = document.getElementById('invoice-logo');
    const previewLogoEl = document.getElementById('uploaded-logo');
    const removeBtn = document.getElementById('remove-logo-btn');
    if (company.logo_path) {
      if (logoEl) logoEl.src = company.logo_path;
      if (previewLogoEl) {
        previewLogoEl.src = company.logo_path;
        previewLogoEl.style.display = 'block';
      }
      if (removeBtn) removeBtn.style.display = 'inline-block';
    } else {
      if (previewLogoEl) previewLogoEl.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'none';
    }
  } catch (err) {
    console.warn('Failed to load company info:', err);
  }
}

// -------------------- 2. DYNAMIC INVOICE TITLE (from URL) --------------------

// Sets invoice title based on URL param and syncs with backend if editing
async function setInvoiceTitleFromURL() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const typeMap = {
    sales: 'SALES INVOICE',
    commercial: 'COMMERCIAL INVOICE',
    credit: 'CREDIT MEMO',
    debit: 'DEBIT MEMO'
  };
  const invoiceTitle = typeMap[type] || 'SERVICE INVOICE';

  // Update visible title
  const titleEl = document.querySelector('.invoice-title');
  if (titleEl) titleEl.textContent = invoiceTitle;

  // Store locally
  localStorage.setItem('selectedInvoiceType', invoiceTitle);

  // Only sync with backend if editing (invoice number exists)
  const invoiceNoEl = document.querySelector('#invoice_no');
  const invoiceNo = invoiceNoEl ? invoiceNoEl.value.trim() : '';
  if (!invoiceNo) {
    console.warn("⚠️ No invoice number yet — stored locally only.");
    return;
  }
  try {
    const res = await fetch('/api/invoice/save-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceNo, invoiceTitle })
    });
    const result = await res.json();
    console.log("🟢 Invoice title synced with backend:", result);
  } catch (err) {
    console.warn("⚠️ Failed to save invoice title:", err);
  }
}

// -------------------- 3. LOAD INVOICE FOR EDITING --------------------

// Loads invoice data for editing and fills all fields/tables
async function loadInvoiceForEdit() {
  const params = new URLSearchParams(window.location.search);
  const invoiceNo = params.get("invoice_no");
  const isEdit = params.get("edit") === "true";
  if (!invoiceNo || !isEdit) return;

  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
    if (!res.ok) throw new Error("Failed to fetch invoice");
    const data = await res.json();

    // Fill footer dates
    document.querySelectorAll('input[name="footerAtpDate"]').forEach(input => {
      input.value = dateToYYYYMMDD(data.footer?.atp_date);
    });
    document.querySelectorAll('input[name="footerBirDate"]').forEach(input => {
      input.value = dateToYYYYMMDD(data.footer?.bir_date);
    });

    // Fill basic info
    document.querySelector('input[name="billTo"]').value = data.bill_to || "";
    document.querySelector('input[name="address1"]').value = data.address1 || "";
    document.querySelector('input[name="address2"]').value = data.address2 || "";
    document.querySelector('input[name="tin"]').value = data.tin || "";
    document.querySelector('input[name="terms"]').value = data.terms || "";
    document.querySelector('input[name="invoiceNo"]').value = data.invoice_no || "";
    const dateInput = document.querySelector('input[name="date"]');
    if (dateInput) dateInput.value = dateToYYYYMMDD(data.date);

    // Update invoice title
    const titleEl = document.querySelector('.invoice-title');
    if (titleEl && data.invoice_title) titleEl.textContent = data.invoice_title;

    // Dynamic columns
    const defaultCols = [
      { label: "Description", key: "description" },
      { label: "Qty", key: "quantity" },
      { label: "Rate", key: "unit_price" },
      { label: "Amt", key: "amount" }
    ];
    const extraColKeys = Array.isArray(data.extra_columns) ? data.extra_columns : [];
    const theadRow = document.querySelector("#items-table thead tr");
    theadRow.innerHTML = "";
    defaultCols.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col.label;
      theadRow.appendChild(th);
    });
    extraColKeys.forEach(colKey => {
      const th = document.createElement("th");
      th.textContent = colKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      theadRow.appendChild(th);
    });

    // Fill items table
    const tbody = document.getElementById("items-body");
    tbody.innerHTML = "";
    (data.items || []).forEach(item => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="text" class="input-full" name="desc[]" value="${item.description || ""}"></td>
        <td><input type="number" class="input-short" name="qty[]" value="${item.quantity || 0}" oninput="updateAmount(this)"></td>
        <td><input type="number" class="input-short" name="rate[]" value="${item.unit_price || 0}" oninput="updateAmount(this)"></td>
        <td><input type="number" class="input-short" name="amt[]" value="${item.amount || 0}" readonly></td>
      `;
      extraColKeys.forEach(colKey => {
        const td = document.createElement("td");
        td.innerHTML = `<input type="text" name="${colKey}[]" value="${item[colKey] || ""}">`;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });

    // Fill payment section
    document.querySelector('input[name="cash"]').checked = !!data.payment.cash;
    const payDateInput = document.querySelector('input[name="payDate"]');
    if (payDateInput) payDateInput.value = dateToYYYYMMDD(data.payment?.pay_date);
    document.querySelector('input[name="checkNo"]').value = data.payment.check_no || "";
    document.querySelector('input[name="bank"]').value = data.payment.bank || "";
    document.querySelector('input[name="payDate"]').value = dateToYYYYMMDD(data.payment?.pay_date);
    document.querySelector('input[name="vatableSales"]').value = data.payment.vatable_sales || 0;
    document.querySelector('input[name="vatExempt"]').value = data.payment.vat_exempt || 0;
    document.querySelector('input[name="zeroRated"]').value = data.payment.zero_rated || 0;
    document.querySelector('input[name="vatAmount"]').value = data.payment.vat_amount || 0;
    document.querySelector('input[name="lessVat"]').value = data.payment.less_vat || 0;
    document.querySelector('input[name="netVat"]').value = data.payment.net_vat || 0;
    document.querySelector('input[name="withholding"]').value = data.payment.withholding || 0;
    document.querySelector('input[name="total"]').value = data.payment.total || 0;
    document.querySelector('input[name="due"]').value = data.payment.due || 0;
    document.querySelector('input[name="payable"]').value = data.payment.payable || 0;

    // Fill footer
    document.querySelector('input[name="footerAtpNo"]').value = data.footer?.atp_no || "";
    document.querySelector('input[name="footerAtpDate"]').value = data.footer?.atp_date || "";
    document.querySelector('input[name="footerBirPermit"]').value = data.footer?.bir_permit_no || "";
    document.querySelector('input[name="footerBirDate"]').value = data.footer?.bir_date || "";
    document.querySelector('input[name="footerSerialNos"]').value = data.footer?.serial_nos || "";

    // Fill logo
    if (data.logo) {
      const logoEl = document.getElementById("uploaded-logo");
      logoEl.src = data.logo;
      logoEl.style.display = "block";
    }

    adjustColumnWidths();
  } catch (err) {
    console.error("❌ Error loading invoice for edit:", err);
  }
}

// -------------------- 4. SAVE INVOICE (Create/Edit + Recurring) --------------------
async function saveToDatabase() {
  console.log("🟢 saveToDatabase called");

  // Gather required fields
  const billTo = document.querySelector('input[name="billTo"]')?.value.trim();
  const invoiceNo = document.querySelector('input[name="invoiceNo"]')?.value.trim();
  const date = document.querySelector('input[name="date"]')?.value.trim();
  const dueDate = document.querySelector('input[name="dueDate"]')?.value.trim();

  if (!billTo || !invoiceNo || !date) {
    alert("Please fill in required fields: Bill To, Invoice No, and Date.");
    return;
  }

  calculateTotals(); // Ensure totals are up to date

  // Gather dynamic columns
  const allThs = document.querySelectorAll("#items-table thead th");
  const extraColumns = Array.from(allThs)
    .slice(4)
    .map(th => th.textContent.trim().toLowerCase().replace(/\s+/g, "_"));

  // Gather items
  const items = Array.from(document.querySelectorAll("#items-body tr")).map(row => {
    const item = {
      description: row.querySelector('input[name="desc[]"]')?.value.trim() || "",
      quantity: parseInt(row.querySelector('input[name="qty[]"]')?.value) || 0,
      unit_price: parseFloat(row.querySelector('input[name="rate[]"]')?.value) || 0,
      amount: parseFloat(row.querySelector('input[name="amt[]"]')?.value) || 0
    };
    extraColumns.forEach(colKey => {
      const input = row.querySelector(`input[name="${colKey}[]"]`);
      item[colKey] = input?.value.trim() || "";
    });
    return item;
  });

  // Gather payment info
  const payment = {
    cash: document.querySelector('input[name="cash"]')?.checked || false,
    check_payment: document.querySelector('input[name="check"]')?.checked || false,
    check_no: document.querySelector('input[name="checkNo"]')?.value.trim() || null,
    bank: document.querySelector('input[name="bank"]')?.value.trim() || null,
    vatable_sales: parseFloat(document.querySelector('input[name="vatableSales"]')?.value) || 0,
    total_sales: parseFloat(document.querySelector('input[name="totalSales"]')?.value) || 0,
    vat_exempt: parseFloat(document.querySelector('input[name="vatExempt"]')?.value) || 0,
    less_vat: parseFloat(document.querySelector('input[name="lessVat"]')?.value) || 0,
    zero_rated: parseFloat(document.querySelector('input[name="zeroRated"]')?.value) || 0,
    net_vat: parseFloat(document.querySelector('input[name="netVat"]')?.value) || 0,
    vat_amount: parseFloat(document.querySelector('input[name="vatAmount"]')?.value) || 0,
    withholding: parseFloat(document.querySelector('input[name="withholding"]')?.value) || 0,
    total: parseFloat(document.querySelector('input[name="total"]')?.value) || 0,
    due: parseFloat(document.querySelector('input[name="due"]')?.value) || 0,
    pay_date: document.querySelector('input[name="payDate"]')?.value || null,
    payable: parseFloat(document.querySelector('input[name="payable"]')?.value) || 0
  };

  // Gather footer info
  const footer = {
    atp_no: document.querySelector('input[name="footerAtpNo"]')?.value.trim() || "",
    atp_date: document.querySelector('input[name="footerAtpDate"]')?.value.trim() || "",
    bir_permit_no: document.querySelector('input[name="footerBirPermit"]')?.value.trim() || "",
    bir_date: document.querySelector('input[name="footerBirDate"]')?.value.trim() || "",
    serial_nos: document.querySelector('input[name="footerSerialNos"]')?.value.trim() || ""
  };

  // Handle logo upload if new file selected
  let logoPath = document.getElementById('uploaded-logo')?.src || '';
  const logoFile = document.getElementById('logo-upload')?.files?.[0];
  if (logoFile) {
    const formData = new FormData();
    formData.append("logo", logoFile);
    formData.append("invoice_no", invoiceNo);
    try {
      const uploadRes = await fetch("/upload-logo", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok && uploadData.filename) logoPath = uploadData.filename;
      else console.warn("Logo upload failed:", uploadData.error || uploadData);
    } catch (err) { console.warn("Logo upload error:", err); }
  }

  // Get invoice title
  const titleEl = document.querySelector('.invoice-title');
  const invoiceTitle = titleEl
    ? titleEl.textContent.trim()
    : (localStorage.getItem('selectedInvoiceType') || 'SERVICE INVOICE');

  // Build invoice object
  const invoiceData = {
    invoice_no: invoiceNo,
    invoice_type: invoiceTitle,
    bill_to: billTo,
    address1: document.querySelector('input[name="address1"]')?.value.trim() || "",
    address2: document.querySelector('input[name="address2"]')?.value.trim() || "",
    tin: document.querySelector('input[name="tin"]')?.value.trim() || "",
    terms: document.querySelector('input[name="terms"]')?.value.trim() || "",
    date,
    dueDate,
    total_amount_due: payment.payable || 0,
    invoice_title: titleEl ? titleEl.textContent.trim() : "SERVICE INVOICE",
    items,
    payment,
    footer,
    logo: logoPath
  };

  //  Detect if Recurring Invoice
const isRecurring = document.getElementById('recurringOptions')?.style.display === 'block';
if (isRecurring) {
  invoiceData.recurrence_type = document.getElementById('recurrenceType')?.value || null;
  invoiceData.recurrence_start_date = document.getElementById('recurrenceStart')?.value || null;
  invoiceData.recurrence_end_date = document.getElementById('recurrenceEnd')?.value || null;
  invoiceData.recurrence_status = 'active';
}

  console.log("📦 Invoice data prepared:", invoiceData);

  // Detect if editing or creating
  const params = new URLSearchParams(window.location.search);
  const invoiceNoParam = params.get("invoice_no");
  const isEdit = params.get("edit") === "true";

 // ✅ Unified save route for both standard & recurring
let method, url;
if (isEdit && invoiceNoParam) {
  method = "PUT";
  url = `/api/invoices/${encodeURIComponent(invoiceNoParam)}`;
} else {
  method = "POST";
  url = "/api/invoices";
}
  // Send to backend
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoiceData)
    });
    const result = await res.json();
    if (res.ok) {
      alert(isRecurring ? "Recurring invoice saved successfully!" :
            isEdit ? "Invoice updated successfully!" :
            "Invoice saved successfully!");
      window.location.href = `/Replica.html?invoice_no=${invoiceData.invoice_no}`;
    } else {
      alert(`Error saving invoice: ${result.error || "Unknown error"}`);
      console.error(result);
    }
  } catch (err) {
    alert("Error saving invoice. Check console.");
    console.error(err);
  } finally {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
  }
}

// -------------------- 5. ROW & COLUMN FUNCTIONS --------------------

// Adds a new row to the items table
function addRow() {
  const tbody = document.getElementById("items-body");
  const headerCols = document.querySelectorAll("#items-table thead th");
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="text" class="input-full" name="desc[]"></td>
    <td><input type="number" class="input-short" name="qty[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="rate[]" oninput="updateAmount(this)"></td>
    <td><input type="number" class="input-short" name="amt[]" readonly></td>
  `;
  for (let i = 4; i < headerCols.length; i++) {
    const colKey = headerCols[i].textContent.trim().toLowerCase().replace(/\s+/g, "_");
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" name="${colKey}[]">`;
    row.appendChild(td);
  }
  tbody.appendChild(row);
  adjustColumnWidths();
}

// Removes a row from the items table (asks user for row number)
function removeRow() {
  const tbody = document.getElementById("items-body");
  if (tbody.rows.length <= 1) return alert("At least one row must remain.");
  const index = parseInt(prompt(`Enter row number to remove (1-${tbody.rows.length}):`));
  if (isNaN(index) || index < 1 || index > tbody.rows.length) return alert("Invalid row number.");
  tbody.deleteRow(index - 1);
  calculateTotals();
  adjustColumnWidths();
}

// Adds a new column to the items table
function addColumn() {
  const name = prompt("Enter new column name:");
  if (!name) return;
  const theadRow = document.querySelector("#items-table thead tr");
  const newTh = document.createElement("th");
  newTh.textContent = name;
  theadRow.appendChild(newTh);
  const colKey = name.toLowerCase().replace(/\s+/g, "_");
  document.querySelectorAll("#items-table tbody tr").forEach(row => {
    const td = document.createElement("td");
    td.innerHTML = `<input type="text" name="${colKey}[]">`;
    row.appendChild(td);
  });
  adjustColumnWidths();
}

// Removes a column from the items table (asks user for column name)
function removeColumn() {
  const name = prompt("Enter exact column name to remove:");
  if (!name) return;
  const theadRow = document.querySelector("#items-table thead tr");
  const ths = Array.from(theadRow.querySelectorAll("th"));
  const index = ths.findIndex(th => th.textContent.trim().toLowerCase() === name.trim().toLowerCase());
  if (index < 4) return alert("Default columns cannot be removed.");
  if (index === -1) return alert(`Column "${name}" not found.`);
  ths[index].remove();
  document.querySelectorAll("#items-table tbody tr").forEach(row => row.querySelectorAll("td")[index]?.remove());
  adjustColumnWidths();
}

// -------------------- 6. CALCULATIONS --------------------

// Updates the amount for a row when qty or rate changes
function updateAmount(el) {
  const row = el.closest("tr");
  const qty = parseFloat(row.querySelector('input[name="qty[]"]')?.value) || 0;
  const rate = parseFloat(row.querySelector('input[name="rate[]"]')?.value) || 0;
  row.querySelector('input[name="amt[]"]').value = (qty * rate).toFixed(2);
  calculateTotals();
}

// Calculates totals, VAT, net, due, etc.
function calculateTotals() {
  let totalSales = 0;
  document.querySelectorAll('input[name="amt[]"]').forEach(input => totalSales += parseFloat(input.value) || 0);
  const vatRate = 0.12;
  const vatAmount = totalSales / (1 + vatRate) * vatRate;
  const netVat = totalSales - vatAmount;
  const withholding = parseFloat(document.querySelector('input[name="withholding"]')?.value) || 0;
  const addVat = parseFloat(document.querySelector('input[name="addVat"]')?.value) || 0;
  const payable = totalSales + addVat;
  const due = payable - withholding;

  document.querySelector('input[name="totalSales"]').value = totalSales.toFixed(2);
  document.querySelector('input[name="vatAmount"]').value = vatAmount.toFixed(2);
  document.querySelector('input[name="netVat"]').value = netVat.toFixed(2);
  document.querySelector('input[name="payable"]').value = payable.toFixed(2);
  document.querySelector('input[name="due"]').value = due.toFixed(2);
}

// -------------------- 7. UI ADJUSTMENTS --------------------

// Adjusts column widths for table consistency
function adjustColumnWidths() {
  const table = document.getElementById("items-table");
  const ths = table.querySelectorAll("thead th");
  if (!ths.length) return;
  const colWidth = 100 / ths.length + "%";
  ths.forEach(th => th.style.width = colWidth);
  table.querySelectorAll("tbody tr").forEach(row => row.querySelectorAll("td").forEach(td => td.style.width = colWidth));
}

// -------------------- 8. LOGO FUNCTIONS --------------------

// Previews logo image when user selects a file
function previewLogo(event) {
  const img = document.getElementById("uploaded-logo");
  const btn = document.getElementById("remove-logo-btn");
  if (event.target.files?.[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      img.src = e.target.result;
      img.style.display = "block";
      btn.style.display = "inline-block";
    };
    reader.readAsDataURL(event.target.files[0]);
  }
}

// Removes the uploaded logo preview
function removeLogo() {
  const img = document.getElementById("uploaded-logo");
  const btn = document.getElementById("remove-logo-btn");
  const input = document.getElementById("logo-upload");
  img.src = "";
  img.style.display = "none";
  btn.style.display = "none";
  input.value = "";
}

// -------------------- 9. INIT --------------------

// On DOM ready, load company info, set invoice title, and load invoice for edit if needed
window.addEventListener('DOMContentLoaded', () => {
  loadCompanyInfo();
  setInvoiceTitleFromURL();
  loadInvoiceForEdit();
});

// ==================== Detect Recurring Mode ====================
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const invoiceMode = params.get('invoiceMode');
  const recurringSection = document.getElementById('recurringOptions');

  if (!recurringSection) return; // just in case it's not found

  if (invoiceMode === 'recurring') {
    recurringSection.style.display = 'block';
    console.log("🔁 Recurring invoice mode activated");
  } else {
    recurringSection.style.display = 'none';
    console.log("📄 Standard invoice mode activated");
  }
});


