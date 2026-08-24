import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  COOK_SESSION_KEY,
  EMPTY_SESSION,
  endCook as endCookIn,
  findCook,
  nextCookAfter as nextCookAfterIn,
  parseSession,
  serializeSession,
  setStepCount as setStepCountIn,
  startCook as startCookIn,
  switchCook as switchCookIn,
  toggleIngredient as toggleIngredientIn,
  toggleStep as toggleStepIn,
} from '@recipe-aggregator/shared';
import type { ActiveCook, CookSession, StartCookInput } from '@recipe-aggregator/shared';
import { finishVideoProgress } from '../lib/videoProgress';

/*
 * What's on the stove, held above the router so it survives navigation.
 *
 * Persisted to localStorage, which is what makes the whole thing work: your
 * check-offs are still there after a switch to the other recipe, a refresh, or
 * an accidental back-swipe. See `cookSession.ts` in shared for the rules.
 *
 * Deliberately not synced to Supabase yet — a cook happens on one device, in
 * one kitchen, usually offline-ish. `cookSession.ts` is written so a synced
 * backing store can slot in later without touching any screen.
 */

interface CookSessionValue {
  session: CookSession;
  cooks: ActiveCook[];
  /** The cook the recipe screen should be showing, if any. */
  active: ActiveCook | null;
  isCooking: boolean;
  cookFor: (recipeId: string | undefined | null) => ActiveCook | null;
  startCook: (input: StartCookInput) => void;
  endCook: (recipeId: string) => void;
  switchCook: (recipeId: string) => void;
  nextCookAfter: (recipeId: string) => ActiveCook | null;
  toggleIngredient: (recipeId: string, key: string) => void;
  toggleStep: (recipeId: string, order: number) => void;
  setStepCount: (recipeId: string, stepCount: number) => void;
  clearSession: () => void;
}

const noop = () => {};

const CookSessionContext = createContext<CookSessionValue>({
  session: EMPTY_SESSION,
  cooks: [],
  active: null,
  isCooking: false,
  cookFor: () => null,
  startCook: noop,
  endCook: noop,
  switchCook: noop,
  nextCookAfter: () => null,
  toggleIngredient: noop,
  toggleStep: noop,
  setStepCount: noop,
  clearSession: noop,
});

function readStored(): CookSession {
  if (typeof window === 'undefined') return EMPTY_SESSION;
  try {
    return parseSession(window.localStorage.getItem(COOK_SESSION_KEY));
  } catch {
    // Private-mode Safari throws on localStorage access. Cooking still works,
    // it just won't survive a refresh.
    return EMPTY_SESSION;
  }
}

export function CookSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CookSession>(readStored);
  // Set while *this* tab is writing, so the storage event below can ignore the
  // echo of our own write and only react to the other tab's.
  const writingRef = useRef(false);

  useEffect(() => {
    try {
      writingRef.current = true;
      window.localStorage.setItem(COOK_SESSION_KEY, serializeSession(session));
    } catch {
      // Quota or private mode — nothing to do but carry on in memory.
    } finally {
      writingRef.current = false;
    }
  }, [session]);

  // The app open in two tabs (laptop + the iPad propped by the hob) should agree
  // on what's cooking. `storage` only fires in the *other* tabs, so this is a
  // one-way mirror, not a loop.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== COOK_SESSION_KEY || writingRef.current) return;
      setSession(parseSession(e.newValue));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const startCook = useCallback((input: StartCookInput) => {
    setSession((prev) => startCookIn(prev, input));
  }, []);

  const endCook = useCallback((recipeId: string) => {
    finishVideoProgress(recipeId);
    setSession((prev) => endCookIn(prev, recipeId));
  }, []);

  const switchCook = useCallback((recipeId: string) => {
    setSession((prev) => switchCookIn(prev, recipeId));
  }, []);

  const toggleIngredient = useCallback((recipeId: string, key: string) => {
    setSession((prev) => toggleIngredientIn(prev, recipeId, key));
  }, []);

  const toggleStep = useCallback((recipeId: string, order: number) => {
    setSession((prev) => toggleStepIn(prev, recipeId, order));
  }, []);

  const setStepCount = useCallback((recipeId: string, stepCount: number) => {
    setSession((prev) => setStepCountIn(prev, recipeId, stepCount));
  }, []);

  const clearSession = useCallback(() => {
    setSession((prev) => {
      for (const cook of prev.cooks) finishVideoProgress(cook.recipeId);
      return EMPTY_SESSION;
    });
  }, []);

  const value = useMemo<CookSessionValue>(
    () => ({
      session,
      cooks: session.cooks,
      active: findCook(session, session.activeRecipeId),
      isCooking: session.cooks.length > 0,
      cookFor: (recipeId) => findCook(session, recipeId),
      nextCookAfter: (recipeId) => nextCookAfterIn(session, recipeId),
      startCook,
      endCook,
      switchCook,
      toggleIngredient,
      toggleStep,
      setStepCount,
      clearSession,
    }),
    [session, startCook, endCook, switchCook, toggleIngredient, toggleStep, setStepCount, clearSession],
  );

  return <CookSessionContext.Provider value={value}>{children}</CookSessionContext.Provider>;
}

export function useCookSession() {
  return useContext(CookSessionContext);
}
