document.addEventListener('DOMContentLoaded', () => {

  // --- Elements ---
  const invoicePrefixInput = document.getElementById('invoicePrefix');
  const savePrefixBtn = document.getElementById('savePrefix');
  const currentInvoiceNoInput = document.getElementById('currentInvoiceNo');
  const nextInvoiceNoInput = document.getElementById('nextInvoiceNo');
  const saveNextInvoiceBtn = document.getElementById('saveNextInvoice');
  const prefixMsg = document.getElementById('prefixMsg');

  const invoiceLayoutSelect = document.getElementById('invoiceLayout');
  const saveLayoutBtn = document.getElementById('saveLayout');
  const layoutMsg = document.getElementById('layoutMsg');

  // --- Load settings from backend ---
  async function loadInvoiceSettings() {
    try {
      const res = await fetch('/api/invoice-settings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load settings');

      const data = await res.json();

      invoicePrefixInput.value = data.prefix || 'INV-';
      currentInvoiceNoInput.value = data.last_number || 0;
      invoiceLayoutSelect.value = data.layout || 'standard';

      prefixMsg.textContent = '';
      layoutMsg.textContent = '';

    } catch (err) {
      console.error(err);
      prefixMsg.textContent = 'Error loading settings';
      prefixMsg.style.color = 'red';
      layoutMsg.textContent = 'Error loading settings';
      layoutMsg.style.color = 'red';
    }
  }

  loadInvoiceSettings();

  // --- Save prefix anytime ---
  savePrefixBtn?.addEventListener('click', async () => {
    const prefix = invoicePrefixInput.value.trim();

    if (!prefix) {
      prefixMsg.textContent = 'Prefix cannot be empty';
      prefixMsg.style.color = 'red';
      return;
    }

    try {
      const res = await fetch('/api/invoice-settings/prefix', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix })
      });

      if (!res.ok) throw new Error('Failed to save prefix');

      prefixMsg.textContent = 'Prefix saved!';
      prefixMsg.style.color = 'green';

      loadInvoiceSettings(); // refresh displayed data

    } catch (err) {
      console.error(err);
      prefixMsg.textContent = 'Error saving prefix';
      prefixMsg.style.color = 'red';
    }
  });

  // --- Override next invoice number (only once) ---
  saveNextInvoiceBtn?.addEventListener('click', async () => {
    const nextNumber = parseInt(nextInvoiceNoInput.value, 10);

    if (!nextNumber || nextNumber < 100000) {
      prefixMsg.textContent = 'Next invoice number must be ≥ 6 digits';
      prefixMsg.style.color = 'red';
      return;
    }

    try {
      const res = await fetch('/api/invoice-settings/next-number', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_number: nextNumber })
      });

      if (!res.ok) throw new Error('Failed to save next invoice number');

      prefixMsg.textContent = 'Next invoice number updated!';
      prefixMsg.style.color = 'green';
      nextInvoiceNoInput.value = '';

      loadInvoiceSettings(); // refresh last_number

    } catch (err) {
      console.error(err);
      prefixMsg.textContent = 'Error saving next invoice number';
      prefixMsg.style.color = 'red';
    }
  });

  // --- Save layout ---
  saveLayoutBtn?.addEventListener('click', async () => {
    const layout = invoiceLayoutSelect.value;

    try {
      const res = await fetch('/api/invoice-settings/layout', {
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
