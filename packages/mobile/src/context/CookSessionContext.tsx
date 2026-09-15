import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COOK_SESSION_KEY,
  EMPTY_COOK_SESSION_SNAPSHOT,
  EMPTY_SESSION,
  LEGACY_COOK_SESSION_KEY,
  clearCookVideoMark as clearCookVideoMarkIn,
  endCook as endCookIn,
  findCook,
  isCookSessionSnapshotNewer,
  nextCookSessionUpdatedAt,
  nextCookAfter as nextCookAfterIn,
  parseCookSessionSnapshot,
  parseSessionValue,
  saveCookVideoMark as saveCookVideoMarkIn,
  serializeCookSessionSnapshot,
  setCookServings as setCookServingsIn,
  setCookTab as setCookTabIn,
  setStepCount as setStepCountIn,
  startCook as startCookIn,
  switchCook as switchCookIn,
  toggleExpandedIngredient as toggleExpandedIngredientIn,
  toggleIngredient as toggleIngredientIn,
  toggleStep as toggleStepIn,
} from '@recipe-aggregator/shared/cookSession';
import type {
  ActiveCook,
  CookSession,
  CookSessionSnapshot,
  CookTab,
  StartCookInput,
} from '@recipe-aggregator/shared/cookSession';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
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
import { AppState } from 'react-native';

