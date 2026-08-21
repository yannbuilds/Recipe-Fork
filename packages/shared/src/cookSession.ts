/*
 * The cooking session — what's on the stove right now.
 *
 * Before this existed, "cook mode" was two URL params (`?cook=1&entry=…`) read
 * by the recipe screen, and the tick state lived in that screen's React state.
 * Which meant exactly one recipe could be cooking at a time, and walking away
 * from the screen threw your progress away.
 *
 * A session promotes it to something that outlives any one screen: a list of
 * active cooks, each carrying its own check-offs. The recipe screen becomes a
 * *view* onto one of them, so switching between two recipes mid-cook is just
 * changing which one you're looking at — nothing is lost, nothing is cancelled.
 *
 * Everything here is pure and platform-free. Web persists it to localStorage,
 * mobile to AsyncStorage; the reducers below are the only place the rules live,
 * so the two can't drift apart.
 */

/** One recipe on the stove. */
export interface ActiveCook {
  recipeId: string;
  /**
   * The `meal_plan_recipes` row this cook came from, flipped to `is_cooked`
   * when you finish. Null when you started cooking straight from a recipe
   * rather than from the plan — that still logs a cook, it just has no plan
   * row to tick off.
   */
  mealPlanEntryId: string | null;
  /**
   * Enough of the recipe to draw the switcher bar without a round trip. A cook
   * usually starts on the recipe screen, where all of this is already loaded,
   * and re-fetching every recipe in the session just to label a pill would
   * make the bar flicker on every app start.
   */
  title: string;
  imageUrl: string | null;
  /** Checked ingredient keys — `"<group category>::<index>"`, or `"<parentKey>::sub::<i>"` for an expanded sub-recipe's lines. */
  checkedIngredients: string[];
  /** Checked step numbers (`Step.order`, not the display index). */
  checkedSteps: number[];
  /** Total steps, so the bar can say "4 of 9" without loading the recipe. */
  stepCount: number;
  startedAt: string;
}

export interface CookSession {
  cooks: ActiveCook[];
  /** Which cook the recipe screen is currently showing. Null when the session is empty. */
  activeRecipeId: string | null;
}

export const EMPTY_SESSION: CookSession = { cooks: [], activeRecipeId: null };

/** Storage key, shared so web and mobile agree on where it lives. */
export const COOK_SESSION_KEY = 'pk-cook-session-v1';

/**
 * How many cooks the bar shows before it starts scrolling. Not a hard cap on
 * the session — you can add a fourth, it just won't all fit at once.
 */
export const COOK_BAR_VISIBLE = 3;

/**
 * A session left running overnight is almost certainly a forgotten one, not a
 * 14-hour brisket you're still tending. Sessions older than this are dropped on
 * load rather than greeting you with a stale bar the next morning.
 */
export const COOK_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface StartCookInput {
  recipeId: string;
  mealPlanEntryId?: string | null;
  title: string;
  imageUrl?: string | null;
  stepCount?: number;
}

