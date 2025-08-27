// ================= Login.js =================
const loginForm = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');
const createBtn = document.getElementById('createAccountBtn');

// ---------- LOGIN ----------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!username || !password) {
    errorMsg.textContent = "Username and password required";
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
      window.location.href = '/dashboard';
    } else {
      errorMsg.textContent = data.message || "Invalid username or password";
    }
  } catch (err) {
    console.error(err);
    errorMsg.textContent = "Server error. Try again later.";
  }
});

// ---------- CREATE ACCOUNT ----------
createBtn.addEventListener('click', async () => {
  const username = prompt("Enter new username:")?.trim();
  const password = prompt("Enter new password:")?.trim();

  if (!username || !password) return alert("Username and password required");

  try {
    const res = await fetch('/api/create-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
      alert("✅ Account created successfully! You can now log in.");
    } else {
      alert("❌ " + data.message);
    }
  } catch (err) {
    console.error(err);
    alert("Server error. Try again later.");
  }
});
