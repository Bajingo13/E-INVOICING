import { requireRole } from './rbac.js';

document.addEventListener('DOMContentLoaded', async () => {

  const allowed = await requireRole(['super']);
  if (!allowed) return;

  const API_BASE = '';

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
          <td>
            <button class="btn-edit" data-id="${u.id}" data-role="${u.role}" data-username="${u.username}">
              Edit
            </button>
            <button class="btn-delete" data-id="${u.id}">
              Delete
            </button>
          </td>
        </tr>
      `).join('');
    } catch {
      usersTable.innerHTML = `<tr><td colspan="4">Unable to load users.</td></tr>`;
    }
  }

  document.getElementById('show-create-user')?.addEventListener('click', () => {
    createModal?.classList.add('show');
    if (usersSection) usersSection.style.display = 'none';
    if (historyContainer) historyContainer.style.display = 'none';
    document.getElementById('new-username')?.focus();
  });

  document.getElementById('cancel-create-user')?.addEventListener('click', () => {
    createModal?.classList.remove('show');
    if (usersSection) usersSection.style.display = 'block';
    clearErrors();
    createForm?.reset();
  });

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
    const role = document.getElementById('new-role')?.value || 'submitter';
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

  document.addEventListener('click', (e) => {
    if (e.target.matches('.btn-edit')) {
      const id = e.target.dataset.id;
      const username = e.target.dataset.username;
      const role = e.target.dataset.role;

      document.getElementById('edit-user-id').value = id;
      document.getElementById('edit-username').value = username;
      document.getElementById('edit-role').value = role;

      document.getElementById('edit-user-modal').classList.add('show');
    }

    if (e.target.matches('.btn-delete')) {
      const id = e.target.dataset.id;

      if (!confirm('Are you sure you want to delete this user?')) return;

      fetch(`${API_BASE}/api/users/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      })
        .then(res => res.json())
        .then(() => loadUsers())
        .catch(() => alert('Failed to delete user'));
    }
  });

  document.getElementById('cancel-edit-user')?.addEventListener('click', () => {
    document.getElementById('edit-user-modal').classList.remove('show');
  });

  document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('edit-user-id').value;
    const role = document.getElementById('edit-role').value;
    const password = document.getElementById('edit-password').value.trim();

    const payload = { role };
    if (password) payload.password = password;

    try {
      const res = await fetch(`${API_BASE}/api/users/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      document.getElementById('edit-user-modal').classList.remove('show');
      await loadUsers();
      showSuccessToast(data.message || 'User updated!');
    } catch {
      alert('Failed to update user');
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
