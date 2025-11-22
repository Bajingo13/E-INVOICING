// ===============================
// REPLICA.js — Invoice Renderer & Exporter
// ===============================

console.log("✅ REPLICA.js loaded");

// ============================
// Main Invoice Renderer
// ============================
function renderInvoice(data) {
  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? "" : num.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return isNaN(date) ? dateStr : date.toLocaleDateString("en-PH");
  };

  const fillLine = (labelText, value) => {
    document.querySelectorAll(".field").forEach((field) => {
      const label = field.querySelector(".label");
      const line = field.querySelector(".line");
      if (label && line && label.textContent.trim().startsWith(labelText)) {
        line.textContent = value || "___________";
      }
    });
  };

  const fillById = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "";
  };

  const buildTable = (items) => {
    const theadRow = document.getElementById("replica-thead-row");
    const colgroup = document.getElementById("invoice-colgroup");
    const tbody = document.getElementById("itemRows");

    theadRow.innerHTML = "";
    colgroup.innerHTML = "";
    tbody.innerHTML = "";

    // Detect extra fields dynamically
    const extraFieldsSet = new Set();
    items.forEach(it => {
      Object.keys(it || {}).forEach(k => {
        if (!["description","quantity","unit_price","amount","invoice_id","id"].includes(k.toLowerCase()) &&
            it[k] != null && it[k] !== "") {
          extraFieldsSet.add(k);
        }
      });
    });
    const extraFields = Array.from(extraFieldsSet);

    const headers = ["Item Description / Nature of Service","Quantity","Unit Price","Amount", ...extraFields];
    headers.forEach(label => {
      const th = document.createElement("th");
      th.textContent = label.replace(/_/g," ").replace(/\b\w/g,c => c.toUpperCase());
      theadRow.appendChild(th);
    });

    // Base widths
    const baseWidths = ["40%","10%","15%","15%"];
    baseWidths.forEach(width => {
      const col = document.createElement("col");
      col.style.width = width;
      colgroup.appendChild(col);
    });

    if(extraFields.length > 0){
      const extraWidth = ((100-40-10-15-15)/extraFields.length).toFixed(2)+"%";
      extraFields.forEach(() => {
        const col = document.createElement("col");
        col.style.width = extraWidth;
        colgroup.appendChild(col);
      });
    }

    const TOTAL_ROWS = 20;
    for(let i=0;i<TOTAL_ROWS;i++){
      const row = document.createElement("tr");
      const item = items[i] || {};
      const cells = [
        `<td>${item.description || "&nbsp;"}</td>`,
        `<td>${item.quantity || "&nbsp;"}</td>`,
        `<td>${item.unit_price ? formatCurrency(item.unit_price) : "&nbsp;"}</td>`,
        `<td>${item.amount ? formatCurrency(item.amount) : "&nbsp;"}</td>`,
        ...extraFields.map(f => `<td>${item[f] != null ? item[f] : "&nbsp;"}</td>`)
      ];
      row.innerHTML = cells.join("");
      tbody.appendChild(row);
    }

    return extraFields; // return for later use in extraction/export
  };

  // --- Company Info & Logo ---
  if (data.company) {
    fillById("companyName", data.company.company_name || data.company.companyName);
    fillById("companyAddress", data.company.company_address || data.company.companyAddress);
    fillById("companyTel", data.company.tel_no || data.company.companyTel);
    fillById("companyTIN", data.company.vat_tin || data.company.companyTIN);

    if (data.company.logo_path) {
      const logoEl = document.getElementById("uploaded-logo");
      logoEl.src = data.company.logo_path;
      logoEl.style.display = "block";
    }
  }

  // --- Items Table & detect extras ---
  const extraFields = buildTable(Array.isArray(data.items) ? data.items : []);

  // --- Invoice Header ---
  fillLine("BILL TO", data.bill_to || data.invoice?.billTo);
  fillLine("ADDRESS", `${data.address1 || data.invoice?.address1 || ""} ${data.address2 || data.invoice?.address2 || ""}`.trim());
  fillLine("N", data.invoice_no || data.invoice?.invoiceNumber);
  fillLine("DATE", formatDate(data.date || data.invoice?.invoiceDate));
  fillLine("TIN", data.tin || data.invoice?.tin);
  fillLine("TERMS", data.terms || data.invoice?.terms);

  fillById("billTo", data.bill_to || data.invoice?.billTo);
  fillById("address1", data.address1 || data.invoice?.address1);
  fillById("address2", data.address2 || data.invoice?.address2);
  fillById("invoiceNumber", data.invoice_no || data.invoice?.invoiceNumber);
  fillById("invoiceDate", formatDate(data.date || data.invoice?.invoiceDate));
  fillById("tin", data.tin || data.invoice?.tin);
  fillById("terms", data.terms || data.invoice?.terms);

  // --- Payment ---
  const payment = data.payment || {};

  // --- Auto-sum totals from items ---
  let subtotal = 0;
  let vatableSales = 0;
  let vatExemptSales = 0;
  let zeroRatedSales = 0;
  let vatAmount = 0;

  (Array.isArray(data.items) ? data.items : []).forEach(item => {
    const amount = parseFloat(item.amount) || 0;
    subtotal += amount;

    // check if item has VAT category fields
    if (item.vatable_sales != null) vatableSales += parseFloat(item.vatable_sales) || 0;
    if (item.vat_exempt != null) vatExemptSales += parseFloat(item.vat_exempt) || 0;
    if (item.zero_rated != null) zeroRatedSales += parseFloat(item.zero_rated) || 0;
    if (item.vat_amount != null) vatAmount += parseFloat(item.vat_amount) || 0;
  });

  const discount = parseFloat(payment.discount || payment.discountAmount) || 0;
  const withholding = parseFloat(payment.withholding || payment.withholdingTax) || 0;
  const totalPayable = subtotal - discount - withholding;

  // Fill all payment fields
  fillById("vatableSales", formatCurrency(vatableSales));
  fillById("vatExemptSales", formatCurrency(vatExemptSales));
  fillById("zeroRatedSales", formatCurrency(zeroRatedSales));
  fillById("vatAmount", formatCurrency(vatAmount));
  fillById("subtotal", formatCurrency(subtotal));
  fillById("discount", formatCurrency(discount));
  fillById("withholdingTax", formatCurrency(withholding));
  fillById("totalPayable", formatCurrency(totalPayable));
  fillById("total", formatCurrency(subtotal));
  fillById("totalDue", formatCurrency(totalPayable));

  // --- Signatures ---
  fillById("preparedBy", payment.prepared_by || payment.preparedBy);
  fillById("approvedBy", payment.approved_by || payment.approvedBy);
  fillById("receivedBy", payment.received_by || payment.receivedBy);

  // --- Footer ---
  if (data.footer) {
    fillById("footer-atp-no", data.footer.atp_no || data.footer.atpNo);
    fillById("footer-atp-date", formatDate(data.footer.atp_date || data.footer.atpDate));
    fillById("footer-bir-permit", data.footer.bir_permit_no || data.footer.birPermit);
    fillById("footer-bir-date", formatDate(data.footer.bir_date || data.footer.birDate));
    fillById("footer-serial-nos", data.footer.serial_nos || data.footer.serialNos);
  }

  // --- Invoice Title + Notice ---
  const titleEl = document.querySelector(".service-invoice-title");
  const htmlTitle = document.querySelector("title");
  const inputTaxNotice = document.getElementById("inputTaxNotice");
  let invoiceTitle = data.invoice_type || "SERVICE INVOICE";

  titleEl.textContent = invoiceTitle.toUpperCase();
  if(htmlTitle) htmlTitle.textContent = invoiceTitle.toUpperCase();
  inputTaxNotice.style.display = invoiceTitle.toUpperCase().includes("CREDIT") || invoiceTitle.toUpperCase().includes("DEBIT") ? "block" : "none";

  // Save extraFields for CSV / export use
  window._extraFields = extraFields;
}


