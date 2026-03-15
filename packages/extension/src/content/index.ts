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
 * Convert a YouTube video ID to a standard watch URL.
 */
function ytWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Extract YouTube video URLs from multiple sources on the page.
 * Recipe sites often lazy-load YouTube embeds, so the <iframe> may not
 * exist in the DOM. We check iframes, links, data-* attributes, noscript
 * fallbacks, and raw HTML as a last resort.
 */
function getVideoUrls(): string[] {
  const ids = new Set<string>();

  // Helper: extract YouTube video ID from a URL string
  function extractId(str: string): string | null {
    // youtube.com/embed/ID or youtube.com/watch?v=ID or youtu.be/ID
    const patterns = [
      /youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = str.match(p);
      if (m) return m[1];
    }
    return null;
  }

  // 1. Check rendered iframes (src, data-src, data-cmp-src)
  document.querySelectorAll("iframe").forEach((iframe) => {
    for (const attr of ["src", "data-src", "data-cmp-src"]) {
      const id = extractId(iframe.getAttribute(attr) || "");
      if (id) ids.add(id);
    }
  });

  // 2. Check anchor links to YouTube
  document.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]').forEach((a) => {
    const id = extractId(a.getAttribute("href") || "");
    if (id) ids.add(id);
  });

  // 3. Check common data-* attributes used by recipe sites for lazy embeds
  const dataSelectors = [
    "[data-video-id]",
    "[data-youtube-id]",
    "[data-embed-id]",
    "[data-video]",
    '[data-src*="youtube"]',
    '[data-src*="youtu.be"]',
    '[data-src*="youtube-nocookie"]',
    '[data-cmp-src*="youtube"]',
    '[data-cmp-src*="youtube-nocookie"]',
    '[data-url*="youtube"]',
    '[data-href*="youtube"]',
  ];
  document.querySelectorAll(dataSelectors.join(",")).forEach((el) => {
    // Check all data-* attributes on this element
    for (const attr of el.attributes) {
      if (!attr.name.startsWith("data-")) continue;
      const val = attr.value;
      // Try to extract an ID from a URL in the attribute
      const id = extractId(val);
      if (id) {
        ids.add(id);
        continue;
      }
      // Check if the value itself is a bare video ID
      if (/^[a-zA-Z0-9_-]{11}$/.test(val)) {
        ids.add(val);
      }
    }
  });

  // 4. Check <noscript> tags (fallback content, often contains the embed)
  document.querySelectorAll("noscript").forEach((ns) => {
    const html = ns.textContent || ns.innerHTML || "";
    const embedMatch = html.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) ids.add(embedMatch[1]);
  });

  // 5. Nuclear option: scan raw HTML for embed URLs
  //    Catches lazy-loaded embeds in JS variables, inline scripts, etc.
  if (ids.size === 0) {
    const rawHtml = document.documentElement.innerHTML;
    const regex = /youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/g;
    let match;
    while ((match = regex.exec(rawHtml)) !== null) {
      ids.add(match[1]);
    }
  }

  return [...ids].map(ytWatchUrl);
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
    const truncatedText = text.slice(0, 8000);
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
