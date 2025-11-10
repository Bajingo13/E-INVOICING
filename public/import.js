// import.js
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const preview = document.getElementById('preview');
const previewJson = document.getElementById('preview-json');
const uploadBtn = document.getElementById('upload-btn');
const statusEl = document.getElementById('status');

let currentFile = null;
let parsedPreview = null;

// visual drag handlers
['dragenter', 'dragover'].forEach(ev => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(ev => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  handleFile(f);
});

fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  handleFile(f);
});

uploadBtn.addEventListener('click', () => {
  if (!currentFile) return;
  uploadFile(currentFile);
});

function handleFile(file) {
  if (!file) return;
  const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                   'application/vnd.ms-excel', 'text/csv'];
  // No hard-block: accept by extension too
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    setStatus('Unsupported file type — please upload .xlsx, .xls or .csv', true);
    return;
  }

  currentFile = file;
  setStatus(`Selected: ${file.name}`);
  // Attempt client preview by reading file as binary/text and showing first rows (minimal)
  const reader = new FileReader();
  reader.onload = (ev) => {
    const content = ev.target.result;
    // For privacy & simplicity: show first 20k chars for CSV, or note for XLSX
    if (ext === 'csv') {
      const text = content.slice(0, 20000);
      previewJson.textContent = text;
    } else {
      previewJson.textContent = `Binary file detected (${file.name}). Preview is limited in-browser. Click "Upload to server" to parse.`;
    }
    preview.hidden = false;
  };

  if (ext === 'csv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  setStatus('Uploading...');
  fetch('/import', {
    method: 'POST',
    body: form
  })
  .then(res => {
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  })
  .then(data => {
    setStatus('Upload successful', false, true);
    // show parsed JSON (truncate if huge)
    const pretty = JSON.stringify(data.rows || data, null, 2);
    previewJson.textContent = pretty.slice(0, 20000) + (pretty.length > 20000 ? '\n\n...truncated...' : '');
  })
  .catch(err => {
    console.error(err);
    setStatus('Error: ' + (err.message || 'Unknown'), true);
  });
}

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