// ============================
// Window onload — Fetch or Preview
// ============================
window.onload = async function() {
  const params = new URLSearchParams(window.location.search);
  const invoiceNo = params.get("invoice_no");
  const isPreviewMode = params.get("mode")==="preview";

  if(isPreviewMode){
    const previewData = JSON.parse(localStorage.getItem("invoicePreviewData") || "{}");
    if(!previewData || Object.keys(previewData).length === 0){
      alert("No preview data found.");
      return;
    }

    const inv = previewData.invoice || {};
    const normalizedInvoice = {
      billTo: inv.billTo || inv.bill_to || "",
      invoiceNumber: inv.invoiceNumber || inv.invoice_no || "",
      address1: inv.address1 || inv.address_1 || "",
      address2: inv.address2 || inv.address_2 || "",
      tin: inv.tin || inv.tin_no || "",
      terms: inv.terms || inv.terms || "",
      invoice_type: inv.invoice_type || inv.invoiceType || "SERVICE INVOICE",
      date: inv.invoiceDate || inv.date || ""
    };

    const comp = previewData.company || {};
    const normalizedCompany = {
      companyName: comp.companyName || comp.company_name || "",
      companyAddress: comp.companyAddress || comp.company_address || "",
      companyTel: comp.companyTel || comp.tel_no || "",
      companyTIN: comp.companyTIN || comp.vat_tin || "",
      logo_path: comp.logo_path || ""
    };

    const pay = previewData.payment || {};
   const normalizedPayment = {
  vatable_sales: pay.vatable_sales || pay.vatableSales || "0.00",
  vat_amount: pay.vat_amount || pay.vatAmount || "0.00",
  vat_exempt: pay.vat_exempt || pay.vatExemptSales || "0.00",
  zero_rated: pay.zero_rated || pay.zeroRatedSales || "0.00",
  subtotal: pay.subtotal || "0.00",                  
  discount: pay.discount || pay.discountAmount || "0.00",
  withholding: pay.withholding || pay.withholdingTax || "0.00",
  total: pay.total || pay.payable || pay.totalPayable || "0.00",
  prepared_by: pay.prepared_by || pay.preparedBy || "",
  approved_by: pay.approved_by || pay.approvedBy || "",
  received_by: pay.received_by || pay.receivedBy || ""
};


    const foot = previewData.footer || {};
    const normalizedFooter = {
      atp_no: foot.atp_no || foot.atpNo || "",
      atp_date: foot.atp_date || foot.atpDate || "",
      bir_permit_no: foot.bir_permit_no || foot.birPermit || "",
      bir_date: foot.bir_date || foot.birDate || "",
      serial_nos: foot.serial_nos || foot.serialNos || ""
    };

    const data = {
      company: normalizedCompany,
      invoice: normalizedInvoice,
      items: previewData.items || [],
      payment: normalizedPayment,
      footer: normalizedFooter
    };

    renderInvoice(data);
    return; 
  }

  if(!invoiceNo){
    alert("No invoice number provided in the URL.");
    return;
  }

  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
    if(!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderInvoice(data);
  } catch(err){
    console.error("❌ Error loading invoice:", err);
    alert("Error loading invoice — showing empty template.");
  }
};

