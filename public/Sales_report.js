'use strict';

const $ = (id) => document.getElementById(id);

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '';
  const s = String(d);
  return s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
}

function setStatus(text, tone = 'ready') {
  const pill = $('statusPill');
  if (!pill) return;

  pill.textContent = text;

  pill.style.background = tone === 'error'
    ? 'rgba(220,38,38,.12)'
    : tone === 'loading'
      ? 'rgba(78,84,200,.12)'
      : 'rgba(16,185,129,.14)';

  pill.style.color = tone === 'error'
    ? '#991b1b'
    : tone === 'loading'
      ? '#2b2f8a'
      : '#065f46';

  pill.style.borderColor = tone === 'error'
    ? 'rgba(220,38,38,.18)'
    : tone === 'loading'
      ? 'rgba(78,84,200,.18)'
      : 'rgba(16,185,129,.22)';
}

function setLoading(isLoading, title = 'Loading…', subtitle = 'Fetching sales data') {
  const state = $('stateBox');
  const spinner = $('spinner');
  const t = $('stateTitle');
  const st = $('stateSubtitle');

  if (!state) return;

  if (isLoading) {
    state.hidden = false;
    spinner.hidden = false;
    t.textContent = title;
    st.textContent = subtitle;
  } else {
    state.hidden = true;
    spinner.hidden = true;
  }

  const exportBtn = $('btnExport');
  if (exportBtn) exportBtn.disabled = isLoading;
}

function showEmptyState() {
  const state = $('stateBox');
  const spinner = $('spinner');
  $('stateTitle').textContent = 'No results';
  $('stateSubtitle').textContent = 'Try adjusting your filters.';
  spinner.hidden = true;
  state.hidden = false;
}

function showErrorState(msg) {
  const state = $('stateBox');
  const spinner = $('spinner');
  $('stateTitle').textContent = 'Something went wrong';
  $('stateSubtitle').textContent = msg || 'Failed to load sales.';
  spinner.hidden = true;
  state.hidden = false;
}

function buildQuery() {
  const from = $('from-date').value;
  const to = $('to-date').value;
  const customer = $('customer-filter').value.trim();

  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (customer) qs.set('customer', customer);

  return qs.toString();
}

// ---- Debounce helper ----
function debounce(fn, wait = 350) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---- Cancel previous request if user types fast ----
let currentController = null;

async function loadSales() {
  try {
    // cancel in-flight request
    if (currentController) currentController.abort();
    currentController = new AbortController();

    setLoading(true);
    setStatus('Loading', 'loading');

    const qs = buildQuery();
    const url = qs ? `/api/reports/sales?${qs}` : `/api/reports/sales`;

    const res = await fetch(url, { signal: currentController.signal });
    if (!res.ok) throw new Error(`Failed to fetch sales (${res.status})`);

    const data = await res.json();

    const tbody = $('sales-table');
    tbody.innerHTML = '';

    let totalNet = 0, totalVat = 0, totalGross = 0;

    if (!Array.isArray(data) || data.length === 0) {
      $('total-sales').textContent = money(0);
      $('total-vat').textContent = money(0);
      $('total-gross').textContent = money(0);
      $('total-count').textContent = '0';
      $('resultsMeta').textContent = '—';

      setLoading(false);
      setStatus('Ready', 'ready');
      showEmptyState();
      return;
    }

    const frag = document.createDocumentFragment();

    for (const r of data) {
      const net = Number(r.net_amount || 0);
      const vat = Number(r.vat_amount || 0);
      const gross = Number(r.gross_amount || 0);

      totalNet += net;
      totalVat += vat;
      totalGross += gross;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtDate(r.invoice_date)}</td>
        <td>${r.invoice_no || ''}</td>
        <td>${r.customer || ''}</td>
        <td>${r.tin || ''}</td>
        <td class="col-num">${money(net)}</td>
        <td class="col-num">${money(vat)}</td>
        <td class="col-num">${money(gross)}</td>
      `;
      frag.appendChild(tr);
    }

    tbody.appendChild(frag);

    $('total-sales').textContent = money(totalNet);
    $('total-vat').textContent = money(totalVat);
    $('total-gross').textContent = money(totalGross);
    $('total-count').textContent = String(data.length);

    const from = $('from-date').value || 'All time';
    const to = $('to-date').value || 'All time';
    $('resultsMeta').textContent = `Showing ${data.length} invoice(s) • ${from} → ${to}`;

    setLoading(false);
    $('stateBox').hidden = true;
    setStatus('Loaded', 'ready');

  } catch (err) {
    // ignore abort errors (user typed again)
    if (err?.name === 'AbortError') return;

    console.error('❌ Load sales error:', err);
    setLoading(false);
    setStatus('Error', 'error');
    showErrorState(err.message);
  }
}

function exportSales() {
  const qs = buildQuery();
  const url = qs ? `/api/reports/sales/excel?${qs}` : `/api/reports/sales/excel`;
  window.location.href = url;
}

// Auto-update triggers
const loadSalesDebounced = debounce(loadSales, 350);

window.addEventListener('DOMContentLoaded', () => {
  const fromEl = $('from-date');
  const toEl = $('to-date');
  const custEl = $('customer-filter');
  const exportBtn = $('btnExport');

  // Dates: instant update
  fromEl.addEventListener('change', loadSales);
  toEl.addEventListener('change', loadSales);

  // Customer typing: debounced update
  custEl.addEventListener('input', loadSalesDebounced);

  // Export button
  if (exportBtn) exportBtn.addEventListener('click', exportSales);

  // initial load
  loadSales();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.location.href = '/dashboard';
  }
});


const exitBtn = document.getElementById('btnExit');
if (exitBtn) {
  exitBtn.addEventListener('click', () => {
    window.location.href = '/dashboard';
  });
}

// expose if needed
window.loadSales = loadSales;
window.exportSales = exportSales;