function makeCook(input: StartCookInput): ActiveCook {
  return {
    recipeId: input.recipeId,
    mealPlanEntryId: input.mealPlanEntryId ?? null,
    title: input.title,
    imageUrl: input.imageUrl ?? null,
    checkedIngredients: [],
    checkedSteps: [],
    stepCount: input.stepCount ?? 0,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Put a recipe on the stove and switch to it.
 *
 * Adding one that's already cooking is a no-op on its progress — it just
 * switches to it. That matters: "Add to cook" and "Cook" are the same button in
 * different clothes, and tapping the wrong one must never wipe your check-offs.
 * The plan entry is filled in if we've since learned it (you started from the
 * recipe, then found it on the plan), but never cleared back to null.
 */
export function startCook(session: CookSession, input: StartCookInput): CookSession {
  const existing = session.cooks.find((c) => c.recipeId === input.recipeId);
  if (existing) {
    return {
      cooks: session.cooks.map((c) =>
        c.recipeId === input.recipeId
          ? {
              ...c,
              mealPlanEntryId: input.mealPlanEntryId ?? c.mealPlanEntryId,
              // Keep the freshest label/photo, but never blank one we already have.
              title: input.title || c.title,
              imageUrl: input.imageUrl ?? c.imageUrl,
              stepCount: input.stepCount ?? c.stepCount,
            }
          : c,
      ),
      activeRecipeId: input.recipeId,
    };
  }
  return {
    cooks: [...session.cooks, makeCook(input)],
    activeRecipeId: input.recipeId,
  };
}

/**
 * Take a recipe off the stove — finished, or given up on.
 *
 * If it was the one you were looking at, the next remaining cook becomes
 * active, so finishing one of two hands you straight to the other instead of
 * dumping you back on the plan.
 */
export function endCook(session: CookSession, recipeId: string): CookSession {
  const cooks = session.cooks.filter((c) => c.recipeId !== recipeId);
  if (session.activeRecipeId !== recipeId) {
    return { cooks, activeRecipeId: cooks.length ? session.activeRecipeId : null };
  }
  return { cooks, activeRecipeId: cooks[0]?.recipeId ?? null };
}

export function switchCook(session: CookSession, recipeId: string): CookSession {
  if (session.activeRecipeId === recipeId) return session;
  if (!session.cooks.some((c) => c.recipeId === recipeId)) return session;
  return { ...session, activeRecipeId: recipeId };
}

export function findCook(session: CookSession, recipeId: string | undefined | null): ActiveCook | null {
  if (!recipeId) return null;
  return session.cooks.find((c) => c.recipeId === recipeId) ?? null;
}

/** The cook to hand over to when `recipeId` finishes, or null if it was the last. */
export function nextCookAfter(session: CookSession, recipeId: string): ActiveCook | null {
  return session.cooks.find((c) => c.recipeId !== recipeId) ?? null;
}

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function updateCook(
  session: CookSession,
  recipeId: string,
  fn: (cook: ActiveCook) => ActiveCook,
): CookSession {
  return {
    ...session,
    cooks: session.cooks.map((c) => (c.recipeId === recipeId ? fn(c) : c)),
  };
}

export function toggleIngredient(session: CookSession, recipeId: string, key: string): CookSession {
  return updateCook(session, recipeId, (c) => ({
    ...c,
    checkedIngredients: toggleIn(c.checkedIngredients, key),
  }));
}

export function toggleStep(session: CookSession, recipeId: string, order: number): CookSession {
  return updateCook(session, recipeId, (c) => ({
    ...c,
    checkedSteps: toggleIn(c.checkedSteps, order),
  }));
}

/** Fill in a step count we didn't know when the cook started (added from the plan, say). */
export function setStepCount(session: CookSession, recipeId: string, stepCount: number): CookSession {
  const cook = findCook(session, recipeId);
  if (!cook || cook.stepCount === stepCount) return session;
  return updateCook(session, recipeId, (c) => ({ ...c, stepCount }));
}

/** Steps done out of total, for the bar's progress ring and its "4 of 9" line. */
export function cookProgress(cook: ActiveCook): { done: number; total: number; fraction: number } {
  const total = cook.stepCount;
  // Steps can be un-ticked and recipes can be edited mid-cook, so clamp rather
  // than trusting the two numbers to stay consistent.
  const done = Math.min(cook.checkedSteps.length, total || cook.checkedSteps.length);
  return { done, total, fraction: total > 0 ? Math.min(1, done / total) : 0 };
}

/**
 * Rehydrate whatever came out of storage.
 *
 * Storage is the least trustworthy input in the app — a half-written blob, a
 * shape from a previous version, a session from yesterday. Anything that
 * doesn't parse cleanly comes back as an empty session rather than throwing on
 * app start and leaving you staring at a white screen mid-cook.
 */
export function parseSession(raw: string | null | undefined, now = Date.now()): CookSession {
  if (!raw) return EMPTY_SESSION;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_SESSION;
  }
  if (!data || typeof data !== 'object') return EMPTY_SESSION;
  const rawCooks = (data as { cooks?: unknown }).cooks;
  if (!Array.isArray(rawCooks)) return EMPTY_SESSION;

  const cooks: ActiveCook[] = [];
  for (const entry of rawCooks) {
    if (!entry || typeof entry !== 'object') continue;
    const c = entry as Partial<ActiveCook>;
    if (typeof c.recipeId !== 'string' || !c.recipeId) continue;
    const startedAt = typeof c.startedAt === 'string' ? c.startedAt : new Date(now).toISOString();
    const started = Date.parse(startedAt);
    if (Number.isFinite(started) && now - started > COOK_SESSION_MAX_AGE_MS) continue;
    cooks.push({
      recipeId: c.recipeId,
      mealPlanEntryId: typeof c.mealPlanEntryId === 'string' ? c.mealPlanEntryId : null,
      title: typeof c.title === 'string' ? c.title : 'Recipe',
      imageUrl: typeof c.imageUrl === 'string' ? c.imageUrl : null,
      checkedIngredients: Array.isArray(c.checkedIngredients)
        ? c.checkedIngredients.filter((k): k is string => typeof k === 'string')
        : [],
      checkedSteps: Array.isArray(c.checkedSteps)
        ? c.checkedSteps.filter((n): n is number => typeof n === 'number')
        : [],
      stepCount: typeof c.stepCount === 'number' ? c.stepCount : 0,
      startedAt,
    });
  }
  if (cooks.length === 0) return EMPTY_SESSION;

  const activeRaw = (data as { activeRecipeId?: unknown }).activeRecipeId;
  const active =
    typeof activeRaw === 'string' && cooks.some((c) => c.recipeId === activeRaw)
      ? activeRaw
      : cooks[0].recipeId;
  return { cooks, activeRecipeId: active };
}

export function serializeSession(session: CookSession): string {
  return JSON.stringify(session);
}

/**
 * Should the cooking bar be on screen right now?
 *
 * The bar exists to get you back to a pot you aren't looking at. With two or
 * more going it's the switcher and always earns its place — but with a single
 * cook, sitting on that recipe's own screen, it says nothing you can't already
 * see and just eats a strip of the page. So it stays out of the way there and
 * reappears the moment you wander off, which is the same thing the iOS call bar
 * does: no green bar while you're in the call, one the moment you leave it.
 *
 * `viewingRecipeId` is the recipe actually on screen, or null anywhere else.
 */
export function shouldShowCookBar(
  cooks: ActiveCook[],
  viewingRecipeId: string | null | undefined,
): boolean {
  if (cooks.length === 0) return false;
  if (cooks.length > 1) return true;
  return cooks[0].recipeId !== viewingRecipeId;
}
