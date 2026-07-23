export interface ExtractedIngredient {
  original_text: string;
  item: string;
  quantity: string;
  unit: string;
  category: string;
}

export interface ExtractedStep {
  order: number;
  instruction: string;
  category: string;
}

export interface ExtractedTag {
  name: string;
  emoji: string;
}

export interface SchemaRecipe {
  title: string;
  description: string | null;
  ingredients: ExtractedIngredient[];
  steps: ExtractedStep[];
  source_url: string;
  creator_name: string | null;
  video_url: string | null;
  image_url: string | null;
  servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  tags: ExtractedTag[];
}

type JsonObject = Record<string, unknown>;

const UNICODE_FRACTIONS: Record<string, string> = {
  "¼": "1/4", "½": "1/2", "¾": "3/4",
  "⅐": "1/7", "⅑": "1/9", "⅒": "1/10",
  "⅓": "1/3", "⅔": "2/3",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

const QUANTITY_PATTERN = String.raw`(?:\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)(?:\s*[-–—]\s*(?:\d+(?:\.\d+)?|\d+\/\d+))?`;
const UNIT_PATTERN = String.raw`cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|kilograms?|ml|millilit(?:re|er)s?|l|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?|jars?|tins?|boxes?|bags?`;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasType(value: unknown, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.includes(expected));
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–",
    mdash: "—", hellip: "…", prime: "′", Prime: "″",
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => named[name] ?? match);
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normaliseFractions(value: string): string {
  const glyphs = Object.keys(UNICODE_FRACTIONS).join("");
  const re = new RegExp(`(\\d)?([${glyphs}])`, "g");
  return value.replace(re, (_match, whole: string | undefined, glyph: string) => {
    const fraction = UNICODE_FRACTIONS[glyph];
    return whole ? `${whole} ${fraction}` : fraction;
  });
}

function parseJsonLd(raw: string): unknown | null {
  const cleaned = raw
    .trim()
    .replace(/^<!--\s*/, "")
    .replace(/\s*-->$/, "")
    .replace(/^\/\*<!\[CDATA\[\*\//, "")
    .replace(/\/\*\]\]>\*\/$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function findRecipeNode(root: unknown): JsonObject | null {
  const queue: unknown[] = [root];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    if (!isObject(value) || seen.has(value)) continue;
    seen.add(value);

    if (hasType(value["@type"], "Recipe")) return value;
    queue.push(...Object.values(value));
  }

  return null;
}

export function extractRecipeNode(html: string): JsonObject | null {
  const scripts = html.matchAll(
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const script of scripts) {
    const parsed = parseJsonLd(script[1]);
    if (parsed === null) continue;
    const recipe = findRecipeNode(parsed);
    if (recipe) return recipe;
  }

  return null;
}

function firstUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const url = value.trim();
    return /^https?:\/\//i.test(url) ? url : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstUrl(item);
      if (url) return url;
    }
  }
  if (isObject(value)) {
    for (const key of ["url", "contentUrl", "embedUrl", "thumbnailUrl"]) {
      const url = firstUrl(value[key]);
      if (url) return url;
    }
  }
  return null;
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return null;
}

export function extractVideoUrlsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/g,
    /youtube\.com\/watch\?[^"'\s>]*?v=([a-zA-Z0-9_-]{11})/g,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) ids.add(match[1]);
  }
  return [...ids].map((id) => `https://www.youtube.com/watch?v=${id}`);
}

