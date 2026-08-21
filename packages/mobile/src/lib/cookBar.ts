import { useCookSession } from '@/context/CookSessionContext';

/*
 * Layout metrics for the cooking bar, kept apart from the bar component itself
 * so screens can reserve room for it without pulling in the bar, its sheets and
 * their Supabase queries.
 */

/** Height of the bar, so screens can lift their own content and floating buttons clear. */
export const COOK_BAR_HEIGHT = 58;

/** Extra bottom room a screen needs right now — zero when nothing is cooking. */
export function useCookBarOffset(): number {
  const { isCooking } = useCookSession();
  return isCooking ? COOK_BAR_HEIGHT + 8 : 0;
}
