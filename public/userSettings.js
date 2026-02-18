import { requireRole } from './rbac.js';

document.addEventListener('DOMContentLoaded', async () => {
  const allowed = await requireRole(['super']);
  if (!allowed) return;

  const API_BASE = '';

  // ---------- DOM ----------
  const usersTable = document.querySelector('#users-table tbody');
  const usersSection = document.getElementById('users-section');
  const historyContainer = document.getElementById('login-history-container');

  // audit logs UI
  const auditContainer = document.getElementById('audit-logs-container');
  const showAuditBtn = document.getElementById('show-audit-logs');

  const showLoginBtn = document.getElementById('show-login-history');
  const createModal = document.getElementById('create-user-modal');
  const createForm = document.getElementById('create-user-form');
  const successToast = document.getElementById('success-toast');

  const confirmModal = document.getElementById('confirm-create-modal');
  const confirmYes = document.getElementById('confirm-create-yes');
  const confirmNo = document.getElementById('confirm-create-no');

  const inviteBtn = document.getElementById('invite-user'); // ✅ your button

  // ---------- helpers ----------
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
    successToast.textContent = msg || 'Done';
    successToast.style.display = 'block';
    setTimeout(() => { successToast.style.display = 'none'; }, 3000);
  }

  function showSection(name) {
    if (usersSection) usersSection.style.display = (name === 'users') ? 'block' : 'none';
    if (historyContainer) historyContainer.style.display = (name === 'history') ? 'block' : 'none';
    if (auditContainer) auditContainer.style.display = (name === 'audit') ? 'block' : 'none';
  }

  function fmtDateTime(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function getCreateFormValues() {
    const username = document.getElementById('new-username')?.value.trim() || '';
    const password = document.getElementById('new-password')?.value.trim() || '';
    const email = document.getElementById('new-email')?.value.trim() || '';
    const role = document.getElementById('new-role')?.value || 'submitter';
    return { username, password, email, role };
  }

  function setCreateButtonsBusy(on) {
    const createBtn = document.getElementById('create-user-submit');
    if (createBtn) createBtn.disabled = !!on;
    if (inviteBtn) inviteBtn.disabled = !!on;
    const cancelBtn = document.getElementById('cancel-create-user');
    if (cancelBtn) cancelBtn.disabled = !!on;
  }

  // ---------- API ----------
  async function loadUsers() {
    if (!usersTable) return;

    try {
      const res = await fetch(`${API_BASE}/api/users`, { credentials: 'include' });
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

  // audit logs
  async function loadAuditLogs() {
    const tbody = document.querySelector('#audit-logs-table tbody');
    if (!tbody) return;

    const q = document.getElementById('audit-search')?.value.trim() || '';
    const action = document.getElementById('audit-action')?.value || '';
    const entity = document.getElementById('audit-entity')?.value || '';

    tbody.innerHTML = `<tr><td colspan="7" style="padding:12px;color:#666;">Loading audit logs...</td></tr>`;

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (action) params.set('action', action);
    if (entity) params.set('entity_type', entity);
    params.set('limit', '200');

    try {
      const res = await fetch(`${API_BASE}/api/audit-logs?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      const logs = await res.json();

      if (!Array.isArray(logs) || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:12px;color:#666;">No audit logs found.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td>${fmtDateTime(l.created_at)}</td>
          <td>${l.actor_username || ''}</td>
          <td>${l.action || ''}</td>
          <td>${l.entity_type || ''}</td>
          <td>${l.entity_id || ''}</td>
          <td>${l.summary || ''}</td>
          <td>${l.ip_address || ''}</td>
        </tr>
      `).join('');
    } catch {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:12px;color:red;">Failed to load audit logs.</td></tr>`;
    }
  }

  function exportAuditLogsExcel() {
    const q = document.getElementById('audit-search')?.value.trim() || '';
    const action = document.getElementById('audit-action')?.value || '';
    const entity = document.getElementById('audit-entity')?.value || '';

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (action) params.set('action', action);
    if (entity) params.set('entity_type', entity);

    window.location.href = `${API_BASE}/api/audit-logs/export/excel?${params.toString()}`;
  }

  // ---------- UI actions ----------
  document.getElementById('show-create-user')?.addEventListener('click', () => {
    createModal?.classList.add('show');
    if (usersSection) usersSection.style.display = 'none';
    if (historyContainer) historyContainer.style.display = 'none';
    if (auditContainer) auditContainer.style.display = 'none';
    document.getElementById('new-username')?.focus();
  });

  document.getElementById('cancel-create-user')?.addEventListener('click', () => {
    createModal?.classList.remove('show');
    showSection('users');
    clearErrors();
    createForm?.reset();
  });

  // ✅ Create user flow (still requires password)
  createForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    const { username, password, email } = getCreateFormValues();
    let hasError = false;

    if (!username) { safeText('username-error', 'Username required'); hasError = true; }
    if (!password) { safeText('password-error', 'Password required'); hasError = true; }
    if (!email) { safeText('email-error', 'Email required'); hasError = true; }
    else if (!isValidEmail(email)) { safeText('email-error', 'Invalid email'); hasError = true; }

    if (hasError) return;

    confirmModal?.classList.add('show');
  });

  confirmNo?.addEventListener('click', () => {
    confirmModal?.classList.remove('show');
  });

  confirmYes?.addEventListener('click', async () => {
    confirmModal?.classList.remove('show');

    const { username, password, email, role } = getCreateFormValues();
    setCreateButtonsBusy(true);

    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email, role })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || 'Failed to create user');
        return;
      }

      showSuccessToast(data.message || 'User created successfully!');
      createForm?.reset();
      createModal?.classList.remove('show');
      showSection('users');
      await loadUsers();
    } catch {
      alert('Failed to create user');
    } finally {
      setCreateButtonsBusy(false);
    }
  });

  // ✅ INVITE FLOW (no password required)
  inviteBtn?.addEventListener('click', async () => {
    clearErrors();

    const { username, email, role } = getCreateFormValues();

    let hasError = false;
    if (!username) { safeText('username-error', 'Username required'); hasError = true; }
    if (!email) { safeText('email-error', 'Email required'); hasError = true; }
    else if (!isValidEmail(email)) { safeText('email-error', 'Invalid email'); hasError = true; }
    if (!role) { hasError = true; }

    if (hasError) return;

    if (!confirm(`Send invitation to ${email}?`)) return;

    setCreateButtonsBusy(true);

    try {
      const res = await fetch(`${API_BASE}/api/users/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, role })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || 'Failed to send invitation');
        return;
      }

      showSuccessToast(data.message || 'Invitation sent!');
      // keep modal open so admin can invite multiple users quickly
    } catch (err) {
      console.error(err);
      alert('Failed to send invitation');
    } finally {
      setCreateButtonsBusy(false);
    }
  });

  // edit/delete buttons
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

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');

      document.getElementById('edit-user-modal').classList.remove('show');
      await loadUsers();
      showSuccessToast(data.message || 'User updated!');
    } catch {
      alert('Failed to update user');
    }
  });

  // login history
  showLoginBtn?.addEventListener('click', async () => {
    createModal?.classList.remove('show');
    showSection('history');

    const historyTable = document.querySelector('#login-history-table tbody');
    if (!historyTable) return;

    historyTable.innerHTML = `<tr><td colspan="4" style="padding:12px;color:#666;">Loading login history...</td></tr>`;

    try {
      const res = await fetch(`${API_BASE}/api/login-history`, { credentials: 'include' });
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

  // audit logs
  showAuditBtn?.addEventListener('click', async () => {
    createModal?.classList.remove('show');
    showSection('audit');
    await loadAuditLogs();
  });

  document.getElementById('audit-refresh')?.addEventListener('click', loadAuditLogs);
  document.getElementById('audit-export')?.addEventListener('click', exportAuditLogsExcel);

  document.getElementById('audit-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAuditLogs();
  });
  document.getElementById('audit-action')?.addEventListener('change', loadAuditLogs);
  document.getElementById('audit-entity')?.addEventListener('change', loadAuditLogs);

  document.getElementById('back-dashboard')?.addEventListener('click', () => {
    window.location.href = '/Dashboard.html';
  });

  // default view
  showSection('users');
  loadUsers();
});
