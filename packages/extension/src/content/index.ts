// Content script – runs in the context of web pages.
// Extracts recipe-relevant content on request from the popup.

/**
 * Try to find JSON-LD recipe structured data on the page.
 * Many recipe sites include this – it's the richest, most compact source.
 */
function getJsonLd(): string | null {
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  for (const script of scripts) {
    const text = script.textContent;
    if (text && text.includes("Recipe")) {
      return text;
    }
  }
  return null;
}

/**
 * Extract the main content area's text. Strips nav, footer, sidebar, ads,
 * and all HTML tags – returns plain text only.
 */
function getMainText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;

  // Remove elements that are never recipe content
  clone
    .querySelectorAll(
      "script, style, svg, noscript, nav, footer, header, aside, " +
        "iframe, form, [role='navigation'], [role='banner'], " +
        "[role='contentinfo'], .ad, .ads, .advertisement, .sidebar, " +
        ".comments, .comment, .social-share, .related-posts, " +
        ".newsletter, .cookie-banner",
    )
    .forEach((el) => el.remove());

  // Get text content and collapse whitespace
  const text = clone.textContent || "";
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Extract YouTube video URLs from iframes and anchor tags on the page.
 */
function getVideoUrls(): string[] {
  const urls = new Set<string>();

  // Check iframes (YouTube embeds)
  document.querySelectorAll("iframe[src]").forEach((iframe) => {
    const src = iframe.getAttribute("src") || "";
    if (src.includes("youtube.com") || src.includes("youtu.be")) {
      // Convert embed URL to watch URL
      const match = src.match(/youtube\.com\/embed\/([^?&#]+)/);
      if (match) {
        urls.add(`https://www.youtube.com/watch?v=${match[1]}`);
      } else {
        urls.add(src);
      }
    }
  });

  // Check links to YouTube
  document.querySelectorAll('a[href*="youtube.com/watch"], a[href*="youtu.be/"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (href) urls.add(href);
  });

  return [...urls];
}

/**
 * Build a compact payload for the LLM.
 * Prefers JSON-LD (tiny, structured) over full page text.
 */
function extractContent(): string {
  const jsonLd = getJsonLd();
  const videoUrls = getVideoUrls();
  const videoSection =
    videoUrls.length > 0
      ? `\n\n[Video URLs found on page]:\n${videoUrls.join("\n")}`
      : "";

  if (jsonLd) {
    const text = getMainText();
    const truncatedText = text.slice(0, 3000);
    return (
      `[JSON-LD structured data]:\n${jsonLd}\n\n` +
      `[Page text (excerpt)]:\n${truncatedText}` +
      videoSection
    );
  }

  const text = getMainText();
  return text.slice(0, 12000) + videoSection;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_HTML") {
    const content = extractContent();
    sendResponse({
      html: content,
      url: location.href,
      title: document.title,
    });
  }
  // Return false — response is synchronous
  return false;
});
