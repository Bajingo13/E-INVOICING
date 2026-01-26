document.addEventListener('DOMContentLoaded', async () => {

  // Get user session
  const res = await fetch('/auth/me', {
    credentials: 'include'
  });

  if (!res.ok) {
    // not logged in
    window.location.href = '/';
    return;
  }

  const { user } = await res.json();

  // RBAC
  const role = user.role;

  // hide menu items based on role
  if (role !== 'super') {
  const sysBtn = document.querySelector('#SystemconfigBtn');
  const reportsBtn = document.querySelector('#reportsBtn');
  const accountingBtn = document.querySelector('#accountingBtn');

  if (sysBtn) sysBtn.style.display = 'none';
  if (reportsBtn) reportsBtn.style.display = 'none';
  if (accountingBtn) accountingBtn.style.display = 'none';
}

if (role === 'submitter') {
  const reportsBtn = document.querySelector('#reportsBtn');
  if (reportsBtn) reportsBtn.style.display = 'none';
}


  // add logout
  const logoutBtn = document.querySelector('.logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    });
  }
});
