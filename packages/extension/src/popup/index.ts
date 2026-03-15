import { extractRecipe, type ExtractedRecipe } from "../lib/groq";
import { supabase } from "@recipe-aggregator/shared";

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
          <span class="status-message">Reading recipe…</span>
        </div>
        <div id="status-success" class="status-success">
          <span>✓</span>
          <span class="status-message">Recipe saved!</span>
        </div>
        <div id="status-error" class="status-error">
          <span>✕</span>
          <span class="status-message">Couldn't save this recipe.</span>
          <button class="retry-link" id="retry-btn">Retry</button>
        </div>
      </div>

      <footer class="popup-footer">
        <a id="footer-link" href="http://localhost:5173" target="_blank">Open Recipe Fork ↗</a>
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

// Save AI-suggested tags to Supabase, reusing existing tags where possible
async function saveTags(recipeId: string, tagNames: string[]) {
  if (tagNames.length === 0) return;

  const { data: existingTags } = await supabase
    .from("tags")
    .select("id, name");

  const existingMap = new Map(
    (existingTags ?? []).map((t: { id: string; name: string }) => [t.name, t.id]),
  );

  const tagIds: string[] = [];

  for (const name of tagNames) {
    if (existingMap.has(name)) {
      tagIds.push(existingMap.get(name)!);
    } else {
      const { data } = await supabase
        .from("tags")
        .insert({ name })
        .select("id")
        .single();
      if (data) tagIds.push(data.id);
    }
  }

  if (tagIds.length > 0) {
    await supabase.from("recipe_tags").insert(
      tagIds.map((tag_id) => ({ recipe_id: recipeId, tag_id })),
    );
  }
}

// Save handler — grabs page HTML via content script, then will send to Claude API
async function handleSaveRecipe() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  // Guard against non-web pages
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    showError("Can't save recipes from this page.");
    return;
  }

  showLoading("Reading recipe…");

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_HTML",
    });

    if (!response?.html) {
      showError("No recipe content found on this page.");
      return;
    }

    showLoading("Saving recipe…");

    const { recipe, tagNames } = await extractRecipe(response.html, response.url);

    const { data, error: saveError } = await supabase
      .from("recipes")
      .insert(recipe)
      .select("id")
      .single();

    if (saveError || !data) {
      throw new Error(saveError?.message ?? "Failed to save recipe.");
    }

    // Save auto-generated tags (non-blocking — don't fail the save if tags fail)
    await saveTags(data.id, tagNames).catch(() => {});

    // Update footer link to point to the saved recipe
    const footerLink = document.getElementById("footer-link") as HTMLAnchorElement;
    if (footerLink) {
      footerLink.href = `http://localhost:5173/recipe/${data.id}`;
      footerLink.textContent = "View in Recipe Fork ↗";
    }

    showSuccess("Recipe saved!");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't save this recipe.";
    showError(message);
  }
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