// ============================
// EXPORT FUNCTIONS
// ============================
function toggleDropdown() {
  document.querySelector('.dropdown')?.classList.toggle('show');
}

window.onclick = function(event) {
  if (!event.target.matches('.export-btn')) {
    document.querySelectorAll('.dropdown.show').forEach(drop => drop.classList.remove('show'));
  }
};

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportInvoice(type) {
  const invoiceData = getInvoiceDataFromDOM();

  if (type === 'json') {
    downloadBlob(new Blob([JSON.stringify(invoiceData,null,2)], {type:'application/json'}), 'invoice.json');
  } else if(type==='xml') {
    downloadBlob(new Blob([objectToXml(invoiceData,'invoice')], {type:'application/xml'}), 'invoice.xml');
  } else if(type==='excel') {
    const csv = '\uFEFF' + objectToCSV(invoiceData);
    downloadBlob(new Blob([csv], {type:'text/csv'}), 'invoice.csv');
  }
}

// ============================
// UTILITY: DOM -> Invoice Data
// ============================
function getInvoiceDataFromDOM() {
  const getText = id => document.getElementById(id)?.textContent.trim() || "";

  const extraFields = window._extraFields || [];

  const itemRows = [];
  document.querySelectorAll('#itemRows tr').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length) {
      const item = {
        description: tds[0]?.textContent.trim(),
        quantity: tds[1]?.textContent.trim(),
        unit_price: tds[2]?.textContent.trim(),
        amount: tds[3]?.textContent.trim(),
      };
      extraFields.forEach((f, idx) => {
        item[f] = tds[4 + idx]?.textContent.trim() || "";
      });
      if (Object.values(item).some(v => v !== "")) itemRows.push(item);
    }
  });

  return {
    company: {
      companyName: getText('companyName'),
      companyAddress: getText('companyAddress'),
      companyTel: getText('companyTel'),
      companyTIN: getText('companyTIN')
    },
    invoice: {
      billTo: getText('billTo'),
      address1: getText('address1'),
      address2: getText('address2'),
      tin: getText('tin'),
      invoiceNumber: getText('invoiceNumber'),
      invoiceDate: getText('invoiceDate'),
      terms: getText('terms')
    },
    items: itemRows,
    payment: {
      vatableSales: getText('vatableSales'),
vatAmount: getText('vatAmount'),
vatExemptSales: getText('vatExemptSales'),
zeroRatedSales: getText('zeroRatedSales'),
subtotal: getText('subtotal'),
discount: getText('discount'),
withholdingTax: getText('withholdingTax'),
totalPayable: getText('totalPayable')

    },
    footer: {
      atpNo: getText('footer-atp-no'),
      atpDate: getText('footer-atp-date'),
      birPermit: getText('footer-bir-permit'),
      birDate: getText('footer-bir-date'),
      serialNos: getText('footer-serial-nos')
    }
  };
}


