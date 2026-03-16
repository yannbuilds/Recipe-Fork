import { extractRecipe, type ExtractedRecipe } from "../lib/groq";
import { supabase } from "@recipe-aggregator/shared";

// DOM references
let saveBtn: HTMLButtonElement;
let statusLoading: HTMLElement;
let statusSuccess: HTMLElement;
let statusError: HTMLElement;

// Render the login form
function renderLogin(root: HTMLElement) {
  root.innerHTML = `
    <div class="popup-container">
      <header class="popup-header">
        <div class="header-brand">
          <img class="header-logo" src="../icons/icon48.png" alt="" />
          <h1>Recipe Fork</h1>
        </div>
        <span class="header-version">v0.0.1</span>
      </header>

      <div class="login-card">
        <h2 class="login-title">Sign in to save recipes</h2>

        <div id="login-error" class="login-error"></div>

        <input id="login-email" type="email" class="login-input" placeholder="Email" />
        <input id="login-password" type="password" class="login-input" placeholder="Password" />

        <button id="login-btn" class="save-button">Sign in</button>

        <div class="login-divider">
          <span>or continue with</span>
        </div>

        <div class="oauth-buttons">
          <button id="oauth-google" class="oauth-btn">Google</button>
          <button id="oauth-facebook" class="oauth-btn">Facebook</button>
          <button id="oauth-apple" class="oauth-btn">Apple</button>
        </div>

        <p class="login-toggle">
          Don't have an account?
          <button id="toggle-signup" class="link-btn">Sign up</button>
        </p>
      </div>
    </div>
  `;

  let isSignUp = false;

  const emailInput = document.getElementById("login-email") as HTMLInputElement;
  const passwordInput = document.getElementById("login-password") as HTMLInputElement;
  const loginBtn = document.getElementById("login-btn") as HTMLButtonElement;
  const errorEl = document.getElementById("login-error")!;
  const toggleBtn = document.getElementById("toggle-signup")!;

  function showLoginError(msg: string) {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
  }

  toggleBtn.addEventListener("click", () => {
    isSignUp = !isSignUp;
    loginBtn.textContent = isSignUp ? "Create account" : "Sign in";
    toggleBtn.textContent = isSignUp ? "Sign in" : "Sign up";
    const toggleLabel = toggleBtn.parentElement!;
    toggleLabel.childNodes[0].textContent = isSignUp
      ? "Already have an account? "
      : "Don't have an account? ";
    errorEl.style.display = "none";
  });

  loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      showLoginError("Enter your email and password.");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Please wait…";
    errorEl.style.display = "none";

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showLoginError(error.message);
      loginBtn.disabled = false;
      loginBtn.textContent = isSignUp ? "Create account" : "Sign in";
    } else {
      // Re-init to show save UI
      init();
    }
  });

  // OAuth handlers
  async function handleOAuth(provider: "google" | "facebook" | "apple") {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const redirectUrl = chrome.identity.getRedirectURL();

      // Build the OAuth URL manually
      const authUrl =
        `${supabaseUrl}/auth/v1/authorize?provider=${provider}` +
        `&redirect_to=${encodeURIComponent(redirectUrl)}`;

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      });

      if (!responseUrl) {
        showLoginError("Sign in was cancelled.");
        return;
      }

      // Extract tokens from the URL hash fragment
      const hashParams = new URLSearchParams(
        responseUrl.includes("#") ? responseUrl.split("#")[1] : "",
      );
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (!accessToken || !refreshToken) {
        showLoginError("Could not complete sign in. Please try again.");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        showLoginError(error.message);
      } else {
        init();
      }
    } catch (err) {
      showLoginError(
        err instanceof Error ? err.message : "OAuth sign in failed.",
      );
    }
  }

  document
    .getElementById("oauth-google")!
    .addEventListener("click", () => handleOAuth("google"));
  document
    .getElementById("oauth-facebook")!
    .addEventListener("click", () => handleOAuth("facebook"));
  document
    .getElementById("oauth-apple")!
    .addEventListener("click", () => handleOAuth("apple"));
}

// Render the popup UI (save mode)
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
        <span class="footer-sep">·</span>
        <button id="sign-out-btn" class="link-btn footer-link-btn">Sign out</button>
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

// Status helpers
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

  // Ensure we have a logged-in user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    showError("Not signed in. Please sign in first.");
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
      .insert({ ...recipe, user_id: user.id })
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
  const root = document.getElementById("root");
  if (!root) return;

  // Check for existing session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    renderLogin(root);
    return;
  }

  // User is authenticated — show save UI
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

  document.getElementById("sign-out-btn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    init();
  });
}

init();
