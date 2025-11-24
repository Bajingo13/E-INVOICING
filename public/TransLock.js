const lockStartInput = document.getElementById("lockStartDate");
const lockEndInput = document.getElementById("lockEndDate");
const notesInput = document.getElementById("lockNotes");

const applyLockBtn = document.getElementById("applyLockBtn");
const unlockBtn = document.getElementById("unlockBtn");

const statusStart = document.getElementById("statusStart");
const statusEnd = document.getElementById("statusEnd");
const statusNotes = document.getElementById("statusNotes");

const historyList = document.getElementById("lockHistoryList");

// Apply lock
applyLockBtn.addEventListener("click", () => {
  const start = lockStartInput.value;
  const end = lockEndInput.value;
  const notes = notesInput.value || "No notes";

  if (!start || !end) {
    alert("Please select both start and end dates.");
    return;
  }

  if (start > end) {
    alert("Start date cannot be after end date.");
    return;
  }

  localStorage.setItem("lockStart", start);
  localStorage.setItem("lockEnd", end);
  localStorage.setItem("lockNotes", notes);

  saveLockHistory(start, end, notes);
  updateUI();

  alert("Transactions successfully locked.");
});

// Unlock
unlockBtn.addEventListener("click", () => {
  if (!localStorage.getItem("lockStart")) {
    alert("No active lock found.");
    return;
  }

  if (confirm("Unlock all transactions?")) {
    localStorage.removeItem("lockStart");
    localStorage.removeItem("lockEnd");
    localStorage.removeItem("lockNotes");

    updateUI();
    alert("Transactions unlocked.");
  }
});

function saveLockHistory(start, end, notes) {
  const entry = {
    start,
    end,
    notes,
    date: new Date().toLocaleString()
  };

  let history = JSON.parse(localStorage.getItem("lockHistory") || "[]");
  history.unshift(entry);
  localStorage.setItem("lockHistory", JSON.stringify(history));
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem("lockHistory") || "[]");
  historyList.innerHTML = "";

  history.forEach(h => {
    const li = document.createElement("li");
    li.textContent = `${h.start} to ${h.end} — ${h.notes} (set on ${h.date})`;
    historyList.appendChild(li);
  });
}

function updateUI() {
  const s = localStorage.getItem("lockStart");
  const e = localStorage.getItem("lockEnd");
  const n = localStorage.getItem("lockNotes");

  statusStart.textContent = s || "—";
  statusEnd.textContent = e || "—";
  statusNotes.textContent = n || "—";

  loadHistory();
}

// On load
updateUI();
