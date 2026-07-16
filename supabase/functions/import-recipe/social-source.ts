export type SocialPlatform = "instagram" | "tiktok" | "youtube" | "facebook" | "pinterest";

export interface SocialSource {
  platform: SocialPlatform;
  canonicalUrl: string;
  title: string | null;
  creatorName: string | null;
  caption: string | null;
  transcript: string | null;
  imageUrl: string | null;
  mediaUrl: string | null;
  externalUrls: string[];
}

const SOCIAL_HOSTS: Record<SocialPlatform, RegExp> = {
  instagram: /(^|\.)instagram\.com$/i,
  tiktok: /(^|\.)(tiktok\.com|tiktokcdn\.com)$/i,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/i,
  facebook: /(^|\.)(facebook\.com|fb\.watch)$/i,
  pinterest: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i,
};

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
};

export function getSocialPlatform(rawUrl: string): SocialPlatform | null {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const [platform, pattern] of Object.entries(SOCIAL_HOSTS)) {
    if (pattern.test(hostname)) return platform as SocialPlatform;
  }
  return null;
}

export function extractSharedUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  return match[0].replace(/[),.;!?]+$/, "");
}

export function looksLikeRecipeText(text: string): boolean {
  const clean = text.toLowerCase();
  if (clean.length < 80) return false;
  const ingredientSignals = [
    /\bingredients?\b/,
    /\b\d+(?:[\s./-]\d+)?\s*(?:g|kg|ml|l|cup|cups|tbsp|tsp|oz|lb|clove|egg)s?\b/,
    /\b(?:salt|pepper|flour|butter|oil|garlic|onion)\b/,
  ].filter((pattern) => pattern.test(clean)).length;
  const methodSignals = [
    /\b(?:method|instructions?|directions?|steps?)\b/,
    /\b(?:add|mix|stir|cook|bake|fry|simmer|whisk|serve|heat)\b/,
    /(?:^|\s)\d+[.)]\s+[a-z]/m,
  ].filter((pattern) => pattern.test(clean)).length;
  return ingredientSignals >= 2 && methodSignals >= 1;
}

export function extractNumberedRecipeSteps(text: string): string[] {
  const matches = [...text.matchAll(
    /(?:^|\s)(\d{1,2})[.)]\s+([\s\S]*?)(?=(?:\s+\d{1,2}[.)]\s+)|$)/g,
  )];
  let current: string[] = [];
  let best: string[] = [];

  for (const match of matches) {
    const order = Number(match[1]);
    const instruction = match[2]
      .replace(/\s+/g, " ")
      .replace(/[.…]+\s*more$/i, "")
      .trim();
    if (order === 1) current = instruction ? [instruction] : [];
    else if (current.length > 0 && order === current.length + 1 && instruction) {
      current.push(instruction);
    } else {
      current = [];
    }
    if (current.length > best.length) best = [...current];
  }

  return best.length >= 2 ? best : [];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(parseInt(value, 10)))
    .trim();
}

function extractMeta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return null;
}

function decodeJsonString(value: string): string | null {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\n/g, "\n").replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }
}

function extractJsonString(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"));
  return match?.[1] ? decodeJsonString(match[1]) : null;
}

function extractUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s<>"'\\]+/gi) ?? [];
  return urls.map((url) => decodeHtml(url).replace(/[),.;!?]+$/, ""));
}

function uniqueExternalUrls(urls: string[], canonicalUrl: string): string[] {
  const output: string[] = [];
  for (const value of urls) {
    try {
      let url = new URL(value);
      if (/(^|\.)youtube\.com$/i.test(url.hostname) && url.pathname === "/redirect") {
        const destination = url.searchParams.get("q");
        if (destination) url = new URL(destination);
      }
      if (!["http:", "https:"].includes(url.protocol)) continue;
      if (getSocialPlatform(url.toString())) continue;
      if (/^(?:linktr\.ee|beacons\.ai|lnk\.bio|stan\.store)$/i.test(url.hostname.replace(/^www\./, ""))) continue;
      if (url.toString() === canonicalUrl || output.includes(url.toString())) continue;
      output.push(url.toString());
      if (output.length >= 8) break;
    } catch {
      // Ignore malformed links embedded in captions.
    }
  }
  return output;
}

