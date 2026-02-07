'use strict';

// ===== DOM ELEMENTS =====
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const preview = document.getElementById('preview');
const previewJson = document.getElementById('preview-json');
const uploadBtn = document.getElementById('upload-btn');
const statusEl = document.getElementById('status');

let currentFile = null;

// ===== DRAG & DROP STYLING =====
['dragenter', 'dragover'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
  });
});

// ===== FILE DROP =====
dropZone.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  handleFile(f);
});

// ===== FILE SELECT =====
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  handleFile(f);
});

// ===== UPLOAD & SAVE BUTTON =====
uploadBtn.addEventListener('click', async () => {
  if (!currentFile) return setStatus('No file selected', true);

  try {
    setStatus('Uploading and saving...');
    uploadBtn.disabled = true;

    const form = new FormData();
    form.append('file', currentFile);

    // 1️⃣ Upload & parse
    const parseRes = await fetch('/api/invoices/import', { method: 'POST', body: form });
    if (!parseRes.ok) throw new Error('Upload failed');
    const parseData = await parseRes.json();

    if (!parseData.preview || !parseData.preview.length) {
      setStatus('No rows found in the file', true);
      uploadBtn.disabled = false;
      return;
    }

    // 2️⃣ Save to DB
    const saveRes = await fetch('/api/invoices/import/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parseData.preview)
    });
    const saveData = await saveRes.json();
    if (!saveRes.ok) throw new Error(saveData.error || 'Save failed');

    setStatus(
      `✅ Saved ${saveData.inserted} invoices (${saveData.skipped || 0} skipped)`,
      false,
      true
    );

    // Clear current file & preview
    currentFile = null;
    preview.hidden = true;
    previewJson.textContent = '';

  } catch (err) {
    console.error(err);
    setStatus('Error: ' + (err.message || 'Unknown'), true);
  } finally {
    uploadBtn.disabled = false;
  }
});

// ===== HANDLE FILE =====
function handleFile(file) {
  if (!file) return;
  const allowedExts = ['xlsx', 'xls', 'csv'];
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (!allowedExts.includes(ext)) {
    setStatus('Unsupported file type — please upload .xlsx, .xls or .csv', true);
    return;
  }

  currentFile = file;
  setStatus(`Selected file: ${file.name}`);

  const reader = new FileReader();
  reader.onload = () => {
    if (ext === 'csv') {
      previewJson.textContent = reader.result.slice(0, 20000);
    } else {
      previewJson.textContent = `Binary file detected (${file.name}). Click "Upload & Save" to parse and save to DB.`;
    }
    preview.hidden = false;
  };

  if (ext === 'csv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

// ===== SET STATUS =====
function setStatus(msg, isError = false, isSuccess = false) {
  statusEl.textContent = msg;
  statusEl.classList.remove('success');
  statusEl.style.color = '';

  if (isError) statusEl.style.color = 'crimson';
  if (isSuccess) {
    statusEl.classList.add('success');
    statusEl.style.color = '';
  }
}