/*
 * What's on the stove, held above the navigator so it survives screen pushes.
 *
 * AsyncStorage remains the instant/offline copy. An account-scoped Supabase row
 * is the shared copy, and Realtime makes an already-open second device follow
 * along. The rules live in `cookSession.ts` in shared, so web and mobile behave
 * identically.
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
  setCookServings: (recipeId: string, servings: number) => void;
  setCookTab: (recipeId: string, tab: CookTab) => void;
  toggleExpandedIngredient: (recipeId: string, key: string) => void;
  saveCookVideoMark: (recipeId: string, seconds: number, duration: number | null) => void;
  clearCookVideoMark: (recipeId: string) => void;
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
  setCookServings: noop,
  setCookTab: noop,
  toggleExpandedIngredient: noop,
  saveCookVideoMark: noop,
  clearCookVideoMark: noop,
  clearSession: noop,
});

type CookingSessionRow = {
  state: unknown;
  client_updated_at: string;
};

function userStorageKey(userId: string): string {
  return `${COOK_SESSION_KEY}:${userId}`;
}

function snapshotFromRow(row: CookingSessionRow): CookSessionSnapshot {
  return {
    session: parseSessionValue(row.state),
    updatedAt: row.client_updated_at,
  };
}

export function CookSessionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<CookSessionSnapshot>(EMPTY_COOK_SESSION_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [syncSignal, setSyncSignal] = useState(0);
  const snapshotRef = useRef(snapshot);
  const lastSyncedAtRef = useRef<string | null>(null);
  const session = snapshot.session;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      snapshotRef.current = EMPTY_COOK_SESSION_SNAPSHOT;
      setSnapshot(EMPTY_COOK_SESSION_SNAPSHOT);
      setReady(true);
      lastSyncedAtRef.current = null;
      return;
    }

    let cancelled = false;
    setReady(false);
    lastSyncedAtRef.current = null;

    void (async () => {
      let local = EMPTY_COOK_SESSION_SNAPSHOT;
      try {
        const scoped = await AsyncStorage.getItem(userStorageKey(user.id));
        const legacy = scoped ? null : await AsyncStorage.getItem(LEGACY_COOK_SESSION_KEY);
        local = parseCookSessionSnapshot(scoped ?? legacy);
      } catch {
        // Cloud hydration below can still recover the session.
      }
      if (cancelled) return;
      snapshotRef.current = local;
      setSnapshot(local);

      const { data, error } = await supabase
        .from('cooking_sessions')
        .select('state, client_updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;

      const current = snapshotRef.current;
      let chosen = current;
      if (!error && data) {
        const remote = snapshotFromRow(data as CookingSessionRow);
        if (isCookSessionSnapshotNewer(remote.updatedAt, current.updatedAt)) chosen = remote;
        lastSyncedAtRef.current = remote.updatedAt;
      } else if (current.session.cooks.length > 0 && !current.updatedAt) {
        chosen = { ...current, updatedAt: nextCookSessionUpdatedAt(null) };
      }

      snapshotRef.current = chosen;
      setSnapshot(chosen);
      setReady(true);
      await AsyncStorage.setItem(userStorageKey(user.id), serializeCookSessionSnapshot(chosen)).catch(() => {});
      await AsyncStorage.removeItem(LEGACY_COOK_SESSION_KEY).catch(() => {});
    })().catch(() => {
      if (cancelled) return;
      const current = snapshotRef.current;
      const chosen =
        current.session.cooks.length > 0 && !current.updatedAt
          ? { ...current, updatedAt: nextCookSessionUpdatedAt(null) }
          : current;
      snapshotRef.current = chosen;
      setSnapshot(chosen);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  // Don't write the empty starting state back over a real session before
  // hydration lands. Coalesce rapid checklist taps into one network request.
  useEffect(() => {
    if (!ready || !user) return;
    AsyncStorage.setItem(userStorageKey(user.id), serializeCookSessionSnapshot(snapshot)).catch(() => {});
    if (!snapshot.updatedAt || snapshot.updatedAt === lastSyncedAtRef.current) return;

    const outgoing = snapshot;
    const timer = setTimeout(() => {
      void supabase
        .rpc('sync_cooking_session', {
          p_state: outgoing.session,
          p_client_updated_at: outgoing.updatedAt,
        })
        .then(({ data, error }) => {
          if (error || !data) return;
          const row = (Array.isArray(data) ? data[0] : data) as CookingSessionRow | undefined;
          if (!row) return;
          const canonical = snapshotFromRow(row);
          lastSyncedAtRef.current = canonical.updatedAt;
          if (isCookSessionSnapshotNewer(canonical.updatedAt, snapshotRef.current.updatedAt)) {
            snapshotRef.current = canonical;
            setSnapshot(canonical);
          }
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [ready, snapshot, syncSignal, user?.id]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`cooking-session:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cooking_sessions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as CookingSessionRow;
          if (!row?.client_updated_at) return;
          const incoming = snapshotFromRow(row);
          const current = snapshotRef.current;
          if (incoming.updatedAt === current.updatedAt) {
            lastSyncedAtRef.current = incoming.updatedAt;
            return;
          }
          if (!isCookSessionSnapshotNewer(incoming.updatedAt, current.updatedAt)) return;
          lastSyncedAtRef.current = incoming.updatedAt;
          snapshotRef.current = incoming;
          setSnapshot(incoming);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSyncSignal((value) => value + 1);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Realtime does not replay changes made while a device was disconnected.
  // Pull once whenever its subscription (re)connects or the app comes forward.
  useEffect(() => {
    if (!ready || !user || syncSignal === 0) return;
    let cancelled = false;
    void supabase
      .from('cooking_sessions')
      .select('state, client_updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const incoming = snapshotFromRow(data as CookingSessionRow);
        const current = snapshotRef.current;
        if (incoming.updatedAt === current.updatedAt) {
          lastSyncedAtRef.current = incoming.updatedAt;
          return;
        }
        if (!isCookSessionSnapshotNewer(incoming.updatedAt, current.updatedAt)) return;
        lastSyncedAtRef.current = incoming.updatedAt;
        snapshotRef.current = incoming;
        setSnapshot(incoming);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, syncSignal, user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setSyncSignal((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  // Realtime is still the instant path, but mobile operating systems can
  // suspend its socket without warning. Poll only while an active cooking
  // session is on screen so another device's checklist taps arrive without a
  // manual refresh or app restart.
  useEffect(() => {
    if (!ready || !user || session.cooks.length === 0) return;
    const pullIfActive = () => {
      if (AppState.currentState === 'active') {
        setSyncSignal((value) => value + 1);
      }
    };
    pullIfActive();
    const timer = setInterval(pullIfActive, 2_000);
    return () => clearInterval(timer);
  }, [ready, session.cooks.length, user?.id]);

  const mutate = useCallback((reducer: (current: CookSession) => CookSession) => {
    setSnapshot((previous) => {
      const nextSession = reducer(previous.session);
      if (nextSession === previous.session) return previous;
      const next = {
        session: nextSession,
        updatedAt: nextCookSessionUpdatedAt(previous.updatedAt),
      };
      snapshotRef.current = next;
      return next;
    });
  }, []);

  const startCook = useCallback((input: StartCookInput) => {
    mutate((prev) => startCookIn(prev, input));
  }, [mutate]);

  const endCook = useCallback((recipeId: string) => {
    finishVideoProgress(recipeId);
    mutate((prev) => endCookIn(prev, recipeId));
  }, [mutate]);

  const switchCook = useCallback((recipeId: string) => {
    mutate((prev) => switchCookIn(prev, recipeId));
  }, [mutate]);

  const toggleIngredient = useCallback((recipeId: string, key: string) => {
    mutate((prev) => toggleIngredientIn(prev, recipeId, key));
  }, [mutate]);

  const toggleStep = useCallback((recipeId: string, order: number) => {
    mutate((prev) => toggleStepIn(prev, recipeId, order));
  }, [mutate]);

  const setStepCount = useCallback((recipeId: string, stepCount: number) => {
    mutate((prev) => setStepCountIn(prev, recipeId, stepCount));
  }, [mutate]);

  const setCookServings = useCallback((recipeId: string, servings: number) => {
    mutate((prev) => setCookServingsIn(prev, recipeId, servings));
  }, [mutate]);

  const setCookTab = useCallback((recipeId: string, tab: CookTab) => {
    mutate((prev) => setCookTabIn(prev, recipeId, tab));
  }, [mutate]);

  const toggleExpandedIngredient = useCallback((recipeId: string, key: string) => {
    mutate((prev) => toggleExpandedIngredientIn(prev, recipeId, key));
  }, [mutate]);

  const saveCookVideoMark = useCallback((recipeId: string, seconds: number, duration: number | null) => {
    mutate((prev) => saveCookVideoMarkIn(prev, recipeId, seconds, duration));
  }, [mutate]);

  const clearCookVideoMark = useCallback((recipeId: string) => {
    mutate((prev) => clearCookVideoMarkIn(prev, recipeId));
  }, [mutate]);

  const clearSession = useCallback(() => {
    mutate((prev) => {
      for (const cook of prev.cooks) finishVideoProgress(cook.recipeId);
      return EMPTY_SESSION;
    });
  }, [mutate]);

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
      setCookServings,
      setCookTab,
      toggleExpandedIngredient,
      saveCookVideoMark,
      clearCookVideoMark,
      clearSession,
    }),
    [
      session,
      ready,
      startCook,
      endCook,
      switchCook,
      toggleIngredient,
      toggleStep,
      setStepCount,
      setCookServings,
      setCookTab,
      toggleExpandedIngredient,
      saveCookVideoMark,
      clearCookVideoMark,
      clearSession,
    ],
  );

  return <CookSessionContext.Provider value={value}>{children}</CookSessionContext.Provider>;
}

export function useCookSession() {
  return useContext(CookSessionContext);
}