function normaliseVideoUrl(value: unknown): string | null {
  const raw = firstUrl(value);
  if (!raw) return null;
  const youtubeId = raw.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:[^#]*&)?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  )?.[1];
  return youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : raw;
}

export function parseIngredientLine(originalLine: string, category = ""): ExtractedIngredient {
  const originalText = cleanText(originalLine);
  const value = normaliseFractions(originalText);

  const dualMeasurement = value.match(new RegExp(
    `^(${QUANTITY_PATTERN})\\s*(${UNIT_PATTERN})\\s*\\/\\s*${QUANTITY_PATTERN}\\s*(?:${UNIT_PATTERN})\\s+(.+)$`,
    "i",
  ));
  if (dualMeasurement) {
    return {
      original_text: originalText,
      quantity: dualMeasurement[1].trim(),
      unit: dualMeasurement[2].toLowerCase(),
      item: dualMeasurement[3].trim(),
      category,
    };
  }

  const standard = value.match(new RegExp(
    `^(${QUANTITY_PATTERN})\\s*(${UNIT_PATTERN})?\\s+(.+)$`,
    "i",
  ));
  if (standard) {
    return {
      original_text: originalText,
      quantity: standard[1].trim(),
      unit: (standard[2] ?? "").toLowerCase(),
      item: standard[3].trim(),
      category,
    };
  }

  return {
    original_text: originalText,
    quantity: "",
    unit: "",
    item: value,
    category,
  };
}

interface HtmlIngredientGroup {
  category: string;
  lines: string[];
}

/**
 * Parse WordPress Recipe Maker ingredient groups out of raw page HTML.
 * WPRM sites (RecipeTin Eats et al.) emit recipeIngredient as a FLAT list in
 * JSON-LD — the group headings ("Aromatics", "Broth") exist only in the HTML.
 */
function extractWprmIngredientGroups(html: string): HtmlIngredientGroup[] {
  const groups: HtmlIngredientGroup[] = [];
  const groupBlocks = html.matchAll(
    /<div\b[^>]*class="[^"]*wprm-recipe-ingredient-group[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi,
  );
  for (const block of groupBlocks) {
    const name = block[1].match(
      /class="[^"]*wprm-recipe-ingredient-group-name[^"]*"[^>]*>([\s\S]*?)<\/h\d>/i,
    );
    const category = name ? cleanText(name[1]).replace(/:$/, "").trim() : "";
    const lines: string[] = [];
    const items = block[1].matchAll(
      /<li\b[^>]*class="[^"]*wprm-recipe-ingredient\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    );
    for (const item of items) {
      // Strip the checkbox widget (its sr-only span leaves a "□" glyph).
      const text = cleanText(item[1])
        .replace(/^[□▢☐\s]+/, "")
        .trim();
      if (text) lines.push(text);
    }
    if (lines.length > 0) groups.push({ category, lines });
  }
  return groups;
}

/**
 * Assign categories to schema ingredients from the page's WPRM group markup.
 * Positional when the counts line up (WPRM generates JSON-LD from the same
 * data, in the same order), falling back to normalised text matching.
 * No-op when the schema already carries categories or no named groups exist.
 */
function applyHtmlIngredientGroups(
  ingredients: ExtractedIngredient[],
  html: string,
): ExtractedIngredient[] {
  if (ingredients.length === 0 || ingredients.some((i) => i.category)) {
    return ingredients;
  }
  const groups = extractWprmIngredientGroups(html);
  if (!groups.some((g) => g.category)) return ingredients;

  const flat = groups.flatMap((g) =>
    g.lines.map((line) => ({ category: g.category, line }))
  );

  if (flat.length === ingredients.length) {
    return ingredients.map((ingredient, index) => ({
      ...ingredient,
      category: flat[index].category,
    }));
  }

  const normalise = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const byText = new Map<string, string[]>();
  for (const { category, line } of flat) {
    const key = normalise(line);
    byText.set(key, [...(byText.get(key) ?? []), category]);
  }
  return ingredients.map((ingredient) => {
    const category = byText.get(normalise(ingredient.original_text))?.shift();
    return category ? { ...ingredient, category } : ingredient;
  });
}

/**
 * Sites like marionskitchen.com embed group headings as pseudo-ingredient
 * lines ("Dressing:") inside the flat recipeIngredient list. Lift them out:
 * the heading line is removed and becomes the category of the lines that
 * follow it, until the next heading.
 */
function liftInlineHeadingCategories(
  ingredients: ExtractedIngredient[],
): ExtractedIngredient[] {
  const isHeading = (ing: ExtractedIngredient) =>
    !ing.quantity && !ing.unit && /^[^\d]{1,50}:$/.test(ing.original_text.trim());
  if (!ingredients.some(isHeading)) return ingredients;

  const result: ExtractedIngredient[] = [];
  let category = "";
  for (const ingredient of ingredients) {
    if (isHeading(ingredient)) {
      category = ingredient.original_text.trim().replace(/:$/, "").trim();
      continue;
    }
    result.push(
      category && !ingredient.category ? { ...ingredient, category } : ingredient,
    );
  }
  return result.length > 0 ? result : ingredients;
}

