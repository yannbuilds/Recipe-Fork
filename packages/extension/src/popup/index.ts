import { supabase } from "../lib/supabase";

// Inline SVG logo – pie icon in sage green
const LOGO_SVG = `<svg class="header-logo" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 3C7.03 3 3 7.03 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-4.97-4.03-9-9-9z" fill="#3f7358" opacity="0.15"/>
  <path d="M12 3C7.03 3 3 7.03 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-4.97-4.03-9-9-9z" stroke="#3f7358" stroke-width="1.5" fill="none"/>
  <path d="M12 3v9l6.36 6.36" stroke="#3f7358" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M12 12L5.64 18.36" stroke="#3f7358" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M8 3.5C8 3.5 7 1.5 6.5 1.5" stroke="#3f7358" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <path d="M12 3C12 3 12 1 12 0.5" stroke="#3f7358" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <path d="M16 3.5C16 3.5 17 1.5 17.5 1.5" stroke="#3f7358" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
</svg>`;

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
          ${LOGO_SVG}
          <h1>Pie Keeper</h1>
        </div>
        <span class="header-version">v1.0.0</span>
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
          ${LOGO_SVG}
          <h1>Pie Keeper</h1>
        </div>
        <span class="header-version">v1.0.0</span>
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
        <a id="footer-link" href="https://piekeeper.com" target="_blank">Open Pie Keeper ↗</a>
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
async function saveTags(recipeId: string, tags: { name: string; emoji: string }[]) {
  if (tags.length === 0) return;

  const { data: existingTags } = await supabase
    .from("tags")
    .select("id, name");

  const existingMap = new Map(
    (existingTags ?? []).map((t: { id: string; name: string }) => [t.name, t.id]),
  );

  const tagIds: string[] = [];

  for (const tag of tags) {
    if (existingMap.has(tag.name)) {
      tagIds.push(existingMap.get(tag.name)!);
    } else {
      const { data } = await supabase
        .from("tags")
        .insert({ name: tag.name, emoji: tag.emoji })
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

  // Check for duplicate — skip save if this URL is already in the library
  const { data: existing } = await supabase
    .from("recipes")
    .select("id")
    .eq("source_url", tab.url)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const footerLink = document.getElementById("footer-link") as HTMLAnchorElement;
    if (footerLink) {
      footerLink.href = `https://piekeeper.com/recipe/${existing.id}`;
      footerLink.textContent = "View saved recipe ↗";
    }
    showSuccess("Recipe already saved!");
    return;
  }

  showLoading("Cooking recipe…");

  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      "import-recipe",
      { body: { url: tab.url } },
    );

    if (fnError) {
      let msg = "Failed to import recipe";
      try {
        if (fnError.context instanceof Response) {
          const body = await fnError.context.clone().json();
          msg = body?.error || msg;
        } else if (fnError.message) {
          msg = fnError.message;
        }
      } catch { /* keep generic message */ }
      throw new Error(msg);
    }

    if (fnData?.error) {
      throw new Error(fnData.error);
    }

    const { recipe, tags } = fnData;

    const { data, error: saveError } = await supabase
      .from("recipes")
      .insert({ ...recipe, user_id: user.id, is_favourite: false })
      .select("id")
      .single();

    if (saveError || !data) {
      throw new Error(saveError?.message ?? "Failed to save recipe.");
    }

    // Save auto-generated tags (non-blocking — don't fail the save if tags fail)
    await saveTags(data.id, tags).catch(() => {});

    // Update footer link to point to the saved recipe
    const footerLink = document.getElementById("footer-link") as HTMLAnchorElement;
    if (footerLink) {
      footerLink.href = `https://piekeeper.com/recipe/${data.id}`;
      footerLink.textContent = "View in Pie Keeper ↗";
    }

    showSuccess("Recipe saved!");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't save this recipe.";
    showError(message);
  }
}

/**
 * Try to grab the Supabase session from the web app's localStorage
 * via the content script. Returns the session if found, null otherwise.
 */
async function syncSessionFromWebApp() {
  try {
    // Find a tab running the web app
    const tabs = await chrome.tabs.query({ url: ["https://piekeeper.com/*"] });
    if (tabs.length === 0 || !tabs[0].id) return null;

    const response = await chrome.tabs.sendMessage(tabs[0].id, {
      type: "GET_SUPABASE_SESSION",
    });

    if (!response?.session) return null;

    const parsed = JSON.parse(response.session);
    const accessToken = parsed.access_token;
    const refreshToken = parsed.refresh_token;

    if (!accessToken || !refreshToken) return null;

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data.session) return null;

    return data.session;
  } catch {
    return null;
  }
}

// Initialise popup
async function init() {
  const root = document.getElementById("root");
  if (!root) return;

  // Check for existing session
  let {
    data: { session },
  } = await supabase.auth.getSession();

  // If no session in chrome.storage.local, try syncing from the web app
  if (!session) {
    session = await syncSessionFromWebApp();
  }

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