// ============================
// OBJECT -> XML / CSV
// ============================
function objectToXml(obj, rootName){
  let xml = `<${rootName}>`;
  for(let key in obj){
    if(Array.isArray(obj[key])){
      xml += `<${key}>`;
      obj[key].forEach(item=>xml+=objectToXml(item,'item'));
      xml += `</${key}>`;
    } else if(typeof obj[key]==='object' && obj[key]!==null){
      xml+=objectToXml(obj[key],key);
    } else{
      xml+=`<${key}>${escapeXml(obj[key]??'')}</${key}>`;
    }
  }
  xml+=`</${rootName}>`;
  return xml;
}
function escapeXml(unsafe){
  return String(unsafe).replace(/[<>&'"]/g,c=>{
    switch(c){
      case'<':return'&lt;';
      case'>':return'&gt;';
      case'&':return'&amp;';
      case"'":return'&apos;';
      case'"':return'&quot;';
    }
  });
}

function objectToCSV(obj) {
  let lines = [];
  lines.push(['Company Name', obj.company.companyName]);
  lines.push(['Company Address', obj.company.companyAddress]);
  lines.push(['Company Tel', obj.company.companyTel]);
  lines.push(['Company TIN', obj.company.companyTIN]);
  lines.push(['Bill To', obj.invoice.billTo]);
  lines.push(['Address 1', obj.invoice.address1]);
  lines.push(['Address 2', obj.invoice.address2]);
  lines.push(['TIN', obj.invoice.tin]);
  lines.push(['Invoice No', obj.invoice.invoiceNumber]);
  lines.push(['Invoice Date', obj.invoice.invoiceDate]);
  lines.push(['Terms', obj.invoice.terms]);
  lines.push(['--- Items ---']);

  const extraFields = window._extraFields || [];
  const headers = ['Description','Quantity','Unit Price','Amount', ...extraFields];
  lines.push(headers);

  obj.items.forEach(item => {
    const row = [
      item.description,
      item.quantity,
      item.unit_price,
      item.amount,
      ...extraFields.map(f => item[f] || "")
    ];
    lines.push(row);
  });

  lines.push(['--- Payment ---']);
  for(const k in obj.payment) lines.push([k,obj.payment[k]]);
  lines.push(['--- Footer ---']);
  for(const k in obj.footer) lines.push([k,obj.footer[k]]);

  return lines.map(row=>row.map(x=>`"${(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');
}

