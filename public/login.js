document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Successful login
      window.location.href = "/dashboard";
    } else {
      const err = document.getElementById("error");
      err.innerText = data.message || "Invalid login";
      err.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Login error:", err);
    const errEl = document.getElementById("error");
    errEl.innerText = "Server error. Try again later.";
    errEl.classList.remove("hidden");
  }
});
