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
