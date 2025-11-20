const headerSelect = document.getElementById('headerAlignment');
const logoSelect = document.getElementById('logoAlignment');
const headerPreview = document.querySelector('.preview-header');
const logoPreview = document.querySelector('.preview-logo');
const invoicePreview = document.querySelector('.invoice-preview'); // container

// Header alignment (text inside header)
headerSelect.addEventListener('change', () => {
  headerPreview.style.textAlign = headerSelect.value;
});

logoSelect.addEventListener('change', () => {
  const alignment = logoSelect.value;
  switch(alignment) {
    case 'left':
      logoPreview.style.marginLeft = '0';
      logoPreview.style.marginRight = 'auto';
      break;
    case 'center':
      logoPreview.style.marginLeft = 'auto';
      logoPreview.style.marginRight = 'auto';
      break;
    case 'right':
      logoPreview.style.marginLeft = 'auto';
      logoPreview.style.marginRight = '0';
      break;
  }
});