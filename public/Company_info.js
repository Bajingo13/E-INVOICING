 const logoInput = document.getElementById('logo');
    const logoImg = document.getElementById('uploaded-logo');
    const removeBtn = document.getElementById('remove-logo-btn');

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

    removeBtn.addEventListener('click', () => {
      logoInput.value = '';
      logoImg.src = '';
      logoImg.style.display = 'none';
      removeBtn.style.display = 'none';
    });

    document.getElementById("companyForm").addEventListener("submit", async function(e){
  e.preventDefault();
  const formData = new FormData(this);
  try {
    const res = await fetch("/api/company", {  // <-- updated endpoint
      method: "POST",
      body: formData
    });
    const result = await res.json();
    alert(result.message);
  } catch (err) {
    alert("Error saving company info.");
    console.error(err);
  }
});

// Auto-load existing company info
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/company'); // <-- updated endpoint
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
  } catch(err) { console.error(err); }
});
