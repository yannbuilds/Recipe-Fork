// Content script – runs in the context of web pages.
// Used to sync auth sessions from the web app to the extension.

/**
 * Find the Supabase auth session in this page's localStorage.
 * Returns the raw JSON string if found, null otherwise.
 */
function getSupabaseSession(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
      return localStorage.getItem(key);
    }
  }
  return null;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SUPABASE_SESSION") {
    sendResponse({ session: getSupabaseSession() });
  }

  // Return false — response is synchronous
  return false;
});
