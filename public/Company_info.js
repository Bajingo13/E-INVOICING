// ====== ELEMENT REFERENCES ======
const logoInput = document.getElementById('logo');
const logoImg = document.getElementById('uploaded-logo');
const removeBtn = document.getElementById('remove-logo-btn');
const companyForm = document.getElementById('companyForm');

// ====== LOGO PREVIEW ======
logoInput.addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) {
    const reader = new FileReader();
    reader.onload = function(ev) {
      logoImg.src = ev.target.result;
      logoImg.style.display = 'block';
      removeBtn.style.display = 'inline-block';
    }
    reader.readAsDataURL(e.target.files[0]);
  }
});

// ====== REMOVE LOGO ======
removeBtn.addEventListener('click', () => {
  logoInput.value = '';
  logoImg.src = '';
  logoImg.style.display = 'none';
  removeBtn.style.display = 'none';
});

// ====== SAVE COMPANY INFO ======
companyForm.addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(companyForm);

  try {
    const res = await fetch('/api/company', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (result.success) {
      alert('✅ ' + result.message);
    } else {
      alert('❌ ' + result.message);
    }

  } catch (err) {
    console.error(err);
    alert('❌ Error saving company info.');
  }
});

// ====== AUTO-LOAD COMPANY INFO ======
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/company');
    const data = await res.json();

    if (!data || Object.keys(data).length === 0) return;

    document.querySelector('input[name="company_name"]').value = data.company_name || '';
    document.querySelector('textarea[name="company_address"]').value = data.company_address || '';
    document.querySelector('input[name="tel_no"]').value = data.tel_no || '';
    document.querySelector('input[name="vat_tin"]').value = data.vat_tin || '';

    if (data.logo_path) {
      logoImg.src = data.logo_path;
      logoImg.style.display = 'block';
      removeBtn.style.display = 'inline-block';
    }

  } catch (err) {
    console.error(err);
  }
});
