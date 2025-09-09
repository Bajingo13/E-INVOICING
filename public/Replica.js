console.log("✅ REPLICA.js loaded");

window.onload = async function () {
  const params = new URLSearchParams(window.location.search);
  const invoiceNo = params.get("invoice_no");

  if (!invoiceNo) {
    alert("No invoice number provided in the URL.");
    return;
  }

  // ---------- Helpers ----------
  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num)
      ? ""
      : num.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
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

  // ---------- Build Items Table ----------
  const buildTable = (items) => {
    const theadRow = document.getElementById("replica-thead-row");
    const colgroup = document.getElementById("invoice-colgroup");
    const tbody = document.getElementById("itemRows");

    theadRow.innerHTML = "";
    colgroup.innerHTML = "";
    tbody.innerHTML = "";

    // Detect extra fields dynamically
    let extraFieldsSet = new Set();
    items.forEach((it) => {
      Object.keys(it || {}).forEach((k) => {
        if (
          !["description", "quantity", "unit_price", "amount", "invoice_id", "id"].includes(
            k.toLowerCase()
          ) &&
          it[k] != null &&
          it[k] !== ""
        ) {
          extraFieldsSet.add(k);
        }
      });
    });
    const extraFields = Array.from(extraFieldsSet);

    // Headers
    const headers = [
      "Item Description / Nature of Service",
      "Quantity",
      "Unit Price",
      "Amount",
      ...extraFields,
    ];
    headers.forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      theadRow.appendChild(th);
    });

    // Column widths
    const baseWidths = ["40%", "10%", "15%", "15%"];
    baseWidths.forEach((width) => {
      const col = document.createElement("col");
      col.style.width = width;
      colgroup.appendChild(col);
    });
    if (extraFields.length > 0) {
      const extraWidth = ((100 - 40 - 10 - 15 - 15) / extraFields.length).toFixed(2) + "%";
      extraFields.forEach(() => {
        const col = document.createElement("col");
        col.style.width = extraWidth;
        colgroup.appendChild(col);
      });
    }

    // Fixed 20 rows
    const TOTAL_ROWS = 20;
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const row = document.createElement("tr");
      const item = items[i] || {};
      const cells = [
        `<td>${item.description || "&nbsp;"}</td>`,
        `<td>${item.quantity || "&nbsp;"}</td>`,
        `<td>${item.unit_price ? formatCurrency(item.unit_price) : "&nbsp;"}</td>`,
        `<td>${item.amount ? formatCurrency(item.amount) : "&nbsp;"}</td>`,
        ...extraFields.map((f) => `<td>${item[f] != null ? item[f] : "&nbsp;"}</td>`),
      ];
      row.innerHTML = cells.join("");
      tbody.appendChild(row);
    }
  };

  // ---------- Main Fetch ----------
  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to fetch invoice: ${res.status} ${errorText}`);
    }
    const data = await res.json();
    console.log("📦 Loaded invoice data:", data);

    // --- Company Info & Logo ---
    if (data.company) {
      fillById("companyName", data.company.company_name);
      fillById("companyAddress", data.company.company_address);
      fillById("companyTel", data.company.tel_no);
      fillById("companyTIN", data.company.vat_tin);

      if (data.company.logo_path) {
        const logoEl = document.getElementById("uploaded-logo");
        logoEl.src = data.company.logo_path;
        logoEl.style.display = "block";
      }
    }

    // --- Items Table ---
    buildTable(Array.isArray(data.items) ? data.items : []);

    // --- Invoice Header Info ---
    fillLine("BILL TO", data.bill_to);
    fillLine("ADDRESS", `${data.address1 || ""} ${data.address2 || ""}`.trim());
    fillLine("N", data.invoice_no);
    fillLine("DATE", formatDate(data.date));
    fillLine("TIN", data.tin);
    fillLine("TERMS", data.terms);

    fillById("billTo", data.bill_to);
    fillById("address1", data.address1);
    fillById("address2", data.address2);
    fillById("invoiceNumber", data.invoice_no);
    fillById("invoiceDate", formatDate(data.date));
    fillById("tin", data.tin);
    fillById("terms", data.terms);

    // --- Payment Section ---
    const payment = data.payment || {};
    fillById("cash", payment.cash ? "✔" : "");
    fillById("check", payment.check_payment ? "✔" : "");
    fillById("checkNumber", payment.check_no);
    fillById("bank", payment.bank);
    fillById("paymentDate", formatDate(payment.pay_date));

    fillById("vatableSales", formatCurrency(payment.vatable_sales));
    fillById("vatExemptSales", formatCurrency(payment.vat_exempt));
    fillById("zeroRatedSales", formatCurrency(payment.zero_rated));
    fillById("vatAmount", formatCurrency(payment.vat_amount));
    fillById("lessVAT", formatCurrency(payment.less_vat));
    fillById("netOfVAT", formatCurrency(payment.net_vat));
    fillById("withholdingTax", formatCurrency(payment.withholding));
    fillById("total", formatCurrency(payment.total));
    fillById("totalDue", formatCurrency(payment.due));
    fillById("totalPayable", formatCurrency(payment.payable));

    // --- Signatures ---
    fillById("preparedBy", payment.prepared_by);
    fillById("approvedBy", payment.approved_by);
    fillById("receivedBy", payment.received_by);

    // --- Footer ---
    if (data.footer) {
      fillById("footer-atp-no", data.footer.atp_no);
      fillById("footer-atp-date", formatDate(data.footer.atp_date));
      fillById("footer-bir-permit", data.footer.bir_permit_no);
      fillById("footer-bir-date", formatDate(data.footer.bir_date));
      fillById("footer-serial-nos", data.footer.serial_nos);
    }
  } catch (err) {
    console.error("❌ Error loading invoice:", err);
    alert("Error loading invoice — showing empty template.");
  }
};
