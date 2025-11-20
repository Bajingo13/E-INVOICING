document.addEventListener('DOMContentLoaded', () => {
  const usersTable = document.querySelector('#users-table tbody');
  const usersSection = document.getElementById('users-section');
  const historyContainer = document.getElementById('login-history-container');

  const showLoginBtn = document.getElementById('show-login-history');
  const createModal = document.getElementById('create-user-modal');
  const createForm = document.getElementById('create-user-form');
  const successToast = document.getElementById('success-toast');

  const confirmModal = document.getElementById('confirm-create-modal');
  const confirmYes = document.getElementById('confirm-create-yes');
  const confirmNo = document.getElementById('confirm-create-no');

  // Helper functions
  function clearErrors() {
    document.getElementById('username-error').textContent = '';
    document.getElementById('password-error').textContent = '';
  }

  function showSuccessToast(msg) {
    successToast.textContent = msg;
    successToast.style.display = 'block';
    setTimeout(() => { successToast.style.display = 'none'; }, 3000);
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/users');
      const users = await res.json();
      usersTable.innerHTML = users.map(u => `
        <tr>
          <td>${u.username}</td>
          <td>${u.role}</td>
          <td>${u.created_at || ''}</td>
        </tr>
      `).join('');
    } catch {
      usersTable.innerHTML = `<tr><td colspan="3">Unable to load users.</td></tr>`;
    }
  }

  // Show Create User Modal
  document.getElementById('show-create-user').addEventListener('click', () => {
    createModal.classList.add('show');
    usersSection.style.display = 'none';
    historyContainer.style.display = 'none';
    document.getElementById('new-username').focus();
  });

  // Cancel Create User
  document.getElementById('cancel-create-user').addEventListener('click', () => {
    createModal.classList.remove('show');
    usersSection.style.display = 'block';
    clearErrors();
    createForm.reset();
  });

  // Form submission → confirmation modal
  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();
    let hasError = false;

    if (!username) { document.getElementById('username-error').textContent = 'Username required'; hasError = true; }
    if (!password) { document.getElementById('password-error').textContent = 'Password required'; hasError = true; }
    if (hasError) return;

    confirmModal.classList.add('show');
  });

  confirmNo.addEventListener('click', () => {
    confirmModal.classList.remove('show');
  });

  confirmYes.addEventListener('click', async () => {
    confirmModal.classList.remove('show');

    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();
    const role = document.getElementById('new-role').value;
    const btn = document.getElementById('create-user-submit');
    btn.disabled = true;

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
      const data = await res.json();

      if (data.error) {
        if (data.error.includes('username')) document.getElementById('username-error').textContent = data.error;
        else alert(data.error);
        return;
      }

      showSuccessToast(data.message || 'User created successfully!');
      createForm.reset();
      createModal.classList.remove('show');
      usersSection.style.display = 'block';
      await loadUsers();
    } catch {
      alert('Failed to create user');
    } finally {
      btn.disabled = false;
    }
  });

 
  // Show Login History
showLoginBtn.addEventListener('click', async () => {
  createModal.classList.remove('show');
  usersSection.style.display = 'none';
  historyContainer.style.display = 'block';

  const historyTable = document.querySelector('#login-history-table tbody');

  // Show loading message
  historyTable.innerHTML = `<tr><td colspan="4" style="padding:12px;color:#666;">Loading login history...</td></tr>`;

  try {
    const res = await fetch('/api/login-history'); // make sure this endpoint exists
    if (!res.ok) throw new Error('Failed to fetch login history');

    const history = await res.json();

    if (!Array.isArray(history) || history.length === 0) {
      historyTable.innerHTML = `<tr><td colspan="4" style="padding:12px;color:#666;">No login history found.</td></tr>`;
      return;
    }

    historyTable.innerHTML = history.map(h => `
      <tr>
        <td>${h.username}</td>
        <td>${h.success ? 'Yes' : 'No'}</td>
        <td>${h.ip_address || ''}</td>
        <td>${h.timestamp || ''}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
    historyTable.innerHTML = `<tr><td colspan="4" style="padding:12px;color:red;">Failed to load login history.</td></tr>`;
  }
});


  // Back to Dashboard
  document.getElementById('back-dashboard').addEventListener('click', () => {
    window.location.href = '/dashboard';
  });

  loadUsers();
});
