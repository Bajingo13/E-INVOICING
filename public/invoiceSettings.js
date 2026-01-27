document.addEventListener('DOMContentLoaded', () => {

  const invoicePrefixInput = document.getElementById('invoicePrefix');
  const savePrefixBtn = document.getElementById('savePrefix');
  const currentInvoiceNoInput = document.getElementById('currentInvoiceNo');
  const nextInvoiceNoInput = document.getElementById('nextInvoiceNo');
  const saveNextInvoiceBtn = document.getElementById('saveNextInvoice');

  const prefixMsg = document.getElementById('prefixMsg');
  const nextNumberMsg = document.getElementById('nextNumberMsg'); // <-- add this

  const invoiceLayoutSelect = document.getElementById('invoiceLayout');
  const saveLayoutBtn = document.getElementById('saveLayout');
  const layoutMsg = document.getElementById('layoutMsg');

  const BASE_URL = '';

  function padInvoiceNumber(num) {
    return String(num).padStart(6, '0');
  }

  async function loadInvoiceSettings() {
    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load settings');

      const data = await res.json();

      invoicePrefixInput.value = data.prefix || 'INV-';

      // ===== FIXED HERE =====
      currentInvoiceNoInput.value = padInvoiceNumber(data.last_number || 0);
      nextInvoiceNoInput.value = padInvoiceNumber((data.last_number || 0) + 1);

      invoiceLayoutSelect.value = data.layout || 'standard';

      prefixMsg.textContent = '';
      layoutMsg.textContent = '';
      nextNumberMsg.textContent = ''; // <-- clear it too

    } catch (err) {
      console.error(err);
      prefixMsg.textContent = 'Error loading settings';
      prefixMsg.style.color = 'red';
      layoutMsg.textContent = 'Error loading settings';
      layoutMsg.style.color = 'red';
    }
  }

  loadInvoiceSettings();

  savePrefixBtn?.addEventListener('click', async () => {
    const prefix = invoicePrefixInput.value.trim();
    if (prefix.length < 2) {
      prefixMsg.textContent = 'Prefix must be at least 2 characters';
      prefixMsg.style.color = 'red';
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings/prefix`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix })
      });

      if (!res.ok) throw new Error('Failed to save prefix');

      prefixMsg.textContent = 'Prefix saved!';
      prefixMsg.style.color = 'green';

      loadInvoiceSettings();

    } catch (err) {
      console.error(err);
      prefixMsg.textContent = 'Error saving prefix';
      prefixMsg.style.color = 'red';
    }
  });

  saveNextInvoiceBtn?.addEventListener('click', async () => {
    const nextNumber = Number(nextInvoiceNoInput.value);

    if (!Number.isInteger(nextNumber) || nextNumber < 100000) {
      nextNumberMsg.textContent = 'Next invoice number must be at least 6 digits';
      nextNumberMsg.style.color = 'red';
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings/next-number`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_number: nextNumber })
      });

      if (!res.ok) throw new Error('Failed to save next invoice number');

      nextNumberMsg.textContent = 'Next invoice number updated!';
      nextNumberMsg.style.color = 'green';
      nextInvoiceNoInput.value = '';

      loadInvoiceSettings();

    } catch (err) {
      console.error(err);
      nextNumberMsg.textContent = 'Error saving next invoice number';
      nextNumberMsg.style.color = 'red';
    }
  });

  saveLayoutBtn?.addEventListener('click', async () => {
    const layout = invoiceLayoutSelect.value;

    try {
      const res = await fetch(`${BASE_URL}/api/invoice-settings/layout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout })
      });

      if (!res.ok) throw new Error('Failed to save layout'); 

      layoutMsg.textContent = 'Layout saved!';
      layoutMsg.style.color = 'green';

    } catch (err) {
      console.error(err);
      layoutMsg.textContent = 'Error saving layout';
      layoutMsg.style.color = 'red';
    }
  });

});