function flattenIngredients(
  value: unknown,
  category = "",
  blankSeparatedHeadings = false,
): ExtractedIngredient[] {
  if (typeof value === "string") {
    const ingredient = parseIngredientLine(value, category);
    return ingredient.original_text ? [ingredient] : [];
  }
  if (Array.isArray(value)) {
    if (!blankSeparatedHeadings) {
      return value.flatMap((item) => flattenIngredients(item, category));
    }

    // Marion's Kitchen represents ingredient groups as:
    //   "&nbsp;", "Quick pickled vegetables", "200g carrots", ...
    // The heading has no colon, so retain the blank-row boundary while
    // flattening and use the following line as the active category.
    const ingredients: ExtractedIngredient[] = [];
    let activeCategory = category;
    let afterBlankSeparator = false;
    for (const item of value) {
      if (typeof item === "string" && !cleanText(item)) {
        afterBlankSeparator = true;
        continue;
      }
      if (afterBlankSeparator && typeof item === "string") {
        const heading = cleanText(item).replace(/:$/, "").trim();
        if (heading) {
          activeCategory = heading;
          afterBlankSeparator = false;
          continue;
        }
      }
      ingredients.push(...flattenIngredients(item, activeCategory, true));
      afterBlankSeparator = false;
    }
    return ingredients;
  }
  if (!isObject(value)) return [];

  if (hasType(value["@type"], "HowToSection")) {
    const section = cleanText(value.name).replace(/:$/, "").trim() || category;
    return flattenIngredients(
      value.itemListElement ?? value.ingredients,
      section,
      blankSeparatedHeadings,
    );
  }

  return flattenIngredients(value.text ?? value.name, category, blankSeparatedHeadings);
}

function flattenSteps(value: unknown, category = ""): Omit<ExtractedStep, "order">[] {
  if (typeof value === "string") {
    const instruction = cleanText(value);
    return instruction ? [{ instruction, category }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenSteps(item, category));
  }
  if (!isObject(value)) return [];

  if (hasType(value["@type"], "HowToSection")) {
    const section = cleanText(value.name).replace(/:$/, "").trim() || category;
    return flattenSteps(value.itemListElement ?? value.steps, section);
  }

  const instruction = cleanText(value.text ?? value.name);
  return instruction ? [{ instruction, category }] : [];
}

function parseDuration(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const duration = value.trim().match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
  );
  if (duration) {
    const days = Number(duration[1] ?? 0);
    const hours = Number(duration[2] ?? 0);
    const minutes = Number(duration[3] ?? 0);
    const seconds = Number(duration[4] ?? 0);
    return Math.round(days * 1440 + hours * 60 + minutes + seconds / 60);
  }

  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)/i)?.[1] ?? 0);
  if (hours || minutes) return Math.round(hours * 60 + minutes);
  const plain = value.match(/\d+(?:\.\d+)?/);
  return plain ? Math.round(Number(plain[0])) : null;
}

function parseServings(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const match = String(value ?? "").match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function creatorName(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value) || null;
  if (Array.isArray(value)) {
    for (const author of value) {
      const name = creatorName(author);
      if (name) return name;
    }
  }
  if (isObject(value)) return cleanText(value.name) || null;
  return null;
}

function buildTags(recipe: JsonObject): ExtractedTag[] {
  const tagMap: Record<string, string> = {
    italian: "🇮🇹", mexican: "🇲🇽", chinese: "🇨🇳", indian: "🇮🇳",
    thai: "🇹🇭", japanese: "🇯🇵", greek: "🇬🇷", french: "🇫🇷",
    korean: "🇰🇷", vietnamese: "🇻🇳", lebanese: "🇱🇧", moroccan: "🇲🇦",
    australian: "🇦🇺", mediterranean: "🫒", dinner: "🍽️", lunch: "🥗",
    breakfast: "🍳", dessert: "🍰", snack: "🍿", soup: "🍲", salad: "🥗",
    chicken: "🍗", beef: "🥩", pork: "🥓", lamb: "🐑", fish: "🐟",
    salmon: "🐟", seafood: "🦐", shrimp: "🦐", prawn: "🦐", tofu: "🫘",
    vegetarian: "🥦", vegan: "🌱", "gluten-free": "🌾",
  };
  const values = [recipe.recipeCuisine, recipe.recipeCategory, recipe.keywords]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .flatMap((value) => typeof value === "string" ? value.split(",") : [])
    .map((value) => value.toLowerCase().trim())
    .filter(Boolean);

  const tags: ExtractedTag[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const [name, emoji] of Object.entries(tagMap)) {
      if (value.includes(name) && !seen.has(name)) {
        seen.add(name);
        tags.push({ name, emoji });
        if (tags.length === 5) return tags;
      }
    }
  }
  return tags;
}

