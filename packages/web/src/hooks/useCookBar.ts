import { useLocation } from 'react-router-dom';
import { shouldShowCookBar } from '@recipe-aggregator/shared';
import { useCookSession } from '../context/CookSessionContext';

/*
 * Layout and visibility for the cooking bar, in one place so the bar and the
 * screens making room for it can never disagree about whether it's there.
 */

/** Height of the bar, for screens lifting floating buttons clear of it. */
export const COOK_BAR_HEIGHT = 58;

/**
 * The recipe currently on screen, or null anywhere else in the app.
 *
 * Only the recipe view itself counts — `/recipe/:id/edit` shows none of the
 * cooking state, so the bar should still be there to get you back.
 */
export function useViewingRecipeId(): string | null {
  const parts = useLocation().pathname.split('/');
  return parts.length === 3 && parts[1] === 'recipe' ? parts[2] || null : null;
}

/** Is the bar on screen right now? See `shouldShowCookBar` for the rule. */
export function useCookBarVisible(): boolean {
  const { cooks } = useCookSession();
  return shouldShowCookBar(cooks, useViewingRecipeId());
}

/** Extra bottom room a fixed-position element needs to clear the bar. */
export function useCookBarOffset(): number {
  return useCookBarVisible() ? COOK_BAR_HEIGHT : 0;
}
