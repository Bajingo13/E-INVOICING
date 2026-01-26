// rbac.js

export async function requireRole(allowedRoles = []) {
  const res = await fetch('/auth/me', { credentials: 'include' });

  if (!res.ok) {
    window.location.href = '/';
    return false;
  }

  const { user } = await res.json();

  if (!allowedRoles.includes(user.role)) {
    alert("You are not authorized to access this page.");
    window.location.href = '/dashboard.html';
    return false;
  }

  return true;
}

export async function requirePermission(permission) {
  const res = await fetch('/auth/me', { credentials: 'include' });

  if (!res.ok) {
    window.location.href = '/';
    return false;
  }

  const { user } = await res.json();

  if (!user?.permissions?.includes(permission)) {
    alert("You are not authorized to access this page.");
    window.location.href = '/dashboard.html';
    return false;
  }

  return true;
}