export function extractSchemaRecipe(html: string, sourceUrl: string): SchemaRecipe | null {
  const node = extractRecipeNode(html);
  if (!node) return null;

  let isMarionsKitchen = false;
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    isMarionsKitchen =
      hostname === "marionskitchen.com" || hostname.endsWith(".marionskitchen.com");
  } catch {
    // Invalid source URLs are handled by the caller; they should not enable
    // site-specific parsing heuristics.
  }

  const ingredients = applyHtmlIngredientGroups(
    liftInlineHeadingCategories(
      flattenIngredients(
        node.recipeIngredient ?? node.ingredients,
        "",
        isMarionsKitchen,
      ),
    ),
    html,
  );
  const steps = flattenSteps(node.recipeInstructions ?? node.instructions)
    .map((step, index) => ({ ...step, order: index + 1 }));
  const videoUrl = normaliseVideoUrl(node.video) ?? extractVideoUrlsFromHtml(html)[0] ?? null;

  return {
    title: cleanText(node.name ?? node.headline),
    description: cleanText(node.description) || null,
    ingredients,
    steps,
    source_url: sourceUrl,
    creator_name: creatorName(node.author) ?? extractMetaContent(html, "author"),
    video_url: videoUrl,
    image_url: firstUrl(node.image) ?? extractMetaContent(html, "og:image") ??
      extractMetaContent(html, "twitter:image"),
    servings: parseServings(node.recipeYield),
    prep_time: parseDuration(node.prepTime),
    cook_time: parseDuration(node.cookTime),
    tags: buildTags(node),
  };
}

function normaliseIngredientKey(value: unknown): string {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

export function mergeIngredientEnrichment(
  source: ExtractedIngredient[],
  enrichment: unknown,
): ExtractedIngredient[] {
  if (!Array.isArray(enrichment) || enrichment.length === 0) return source;

  const candidates = enrichment.filter(isObject);
  const exact = new Map<string, JsonObject[]>();
  for (const candidate of candidates) {
    const key = normaliseIngredientKey(candidate.original_text);
    if (!key) continue;
    exact.set(key, [...(exact.get(key) ?? []), candidate]);
  }

  return source.map((ingredient, index) => {
    const key = normaliseIngredientKey(ingredient.original_text);
    const exactMatches = exact.get(key);
    const candidate = exactMatches?.shift() ??
      (candidates.length === source.length ? candidates[index] : undefined);
    if (!candidate) return ingredient;

    const item = cleanText(candidate.item);
    const quantity = typeof candidate.quantity === "string"
      ? normaliseFractions(candidate.quantity.trim())
      : "";
    const unit = typeof candidate.unit === "string" ? candidate.unit.trim().toLowerCase() : "";
    return {
      original_text: ingredient.original_text,
      item: item || ingredient.item,
      quantity: quantity || ingredient.quantity,
      unit: unit || ingredient.unit,
      // Deterministic categories (JSON-LD sections / WPRM page groups) beat
      // the AI's guess; the AI only fills categories the page didn't provide.
      category: ingredient.category || cleanText(candidate.category),
    };
  });
}

export function normaliseAiSteps(value: unknown): ExtractedStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((step) => ({
      instruction: cleanText(step.instruction ?? step.text),
      category: cleanText(step.category),
    }))
    .filter((step) => step.instruction)
    .map((step, index) => ({ ...step, order: index + 1 }));
}

export function validateRecipeCompleteness(recipe: {
  title?: unknown;
  ingredients?: unknown;
  steps?: unknown;
}): string[] {
  const errors: string[] = [];
  if (!cleanText(recipe.title)) errors.push("title is missing");

  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    errors.push("ingredients are missing");
  } else if (recipe.ingredients.some((ingredient) =>
    !isObject(ingredient) || !cleanText(ingredient.original_text ?? ingredient.item))) {
    errors.push("one or more ingredients are empty");
  }

  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    errors.push("directions are missing");
  } else if (recipe.steps.some((step) =>
    !isObject(step) || !cleanText(step.instruction ?? step.text))) {
    errors.push("one or more directions are empty");
  }

  return errors;
}
