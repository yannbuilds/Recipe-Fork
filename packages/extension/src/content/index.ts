// Content script – runs in the context of web pages.
// Used to sync auth sessions from the web app to the extension.

/**
 * Find the Supabase auth session in this page's cookies.
 * The web app stores the session as a cookie (not localStorage).
 * Returns the raw JSON string if found, null otherwise.
 */
function getSupabaseSession(): string | null {
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    const eqIndex = cookie.indexOf("=");
    if (eqIndex === -1) continue;
    const name = decodeURIComponent(cookie.substring(0, eqIndex));
    if (name.startsWith("sb-") && name.endsWith("-auth-token")) {
      return decodeURIComponent(cookie.substring(eqIndex + 1));
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
