// ====== Keyboard Shortcuts Manager ======
document.addEventListener('keydown', (e) => {
  const activeElement = document.activeElement.tagName;
  const modalOpen = document.querySelector('.modal')?.style.display === 'flex';
  
  // Prevent triggering shortcuts while typing
  const typingElements = ['INPUT', 'TEXTAREA', 'SELECT'];
  const isTyping = typingElements.includes(activeElement) && !modalOpen;

  // === SHORTCUTS ===
  
  // ---------- New Contact ----------
  if (!isTyping && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    if (typeof openContactModal === 'function') openContactModal();
  }

  // ---------- New Invoice ----------
  if (!isTyping && e.ctrlKey && e.key.toLowerCase() === 'n' && !e.shiftKey) {
    e.preventDefault();
    if (typeof openInvoiceForm === 'function') openInvoiceForm();
  }

  // ---------- Save ----------
  if ((e.ctrlKey && e.key.toLowerCase() === 's') || (e.key === 'Enter' && modalOpen)) {
    e.preventDefault();
    document.getElementById('modalSave')?.click();
    document.getElementById('invoiceSave')?.click();
  }

  // ---------- Cancel / Close ----------
  if (e.key === 'Escape') {
    e.preventDefault();
    if (typeof closeContactModal === 'function') closeContactModal();
    if (typeof closeInvoiceForm === 'function') closeInvoiceForm();
  }

  // ---------- Edit ----------
  if (!isTyping && e.ctrlKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    document.querySelector('tr.selected')?.querySelector('.edit-btn')?.click();
    document.getElementById('invoiceEdit')?.click();
  }

  // ---------- Delete ----------
  if (!isTyping && e.ctrlKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    document.querySelector('tr.selected')?.querySelector('.delete-btn')?.click();
    document.getElementById('invoiceDelete')?.click();
  }

  // ---------- Search ----------
  if (!isTyping && e.ctrlKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    document.querySelector('#searchInput, #invoiceSearch')?.focus();
  }

  // ---------- Print ----------
  if (!isTyping && e.ctrlKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    window.print();
  }

});
