'use strict';

const $ = (id) => document.getElementById(id);

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function setLoading(isLoading, title = 'Loading…', subtitle = 'Fetching tax summary data') {
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
  $('stateSubtitle').textContent = msg || 'Failed to load tax summary.';
  spinner.hidden = true;
  state.hidden = false;
}

function buildQuery() {
  const from = $('from-date').value;
  const to = $('to-date').value;
  const customer = $('customer-filter').value.trim();
  const group = window.__TAX_GROUP_MODE__ || 'month'; // month | customer

  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (customer) qs.set('customer', customer);
  qs.set('group', group);

  return qs.toString();
}

function debounce(fn, wait = 350) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

let currentController = null;

async function loadTaxSummary() {
  try {
    if (currentController) currentController.abort();
    currentController = new AbortController();

    setLoading(true);
    setStatus('Loading', 'loading');

    const qs = buildQuery();
    const url = `/api/reports/sales-tax-summary?${qs}`;

    const res = await fetch(url, { signal: currentController.signal });
    if (!res.ok) throw new Error(`Failed to fetch tax summary (${res.status})`);

    const data = await res.json();

    const tbody = $('tax-table');
    tbody.innerHTML = '';

    // Totals
    let tVatable = 0, tExempt = 0, tZero = 0, tVat = 0, tGross = 0, tCount = 0;

    if (!Array.isArray(data) || data.length === 0) {
      $('sum-vatable').textContent = money(0);
      $('sum-exempt').textContent = money(0);
      $('sum-zero').textContent = money(0);
      $('sum-vat').textContent = money(0);
      $('resultsMeta').textContent = '—';

      setLoading(false);
      setStatus('Ready', 'ready');
      showEmptyState();
      return;
    }

    const frag = document.createDocumentFragment();

    for (const r of data) {
      const vatable = Number(r.vatable_sales || 0);
      const exempt = Number(r.vat_exempt_sales || 0);
      const zero = Number(r.zero_rated_sales || 0);
      const outVat = Number(r.output_vat || 0);
      const gross = Number(r.gross_sales || 0);
      const count = Number(r.invoice_count || 0);

      tVatable += vatable;
      tExempt += exempt;
      tZero += zero;
      tVat += outVat;
      tGross += gross;
      tCount += count;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-period">${r.period || ''}</td>
        <td>${r.customer || '—'}</td>
        <td>${r.tin || ''}</td>
        <td class="col-num">${money(vatable)}</td>
        <td class="col-num">${money(exempt)}</td>
        <td class="col-num">${money(zero)}</td>
        <td class="col-num">${money(outVat)}</td>
        <td class="col-num">${money(gross)}</td>
        <td class="col-num">${count || 0}</td>
      `;
      frag.appendChild(tr);
    }

    tbody.appendChild(frag);

    $('sum-vatable').textContent = money(tVatable);
    $('sum-exempt').textContent = money(tExempt);
    $('sum-zero').textContent = money(tZero);
    $('sum-vat').textContent = money(tVat);

    const from = $('from-date').value || 'All time';
    const to = $('to-date').value || 'All time';
    const group = window.__TAX_GROUP_MODE__ || 'month';

    $('resultsMeta').textContent = `Rows: ${data.length} • Group: ${group} • ${from} → ${to}`;

    setLoading(false);
    $('stateBox').hidden = true;
    setStatus('Loaded', 'ready');

  } catch (err) {
    if (err?.name === 'AbortError') return;

    console.error('❌ Load tax summary error:', err);
    setLoading(false);
    setStatus('Error', 'error');
    showErrorState(err.message);
  }
}

function exportTaxSummary() {
  const qs = buildQuery();
  window.location.href = `/api/reports/sales-tax-summary/excel?${qs}`;
}

const loadDebounced = debounce(loadTaxSummary, 350);

function toggleGroupMode() {
  const btn = $('btnGroupToggle');
  const cur = window.__TAX_GROUP_MODE__ || 'month';
  const next = cur === 'month' ? 'customer' : 'month';
  window.__TAX_GROUP_MODE__ = next;
  if (btn) btn.textContent = `Group: ${next === 'month' ? 'Month' : 'Customer'}`;
  loadTaxSummary();
}

window.addEventListener('DOMContentLoaded', () => {
  window.__TAX_GROUP_MODE__ = 'month';

  const fromEl = $('from-date');
  const toEl = $('to-date');
  const custEl = $('customer-filter');

  fromEl.addEventListener('change', loadTaxSummary);
  toEl.addEventListener('change', loadTaxSummary);
  custEl.addEventListener('input', loadDebounced);

  const exportBtn = $('btnExport');
  if (exportBtn) exportBtn.addEventListener('click', exportTaxSummary);

  const groupBtn = $('btnGroupToggle');
  if (groupBtn) groupBtn.addEventListener('click', toggleGroupMode);

  const exitBtn = $('btnExit');
  if (exitBtn) exitBtn.addEventListener('click', () => window.location.href = '/dashboard');

  loadTaxSummary();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.location.href = '/dashboard';
});

// expose if needed
window.loadTaxSummary = loadTaxSummary;
window.exportTaxSummary = exportTaxSummary;
