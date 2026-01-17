import { requireSuper } from './authClient.js';

document.addEventListener('DOMContentLoaded', async () => {

  // PROTECT PAGE
  const allowed = await requireSuper();
  if (!allowed) return;

  const API_BASE = ''; // use relative path (works in prod + dev)

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

  // safe DOM helpers
  const safeText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  function clearErrors() {
    safeText('username-error', '');
    safeText('password-error', '');
    safeText('email-error', '');
  }

  function showSuccessToast(msg) {
    if (!successToast) return;
    successToast.textContent = msg;
    successToast.style.display = 'block';
    setTimeout(() => { successToast.style.display = 'none'; }, 3000);
  }

  async function loadUsers() {
    if (!usersTable) return;

    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Failed');

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

  // show create modal
  document.getElementById('show-create-user')?.addEventListener('click', () => {
    createModal?.classList.add('show');
    if (usersSection) usersSection.style.display = 'none';
    if (historyContainer) historyContainer.style.display = 'none';
    document.getElementById('new-username')?.focus();
  });

  // cancel create
  document.getElementById('cancel-create-user')?.addEventListener('click', () => {
    createModal?.classList.remove('show');
    if (usersSection) usersSection.style.display = 'block';
    clearErrors();
    createForm?.reset();
  });

  // submit create
  createForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    const username = document.getElementById('new-username')?.value.trim() || '';
    const password = document.getElementById('new-password')?.value.trim() || '';
    const email = document.getElementById('new-email')?.value.trim() || '';
    let hasError = false;

    if (!username) {
      safeText('username-error', 'Username required');
      hasError = true;
    }
    if (!password) {
      safeText('password-error', 'Password required');
      hasError = true;
    }
    if (!email) {
      safeText('email-error', 'Email required');
      hasError = true;
    }
    if (hasError) return;

    confirmModal?.classList.add('show');
  });

  confirmNo?.addEventListener('click', () => {
    confirmModal?.classList.remove('show');
  });

  confirmYes?.addEventListener('click', async () => {
    confirmModal?.classList.remove('show');

    const username = document.getElementById('new-username')?.value.trim() || '';
    const password = document.getElementById('new-password')?.value.trim() || '';
    const email = document.getElementById('new-email')?.value.trim() || '';
    const role = document.getElementById('new-role')?.value || 'normal';
    const btn = document.getElementById('create-user-submit');

    if (btn) btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email, role })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to create user');
        return;
      }

      showSuccessToast(data.message || 'User created successfully!');
      createForm?.reset();
      createModal?.classList.remove('show');
      if (usersSection) usersSection.style.display = 'block';
      await loadUsers();
    } catch {
      alert('Failed to create user');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  showLoginBtn?.addEventListener('click', async () => {
    createModal?.classList.remove('show');
    if (usersSection) usersSection.style.display = 'none';
    if (historyContainer) historyContainer.style.display = 'block';

    const historyTable = document.querySelector('#login-history-table tbody');
    if (!historyTable) return;

    historyTable.innerHTML = `<tr><td colspan="4" style="padding:12px;color:#666;">Loading login history...</td></tr>`;

    try {
      const res = await fetch(`${API_BASE}/api/login-history`, {
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Failed');

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
    } catch {
      historyTable.innerHTML = `<tr><td colspan="4" style="padding:12px;color:red;">Failed to load login history.</td></tr>`;
    }
  });

  document.getElementById('back-dashboard')?.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });

  loadUsers();
});
document.getElementById('invite-user')?.addEventListener('click', async () => {
  clearErrors();

  const email = document.getElementById('new-email')?.value.trim() || '';
  const role = document.getElementById('new-role')?.value || 'normal';
  const btn = document.getElementById('invite-user');

  let hasError = false;

  if (!email) {
    safeText('email-error', 'Email required');
    hasError = true;
  }

  if (hasError) return;

  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/users/invite`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to send invitation');
      return;
    }

    showSuccessToast(data.message || 'Invitation sent successfully!');
    createForm?.reset();
    createModal?.classList.remove('show');
    if (usersSection) usersSection.style.display = 'block';

  } catch (err) {
    alert('Failed to send invitation');
  } finally {
    if (btn) btn.disabled = false;
  }
});

