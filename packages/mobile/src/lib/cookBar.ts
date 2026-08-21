import { shouldShowCookBar } from '@recipe-aggregator/shared/cookSession';
import { usePathname } from 'expo-router';
import { useCookSession } from '@/context/CookSessionContext';

/*
 * Layout and visibility for the cooking bar, kept apart from the bar component
 * itself so screens can reserve room for it without pulling in the bar, its
 * sheets and their Supabase queries — and so the bar and the screens making
 * room for it can never disagree about whether it's there.
 */

/** Height of the bar, so screens can lift their own content and floating buttons clear. */
export const COOK_BAR_HEIGHT = 58;

/**
 * The recipe currently on screen, or null anywhere else in the app.
 *
 * Only the recipe view itself counts — `/recipe/[id]/edit` shows none of the
 * cooking state, so the bar should still be there to get you back.
 */
export function useViewingRecipeId(): string | null {
  const parts = usePathname().split('/');
  return parts.length === 3 && parts[1] === 'recipe' ? parts[2] || null : null;
}

/** Is the bar on screen right now? See `shouldShowCookBar` for the rule. */
export function useCookBarVisible(): boolean {
  const { cooks } = useCookSession();
  return shouldShowCookBar(cooks, useViewingRecipeId());
}

/** Extra bottom room a screen needs right now — zero when the bar isn't showing. */
export function useCookBarOffset(): number {
  return useCookBarVisible() ? COOK_BAR_HEIGHT + 8 : 0;
}
