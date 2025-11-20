document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.querySelector('.logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch('/api/logout', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          window.location.href = '/Login.html';
        } else {
          alert('Logout failed');
        }
      } catch (err) {
        console.error(err);
        alert('Error during logout');
      }
    });
  }
});