function youtubeVideoId(url: string): string | null {
  const parsed = new URL(url);
  if (parsed.hostname.endsWith("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
    return parsed.pathname.split("/")[2] ?? null;
  }
  return parsed.searchParams.get("v");
}

function extractBalancedObject(html: string, marker: string): Record<string, unknown> | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index++) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, index + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function youtubeAudioUrl(html: string): string | null {
  const player = extractBalancedObject(html, "ytInitialPlayerResponse");
  const streaming = player?.streamingData as { adaptiveFormats?: Array<Record<string, unknown>> } | undefined;
  const formats = streaming?.adaptiveFormats ?? [];
  const audio = formats.find((format) =>
    typeof format.mimeType === "string" && format.mimeType.startsWith("audio/") && typeof format.url === "string"
  );
  return typeof audio?.url === "string" ? audio.url : null;
}

interface YouTubePlayerResponse {
  videoDetails?: {
    title?: string;
    author?: string;
    shortDescription?: string;
    thumbnail?: { thumbnails?: Array<{ url?: string }> };
  };
  streamingData?: {
    adaptiveFormats?: Array<{ mimeType?: string; url?: string }>;
  };
}

async function fetchYouTubePlayer(videoId: string): Promise<YouTubePlayerResponse | null> {
  try {
    const response = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            hl: "en",
            gl: "US",
          },
        },
        videoId,
      }),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function fetchYouTubeReaderDescription(canonicalUrl: string): Promise<string | null> {
  const reader = await fetchText(`https://r.jina.ai/${canonicalUrl}`);
  if (!reader) return null;

  // Reader exposes an expanded public description as one Markdown line. Pick
  // the longest recipe-like line so navigation and recommendations stay out of
  // the extraction payload.
  const candidates = reader.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => looksLikeRecipeText(line))
    .sort((left, right) => right.length - left.length);
  return candidates[0] ?? null;
}

async function fetchText(url: string): Promise<{ text: string; finalUrl: string } | null> {
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
    if (!response.ok) return null;
    return { text: await response.text(), finalUrl: response.url || url };
  } catch {
    return null;
  }
}

async function transcribeMedia(mediaUrl: string | null, groqApiKey?: string): Promise<string | null> {
  if (!mediaUrl || !groqApiKey) return null;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqApiKey}` },
      body: JSON.stringify({
        model: "whisper-large-v3-turbo",
        url: mediaUrl,
        response_format: "json",
        prompt: "A cooking video. Preserve ingredient amounts, units, temperatures, timings, and ordered recipe steps.",
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.text === "string" && data.text.trim() ? data.text.trim() : null;
  } catch {
    return null;
  }
}

async function fetchTikTok(url: string): Promise<Partial<SocialSource>> {
  const oembed = await fetchText(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  if (!oembed) return {};
  try {
    const data = JSON.parse(oembed.text);
    return {
      canonicalUrl: typeof data.author_unique_id === "string" && typeof data.embed_product_id === "string"
        ? `https://www.tiktok.com/@${data.author_unique_id}/video/${data.embed_product_id}`
        : url,
      title: typeof data.title === "string" ? data.title : null,
      caption: typeof data.title === "string" ? data.title : null,
      creatorName: typeof data.author_name === "string" ? data.author_name : null,
      imageUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
    };
  } catch {
    return {};
  }
}

