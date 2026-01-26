// authClient.js
export async function getCurrentUser() {
  try {
    const res = await fetch('/auth/me', {
      credentials: 'include'
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function requireSuper() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'super') {
    alert('Access denied. Only the Admin can access this page.');
    window.location.href = '/dashboard.html';
    return false;
  }

  return true;
}

export async function requireAnyRole(roles = []) {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) {
    alert('Access denied.');
    window.location.href = '/dashboard.html';
    return false;
  }
  return true;
}
