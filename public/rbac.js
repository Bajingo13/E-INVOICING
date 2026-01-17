// rbac.js
export async function requireRole(allowedRoles = []) {
  const res = await fetch('/auth/me', { credentials: 'include' });

  if (!res.ok) {
    window.location.href = '/';
    return;
  }

  const { user } = await res.json();

  if (!allowedRoles.includes(user.role)) {
    alert("You are not authorized to access this page.");
    window.location.href = '/dashboard.html';
  }
}