async function fetchYouTube(url: string): Promise<Partial<SocialSource>> {
  const id = youtubeVideoId(url);
  if (!id) return {};
  const canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
  const [oembed, page, player] = await Promise.all([
    fetchText(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`),
    fetchText(canonicalUrl),
    fetchYouTubePlayer(id),
  ]);
  let metadata: Record<string, unknown> = {};
  try {
    if (oembed) metadata = JSON.parse(oembed.text);
  } catch {
    // Page metadata below remains usable.
  }
  const html = page?.text ?? "";
  const details = player?.videoDetails;
  const playerAudio = player?.streamingData?.adaptiveFormats?.find((format) =>
    format.mimeType?.startsWith("audio/") && typeof format.url === "string"
  )?.url;
  const thumbnails = details?.thumbnail?.thumbnails ?? [];
  const playerThumbnail = [...thumbnails].reverse().find((thumbnail) => thumbnail.url)?.url;
  let caption = details?.shortDescription ??
    extractJsonString(html, "shortDescription") ??
    extractMeta(html, "og:description");
  if (!looksLikeRecipeText(caption ?? "")) {
    caption = await fetchYouTubeReaderDescription(canonicalUrl) ?? caption;
  }
  return {
    canonicalUrl,
    title: typeof metadata.title === "string"
      ? metadata.title
      : details?.title ?? extractMeta(html, "og:title"),
    caption,
    creatorName: typeof metadata.author_name === "string"
      ? metadata.author_name
      : details?.author ?? null,
    imageUrl: typeof metadata.thumbnail_url === "string"
      ? metadata.thumbnail_url
      : playerThumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    mediaUrl: playerAudio ?? youtubeAudioUrl(html),
  };
}

async function fetchGenericSocial(url: string, platform: SocialPlatform): Promise<Partial<SocialSource>> {
  const page = await fetchText(url);
  let html = page?.text ?? "";
  let canonicalUrl = page?.finalUrl ?? url;

  // Instagram's embed page is often public even when the normal page returns a login shell.
  if (platform === "instagram" && !extractMeta(html, "og:description")) {
    const parsed = new URL(canonicalUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (["p", "reel", "tv"].includes(parts[0]) && parts[1]) {
      const embedded = await fetchText(`https://www.instagram.com/${parts[0]}/${parts[1]}/embed/captioned/`);
      if (embedded?.text) html = `${html}\n${embedded.text}`;
    }
  }

  const caption = extractMeta(html, "og:description") ??
    extractMeta(html, "description") ??
    extractJsonString(html, "caption") ??
    extractJsonString(html, "description");
  const title = extractMeta(html, "og:title") ?? extractMeta(html, "twitter:title");
  const creatorName = extractJsonString(html, "owner_name") ??
    extractJsonString(html, "author_name") ??
    (title?.match(/^(.*?)\s+(?:on Instagram|\| Instagram|on Facebook)/i)?.[1] ?? null);
  const imageUrl = extractMeta(html, "og:image") ?? extractMeta(html, "twitter:image");
  const mediaUrl = extractMeta(html, "og:video:secure_url") ??
    extractMeta(html, "og:video") ??
    extractJsonString(html, "contentUrl");
  const embeddedOutboundUrls = [
    extractJsonString(html, "outbound_url"),
    extractJsonString(html, "link"),
    extractMeta(html, "og:see_also"),
  ].filter((value): value is string => Boolean(value));

  return {
    canonicalUrl,
    title,
    creatorName,
    caption,
    imageUrl,
    mediaUrl,
    externalUrls: embeddedOutboundUrls,
  };
}

export async function fetchSocialSource(
  rawUrl: string,
  groqApiKey?: string,
): Promise<SocialSource | null> {
  let canonicalUrl = rawUrl;
  let platform = getSocialPlatform(canonicalUrl);

  // Resolve mobile short links such as vm.tiktok.com, youtu.be, fb.watch, and pin.it.
  if (!platform || /^(?:vm\.|vt\.)?tiktok\.com$|^youtu\.be$|^fb\.watch$|^pin\.it$/i.test(new URL(rawUrl).hostname)) {
    const resolved = await fetchText(rawUrl);
    if (resolved?.finalUrl) canonicalUrl = resolved.finalUrl;
    platform = getSocialPlatform(canonicalUrl) ?? platform;
  }
  if (!platform) return null;

  let partial: Partial<SocialSource>;
  if (platform === "tiktok") partial = await fetchTikTok(canonicalUrl);
  else if (platform === "youtube") partial = await fetchYouTube(canonicalUrl);
  else partial = await fetchGenericSocial(canonicalUrl, platform);

  canonicalUrl = partial.canonicalUrl ?? canonicalUrl;
  const caption = partial.caption?.trim() || partial.title?.trim() || null;
  const transcript = looksLikeRecipeText(caption ?? "")
    ? null
    : await transcribeMedia(partial.mediaUrl ?? null, groqApiKey);
  const externalUrls = uniqueExternalUrls(
    [
      ...(partial.externalUrls ?? []),
      ...extractUrls([caption, transcript].filter(Boolean).join("\n")),
    ],
    canonicalUrl,
  );

  return {
    platform,
    canonicalUrl,
    title: partial.title?.trim() || null,
    creatorName: partial.creatorName?.trim() || null,
    caption,
    transcript,
    imageUrl: partial.imageUrl?.trim() || null,
    mediaUrl: partial.mediaUrl?.trim() || null,
    externalUrls,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function socialSourceToHtml(source: SocialSource): string {
  const title = source.title ?? `${source.platform} recipe`;
  const body = [
    `[Social platform]: ${source.platform}`,
    source.creatorName ? `[Creator]: ${source.creatorName}` : "",
    source.caption ? `[Post caption / description]:\n${source.caption}` : "",
    source.transcript ? `[Video audio transcript]:\n${source.transcript}` : "",
  ].filter(Boolean).join("\n\n");
  return `<!doctype html><html><head><title>${escapeHtml(title)}</title>` +
    (source.imageUrl ? `<meta property="og:image" content="${escapeHtml(source.imageUrl)}">` : "") +
    `</head><body><main><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre></main></body></html>`;
}
