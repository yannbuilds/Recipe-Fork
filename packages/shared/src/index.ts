/*
 * The barrel is for web and the extension: it re-exports the browser Supabase
 * client, which reads `import.meta.env` and so can't be parsed by Hermes.
 * React Native must import the pure helpers from their subpaths instead
 * (`@recipe-aggregator/shared/ingredients`, `/scaling`, `/recipeSource`) —
 * type-only imports from here are fine, they're erased before bundling.
 */
export { supabase } from './supabase.js';
export {
  dedupeRecipesBySource,
  findRecipeWithSameSource,
  normalizeRecipeSourceUrl,
  recipeSourceKey,
} from './recipeSource.js';
export {
  parseFraction,
  formatQuantity,
  formatIngredientLine,
  scaleQuantity,
  scaleIngredientsForServings,
} from './scaling.js';
export {
  SUB_RECIPE_SELECT,
  subRecipeIdsIn,
  hasSubRecipes,
  resolveSubRecipe,
  makesComponents,
  expandIngredientsForEntry,
} from './ingredients.js';
export type { SubRecipe, SubRecipeMap, TaggedIngredient } from './ingredients.js';
export {
  SCREEN_ON_IDLE_MS,
  SCREEN_ON_NOTICE_MS,
  SCREEN_ON_POLL_MS,
  SCREEN_ON_PROMPT_MS,
  SCREEN_ON_PROMPT_SECONDS,
} from './keepAwake.js';
export {
  customItemKey,
  makeCustomItem,
  parseShoppingLine,
} from './shoppingItems.js';
export type { CustomShoppingItem } from './shoppingItems.js';
export {
  VIDEO_PROGRESS_KEY,
  VIDEO_PROGRESS_MAX_AGE_MS,
  VIDEO_PROGRESS_MAX_ENTRIES,
  VIDEO_RESUME_END_PAD_SECONDS,
  VIDEO_RESUME_MIN_SECONDS,
  clearVideoProgress,
  formatVideoTime,
  markVideoProgress,
  parseVideoProgress,
  serializeVideoProgress,
  videoMarkFor,
  videoResumeAt,
  videoWatchedFraction,
  youTubeVideoId,
} from './videoProgress.js';
export type { VideoMark, VideoProgress } from './videoProgress.js';
export {
  COOK_BAR_VISIBLE,
  COOK_SESSION_KEY,
  COOK_SESSION_MAX_AGE_MS,
  EMPTY_SESSION,
  cookProgress,
  endCook,
  findCook,
  nextCookAfter,
  parseSession,
  serializeSession,
  setStepCount,
  shouldShowCookBar,
  startCook,
  switchCook,
  toggleIngredient,
  toggleStep,
} from './cookSession.js';
export type { ActiveCook, CookSession, StartCookInput } from './cookSession.js';
export type {
  Recipe,
  RecipeInsert,
  RecipeUpdate,
  Tag,
  TagInsert,
  RecipeTag,
  Ingredient,
  Nutrition,
  Step,
  MealPlan,
  MealPlanRecipe,
  MealPlanEntry,
  FamilyGroup,
  FamilyMember,
  FamilyInvitation,
  Cookbook,
  CookbookRecipe,
  CookbookInsert,
  CookbookUpdate,
} from './types.js';
