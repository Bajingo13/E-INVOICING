'use strict';

// =========================================================
// COMPANY INFO PAGE SCRIPT
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  // ====== ELEMENT REFERENCES ======
  const logoInput = document.getElementById('logo');
  const logoImg = document.getElementById('uploaded-logo');
  const removeBtn = document.getElementById('remove-logo-btn');
  const companyForm = document.getElementById('companyForm');

  // If page structure changes, don't hard-crash
  if (!companyForm) {
    console.warn('[CompanyInfo] companyForm not found');
    return;
  }

  // ✅ Correct API base (per your server.js)
  const API_URL = '/api/company-info';

  // ====== UI HELPERS ======
  const showLogoUI = (src) => {
    if (logoImg) {
      logoImg.src = src || '';
      logoImg.style.display = src ? 'block' : 'none';
    }
    if (removeBtn) {
      removeBtn.style.display = src ? 'inline-block' : 'none';
    }
  };

  const clearLogoUI = () => {
    if (logoInput) logoInput.value = '';
    showLogoUI('');
  };

  const toast = (msg) => alert(msg); // swap with nicer toast anytime

  // Default hidden (in case CSS not applied)
  showLogoUI('');

  // ====== SAFE JSON HELPER (prevents Unexpected token '<') ======
  async function readJsonSafely(res) {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();

    // If server returned HTML, show a meaningful error
    if (!ct.includes('application/json')) {
      return {
        ok: false,
        data: null,
        raw: text,
        error: `Expected JSON but got "${ct || 'unknown'}".`
      };
    }

    try {
      return { ok: true, data: JSON.parse(text), raw: text, error: null };
    } catch (e) {
      return { ok: false, data: null, raw: text, error: 'Invalid JSON response.' };
    }
  }

  // ====== LOGO PREVIEW ======
  if (logoInput) {
    logoInput.addEventListener('change', (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      // Basic validation (tweak as needed)
      const maxMB = 2;
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

      if (!allowed.includes(file.type)) {
        toast('❌ Please upload a PNG, JPG, or WEBP image.');
        clearLogoUI();
        return;
      }

      if (file.size > maxMB * 1024 * 1024) {
        toast(`❌ Logo is too large. Max ${maxMB}MB.`);
        clearLogoUI();
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result;
        if (typeof src === 'string') showLogoUI(src);
      };
      reader.readAsDataURL(file);
    });
  }

  // ====== REMOVE LOGO ======
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      clearLogoUI();
      // Note: this only clears UI. If you also want to delete from server,
      // add a DELETE endpoint and call it here.
    });
  }

  // ====== SAVE COMPANY INFO ======
  companyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const formData = new FormData(companyForm);

      const res = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        credentials: 'include' // ok even if you're not using session yet
      });

      const parsed = await readJsonSafely(res);

      if (!res.ok || !parsed.ok) {
        console.error('[CompanyInfo] save failed:', res.status, parsed.error, parsed.raw?.slice?.(0, 300));
        toast('❌ ' + (parsed.data?.message || parsed.error || `Save failed (HTTP ${res.status})`));
        return;
      }

      toast('✅ ' + (parsed.data?.message || 'Company info saved.'));
      await loadCompanyInfo(); // refresh after save

    } catch (err) {
      console.error('[CompanyInfo] save error:', err);
      toast('❌ Error saving company info.');
    }
  });

  // ====== AUTO-LOAD COMPANY INFO ======
  async function loadCompanyInfo() {
    try {
      const res = await fetch(API_URL, { credentials: 'include' });

      if (!res.ok) {
        console.warn('[CompanyInfo] load failed:', res.status);
        return;
      }

      const parsed = await readJsonSafely(res);
      if (!parsed.ok || !parsed.data || typeof parsed.data !== 'object') {
        console.error('[CompanyInfo] load: bad response:', parsed.error, parsed.raw?.slice?.(0, 300));
        return;
      }

      const data = parsed.data;

      const setVal = (sel, val) => {
        const el = document.querySelector(sel);
        if (el) el.value = val ?? '';
      };

      setVal('input[name="company_name"]', data.company_name);
      setVal('textarea[name="company_address"]', data.company_address);
      setVal('input[name="tel_no"]', data.tel_no);
      setVal('input[name="vat_tin"]', data.vat_tin);

      if (data.logo_path) {
        // Supports: "/uploads/x.png", "uploads/x.png", or absolute URL
        const p = String(data.logo_path);
        const src = p.startsWith('http') ? p : ('/' + p.replace(/^\/+/, ''));
        showLogoUI(src);
      } else {
        showLogoUI('');
      }

    } catch (err) {
      console.error('[CompanyInfo] load error:', err);
    }
  }

  // Initial load
  loadCompanyInfo();
});
