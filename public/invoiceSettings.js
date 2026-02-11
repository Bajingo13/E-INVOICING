document.addEventListener('DOMContentLoaded', () => {

  const invoicePrefixInput = document.getElementById('invoicePrefix');
  const savePrefixBtn = document.getElementById('savePrefix');
  const currentInvoiceNoInput = document.getElementById('currentInvoiceNo');
  const nextInvoiceNoInput = document.getElementById('nextInvoiceNo');
  const saveNextInvoiceBtn = document.getElementById('saveNextInvoice');

  const prefixMsg = document.getElementById('prefixMsg');
  const nextNumberMsg = document.getElementById('nextNumberMsg');

  const invoiceLayoutSelect = document.getElementById('invoiceLayout');
  const saveLayoutBtn = document.getElementById('saveLayout');
  const layoutMsg = document.getElementById('layoutMsg');

  // ===== TAX DEFAULTS =====
  const salesTaxDefaultSelect = document.getElementById('salesTaxDefault');
  const purchaseTaxDefaultSelect = document.getElementById('purchaseTaxDefault');
  const saveTaxDefaultsBtn = document.getElementById('saveTaxDefaults');
  const taxDefaultsMsg = document.getElementById('taxDefaultsMsg');

  const BASE_URL = '';

  function padInvoiceNumber(num) {
    return String(num).padStart(6, '0');
  }

  function setMsg(el, text, color = 'green') {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = color;
  }

  async function loadInvoiceSettings() {
    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load settings');

      const data = await res.json();

      // Prefix
      if (invoicePrefixInput) invoicePrefixInput.value = data.prefix || 'INV-';

      // Last & Next number (display)
      const lastNum = Number(data.last_number || 0);
      if (currentInvoiceNoInput) currentInvoiceNoInput.value = padInvoiceNumber(lastNum);
      if (nextInvoiceNoInput) nextInvoiceNoInput.value = padInvoiceNumber(lastNum + 1);

      // Layout
      if (invoiceLayoutSelect) invoiceLayoutSelect.value = data.layout || 'standard';

      // Tax Defaults
      if (salesTaxDefaultSelect) salesTaxDefaultSelect.value = data.sales_tax_default || 'inclusive';
      if (purchaseTaxDefaultSelect) purchaseTaxDefaultSelect.value = data.purchase_tax_default || 'inclusive';

      // Clear messages
      setMsg(prefixMsg, '');
      setMsg(layoutMsg, '');
      setMsg(nextNumberMsg, '');
      setMsg(taxDefaultsMsg, '');

    } catch (err) {
      console.error(err);
      setMsg(prefixMsg, 'Error loading settings', 'red');
      setMsg(layoutMsg, 'Error loading settings', 'red');
      setMsg(nextNumberMsg, '', 'red');
      setMsg(taxDefaultsMsg, 'Error loading tax defaults', 'red');
    }
  }

  // Initial load
  loadInvoiceSettings();

  // ---------------- SAVE PREFIX ----------------
  savePrefixBtn?.addEventListener('click', async () => {
    const prefix = (invoicePrefixInput?.value || '').trim();

    if (prefix.length < 2) {
      setMsg(prefixMsg, 'Prefix must be at least 2 characters', 'red');
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings/prefix`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix })
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || 'Failed to save prefix');

      setMsg(prefixMsg, 'Prefix saved!', 'green');
      loadInvoiceSettings();

    } catch (err) {
      console.error(err);
      setMsg(prefixMsg, err.message || 'Error saving prefix', 'red');
    }
  });

  // ---------------- SAVE NEXT NUMBER ----------------
  saveNextInvoiceBtn?.addEventListener('click', async () => {
    const nextNumber = Number(nextInvoiceNoInput?.value);

    if (!Number.isInteger(nextNumber) || nextNumber < 100000) {
      setMsg(nextNumberMsg, 'Next invoice number must be at least 6 digits', 'red');
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings/next-number`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_number: nextNumber })
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || 'Failed to save next invoice number');

      setMsg(nextNumberMsg, 'Next invoice number updated!', 'green');
      if (nextInvoiceNoInput) nextInvoiceNoInput.value = '';
      loadInvoiceSettings();

    } catch (err) {
      console.error(err);
      setMsg(nextNumberMsg, err.message || 'Error saving next invoice number', 'red');
    }
  });

  // ---------------- SAVE LAYOUT ----------------
  saveLayoutBtn?.addEventListener('click', async () => {
    const layout = invoiceLayoutSelect?.value;

    if (!layout) {
      setMsg(layoutMsg, 'Layout is required', 'red');
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings/layout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout })
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || 'Failed to save layout');

      setMsg(layoutMsg, 'Layout saved!', 'green');

    } catch (err) {
      console.error(err);
      setMsg(layoutMsg, err.message || 'Error saving layout', 'red');
    }
  });

  // ---------------- SAVE TAX DEFAULTS ----------------
  saveTaxDefaultsBtn?.addEventListener('click', async () => {
    const sales_tax_default = salesTaxDefaultSelect?.value || 'inclusive';
    const purchase_tax_default = purchaseTaxDefaultSelect?.value || 'inclusive';

    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings/tax-defaults`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sales_tax_default, purchase_tax_default })
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || 'Failed to save tax defaults');

      setMsg(taxDefaultsMsg, 'Tax defaults saved!', 'green');
      loadInvoiceSettings();

    } catch (err) {
      console.error(err);
      setMsg(taxDefaultsMsg, err.message || 'Error saving tax defaults', 'red');
    }
  });

});
