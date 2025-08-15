window.onload = async function () {
  const params = new URLSearchParams(window.location.search);
  const invoiceNo = params.get('invoice_no');
 
  if (!invoiceNo) {
    alert("No invoice number provided in the URL.");
    return;
  }

  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? "" : num.toLocaleString('en-PH', {
      style: 'currency',
      currency: 'PHP'
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return isNaN(date) ? dateStr : date.toLocaleDateString('en-PH');
  };

  const fillLine = (labelText, value) => {
    document.querySelectorAll(".field").forEach(field => {
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

  const buildTable = (items, extraFields = []) => {
    const theadRow = document.getElementById("replica-thead-row");
    const colgroup = document.getElementById("invoice-colgroup");
    const tbody = document.getElementById("itemRows");

    theadRow.innerHTML = "";
    colgroup.innerHTML = "";
    tbody.innerHTML = "";

    // Table Headers
    const headers = [
      "ITEM DESCRIPTION / NATURE OF SERVICE",
      "QUANTITY",
      "UNIT PRICE",
      "AMOUNT",
      ...extraFields
    ];
    headers.forEach(label => {
      const th = document.createElement("th");
      th.textContent = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      theadRow.appendChild(th);
    });

    // Column widths
    const baseWidths = ["40%", "10%", "15%", "15%"];
    baseWidths.forEach(width => {
      const col = document.createElement("col");
      col.style.width = width;
      colgroup.appendChild(col);
    });

    if (extraFields.length > 0) {
      const extraWidth = (20 / extraFields.length).toFixed(2) + "%";
      extraFields.forEach(() => {
        const col = document.createElement("col");
        col.style.width = extraWidth;
        colgroup.appendChild(col);
      });
    }

    // Rows
    const TOTAL_ROWS = 21;
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const row = document.createElement("tr");
      const item = items[i] || {};
      const cells = [
        `<td>${item.description || "&nbsp;"}</td>`,
        `<td>${item.quantity || "&nbsp;"}</td>`,
        `<td>${item.unit_price ? formatCurrency(item.unit_price) : "&nbsp;"}</td>`,
        `<td>${item.amount ? formatCurrency(item.amount) : "&nbsp;"}</td>`,
        ...extraFields.map(f => `<td>${item[f] || "&nbsp;"}</td>`)
      ];
      row.innerHTML = cells.join("");
      tbody.appendChild(row);
    }
  };

  try {
    const res = await fetch(`/invoice-no/${encodeURIComponent(invoiceNo)}`);
    if (!res.ok) throw new Error("Failed to fetch invoice");

    const data = await res.json();
    console.log("📦 Loaded invoice data:", data);

    // Remove "Id" from extra columns if present
    const extraFields = Array.isArray(data.extra_columns) && data.extra_columns.length > 0
      ? Object.keys(data.extra_columns[0]).filter(key => key.toLowerCase() !== 'id')
      : [];

    buildTable(Array.isArray(data.items) ? data.items : [], extraFields);

    // Header info
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

    // Payment Section
    const payment = data.payment || {};
    fillById("cash", payment.cash ? "✔" : "");
    fillById("check", payment.check ? "✔" : "");
    fillById("checkNumber", payment.check_no);
    fillById("bank", payment.bank);
    fillById("paymentDate", formatDate(payment.pay_date));

    // Totals
    fillById("vatableSales", formatCurrency(payment.vatable_sales));
    fillById("vatExemptSales", formatCurrency(payment.vat_exempt));
    fillById("zeroRatedSales", formatCurrency(payment.zero_rated));
    fillById("vatAmount", formatCurrency(payment.vat_amount));
    fillById("lessVAT", formatCurrency(payment.less_vat));
    fillById("netOfVAT", formatCurrency(payment.net_vat));
    fillById("withholdingTax", formatCurrency(payment.withholding_tax));
    fillById("total", formatCurrency(payment.total));
    fillById("totalDue", formatCurrency(payment.total_due));
    fillById("totalPayable", formatCurrency(payment.total_payable));

    // Signatures
    fillById("preparedBy", payment.prepared_by || "");
    fillById("approvedBy", payment.approved_by || "");
    fillById("receivedBy", payment.received_by || "");

  } catch (err) {
    console.error(err);
    alert("Error loading invoice — showing empty template.");
  }
};
