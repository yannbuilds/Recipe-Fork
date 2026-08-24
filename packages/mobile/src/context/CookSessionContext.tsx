import AsyncStorage from '@react-native-async-storage/async-storage';
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
} from '@recipe-aggregator/shared/cookSession';
import type { ActiveCook, CookSession, StartCookInput } from '@recipe-aggregator/shared/cookSession';
import { finishVideoProgress } from '@/lib/videoProgress';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/*
 * What's on the stove, held above the navigator so it survives screen pushes.
 *
 * Persisted to AsyncStorage, which is what makes two-pot cooking work: your
 * check-offs are still there after switching to the other recipe, backgrounding
 * the app, or the phone locking on the counter. The rules live in
 * `cookSession.ts` in shared, so web and mobile behave identically.
 *
 * Imported from the `/cookSession` subpath, not the barrel — the barrel pulls
 * in the browser Supabase client, which Hermes can't parse.
 */

interface CookSessionValue {
  session: CookSession;
  cooks: ActiveCook[];
  active: ActiveCook | null;
  isCooking: boolean;
  /** True once storage has been read — until then the bar must not flash empty. */
  ready: boolean;
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
  ready: false,
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

export function CookSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CookSession>(EMPTY_SESSION);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(COOK_SESSION_KEY)
      .then((raw) => {
        if (!cancelled) setSession(parseSession(raw));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't write the empty starting state back over a real session before the
  // read above has landed — that would wipe a cook every cold start.
  const readyRef = useRef(false);
  readyRef.current = ready;
  useEffect(() => {
    if (!readyRef.current) return;
    AsyncStorage.setItem(COOK_SESSION_KEY, serializeSession(session)).catch(() => {});
  }, [session, ready]);

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
      ready,
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
    [session, ready, startCook, endCook, switchCook, toggleIngredient, toggleStep, setStepCount, clearSession],
  );

  return <CookSessionContext.Provider value={value}>{children}</CookSessionContext.Provider>;
}

export function useCookSession() {
  return useContext(CookSessionContext);
}
