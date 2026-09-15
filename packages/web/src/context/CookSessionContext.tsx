import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  supabase,
} from '@recipe-aggregator/shared';
import type {
  ActiveCook,
  CookSession,
  CookSessionSnapshot,
  CookTab,
  StartCookInput,
} from '@recipe-aggregator/shared';
import { useAuth } from './AuthContext';
import { finishVideoProgress } from '../lib/videoProgress';

/*
 * What's on the stove, held above the router so it survives navigation.
 *
 * Local storage remains the instant/offline copy. An account-scoped Supabase
 * row is the shared copy, and Realtime makes an already-open second device
 * follow along. Mutations carry their own timestamp so an older offline device
 * cannot overwrite newer progress when it reconnects.
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

function readStored(userId: string): CookSessionSnapshot {
  try {
    const scoped = window.localStorage.getItem(userStorageKey(userId));
    if (scoped) return parseCookSessionSnapshot(scoped);
    return parseCookSessionSnapshot(window.localStorage.getItem(LEGACY_COOK_SESSION_KEY));
  } catch {
    // Private-mode Safari throws on localStorage access. Cooking still works,
    // it just won't survive a refresh.
    return EMPTY_COOK_SESSION_SNAPSHOT;
  }
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

  // Hydrate the user-scoped local copy first, then reconcile it with the cloud.
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
    let local = readStored(user.id);
    snapshotRef.current = local;
    setSnapshot(local);

    void Promise.resolve(
      supabase
        .from('cooking_sessions')
        .select('state, client_updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        const current = snapshotRef.current;
        let chosen = current;

        if (!error && data) {
          const remote = snapshotFromRow(data as CookingSessionRow);
          if (isCookSessionSnapshotNewer(remote.updatedAt, current.updatedAt)) chosen = remote;
          lastSyncedAtRef.current = remote.updatedAt;
        } else if (current.session.cooks.length > 0 && !current.updatedAt) {
          // A v1 device has useful local progress but no sync clock yet.
          chosen = { ...current, updatedAt: nextCookSessionUpdatedAt(null) };
        }

        snapshotRef.current = chosen;
        setSnapshot(chosen);
        setReady(true);

        try {
          window.localStorage.setItem(userStorageKey(user.id), serializeCookSessionSnapshot(chosen));
          window.localStorage.removeItem(LEGACY_COOK_SESSION_KEY);
        } catch {
          // The in-memory and cloud copies still work when localStorage doesn't.
        }
      })
      .catch(() => {
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

  // Save locally immediately; mirror to the server after a short coalescing
  // window so rapidly ticking several ingredients does not make one request per tap.
  useEffect(() => {
    if (!ready || !user) return;
    try {
      window.localStorage.setItem(userStorageKey(user.id), serializeCookSessionSnapshot(snapshot));
    } catch {
      // Quota or private mode — nothing to do but carry on in memory.
    }

    if (!snapshot.updatedAt || snapshot.updatedAt === lastSyncedAtRef.current) return;
    const outgoing = snapshot;
    const timer = window.setTimeout(() => {
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
    return () => window.clearTimeout(timer);
  }, [ready, snapshot, syncSignal, user?.id]);

  // Pick up edits from another signed-in device while this one is already open.
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
    void Promise.resolve(
      supabase
        .from('cooking_sessions')
        .select('state, client_updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
    ).then(({ data, error }) => {
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

  // Same-browser tabs can update before the Realtime round trip lands.
  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    function onStorage(e: StorageEvent) {
      if (e.key !== userStorageKey(userId)) return;
      const incoming = parseCookSessionSnapshot(e.newValue);
      if (!isCookSessionSnapshotNewer(incoming.updatedAt, snapshotRef.current.updatedAt)) return;
      snapshotRef.current = incoming;
      setSnapshot(incoming);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.id]);

  // Retry an offline local mutation when connectivity returns or the app is foregrounded.
  useEffect(() => {
    const retry = () => setSyncSignal((value) => value + 1);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') retry();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Some mobile browsers pause or silently lose a Realtime socket while the
  // screen stays open. While there is food on the stove, do a tiny foreground
  // pull as a safety net so checklist taps on another device still appear
  // promptly without requiring a refresh. Realtime remains the instant path.
  useEffect(() => {
    if (!ready || !user || session.cooks.length === 0) return;
    const pullIfVisible = () => {
      if (document.visibilityState === 'visible') {
        setSyncSignal((value) => value + 1);
      }
    };
    pullIfVisible();
    const timer = window.setInterval(pullIfVisible, 2_000);
    return () => window.clearInterval(timer);
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
