// DOM references
let saveBtn: HTMLButtonElement;
let statusLoading: HTMLElement;
let statusSuccess: HTMLElement;
let statusError: HTMLElement;

// Render the popup UI
function render(tab: chrome.tabs.Tab | undefined) {
  const root = document.getElementById("root");
  if (!root) return;

  const title = tab?.title || "Unknown page";
  const url = tab?.url || "";

  root.innerHTML = `
    <div class="popup-container">
      <header class="popup-header">
        <div class="header-brand">
          <img class="header-logo" src="../icons/icon48.png" alt="" />
          <h1>Recipe Fork</h1>
        </div>
        <span class="header-version">v0.0.1</span>
      </header>

      <div class="page-info-card">
        <p class="page-title">${escapeHtml(title)}</p>
        <p class="page-url">${escapeHtml(url)}</p>
      </div>

      <button id="save-btn" class="save-button">Save Recipe</button>

      <div class="status-area">
        <div id="status-loading" class="status-loading">
          <div class="spinner"></div>
          <span class="status-message">Parsing recipe…</span>
        </div>
        <div id="status-success" class="status-success">
          <span>✓</span>
          <span class="status-message">Recipe saved!</span>
        </div>
        <div id="status-error" class="status-error">
          <span>✕</span>
          <span class="status-message">Something went wrong.</span>
          <button class="retry-link" id="retry-btn">Retry</button>
        </div>
      </div>

      <footer class="popup-footer">
        <a href="http://localhost:5173" target="_blank">Open Recipe Fork ↗</a>
      </footer>
    </div>
  `;
}

// Escape HTML to prevent XSS from page titles/URLs
function escapeHtml(str: string): string {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

// Status helpers — future tasks will call these from handleSaveRecipe
function showLoading(message: string) {
  saveBtn.disabled = true;
  statusLoading.querySelector(".status-message")!.textContent = message;
  statusLoading.classList.add("visible");
  statusSuccess.classList.remove("visible");
  statusError.classList.remove("visible");
}

function showSuccess(message: string) {
  saveBtn.disabled = true;
  statusSuccess.querySelector(".status-message")!.textContent = message;
  statusSuccess.classList.add("visible");
  statusLoading.classList.remove("visible");
  statusError.classList.remove("visible");
}

function showError(message: string) {
  saveBtn.disabled = false;
  statusError.querySelector(".status-message")!.textContent = message;
  statusError.classList.add("visible");
  statusLoading.classList.remove("visible");
  statusSuccess.classList.remove("visible");
}

function resetStatus() {
  saveBtn.disabled = false;
  statusLoading.classList.remove("visible");
  statusSuccess.classList.remove("visible");
  statusError.classList.remove("visible");
}

// Placeholder save handler — tasks 3-6 will implement the full flow:
// 1. Content script grabs page HTML
// 2. Send HTML to Claude API for structured extraction
// 3. Save parsed recipe to Supabase
// 4. Show success/error state
async function handleSaveRecipe() {
  showLoading("Parsing recipe…");

  // TODO: Implement in tasks 3-6
  console.log("[Recipe Fork] Save recipe clicked — not yet implemented");
}

// Initialise popup
async function init() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  render(tab);

  // Cache DOM refs
  saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
  statusLoading = document.getElementById("status-loading")!;
  statusSuccess = document.getElementById("status-success")!;
  statusError = document.getElementById("status-error")!;

  // Attach handlers
  saveBtn.addEventListener("click", handleSaveRecipe);

  document.getElementById("retry-btn")?.addEventListener("click", () => {
    resetStatus();
    handleSaveRecipe();
  });
}

init();
