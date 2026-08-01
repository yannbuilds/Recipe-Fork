export interface Ingredient {
  item: string;
  quantity: string;
  unit: string;
  category?: string;
  original_text?: string;
}

export interface Step {
  order: number;
  instruction: string;
  category?: string;
}

/**
 * Per-serving nutrition, exactly as the source recipe published it
 * (schema.org NutritionInformation). Every field is optional — sites publish
 * very different subsets, and we never estimate the ones they leave out.
 *
 * Units are canonical: kcal for calories, grams for the macros, mg for sodium
 * and cholesterol. "Per serving" means one serving of the recipe's own yield,
 * so these numbers don't change when the cook scales the servings.
 */
export interface Nutrition {
  calories?: number | null;
  protein?: number | null;
  carbohydrate?: number | null;
  fat?: number | null;
  saturated_fat?: number | null;
  trans_fat?: number | null;
  unsaturated_fat?: number | null;
  fibre?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  cholesterol?: number | null;
  /** What one serving is, as published ("1 serving", "243 g"). */
  serving_size?: string | null;
}

export interface Recipe {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  source_url: string;
  creator_name: string | null;
  author_notes: string | null;
  user_notes: string | null;
  video_url: string | null;
  image_url: string | null;
  servings: number | null;
  custom_servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  nutrition?: Nutrition | null;
  is_favourite: boolean;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
}

export interface Tag {
  id: string;
  name: string;
  emoji?: string;
}

export interface RecipeTag {
  recipe_id: string;
  tag_id: string;
}

export type RecipeInsert = Omit<Recipe, 'id' | 'created_at' | 'updated_at'>;
export type RecipeUpdate = Partial<RecipeInsert>;
export type TagInsert = Omit<Tag, 'id'>;

export interface MealPlan {
  id: string;
  user_id: string;
  week_start: string;
  checked_items: string[];
  shopping_categories: Record<string, string>;
  created_at: string;
}

// What a day in the plan actually is.
//  'cook'  – the night you cook it. Its `servings` covers the whole batch, so a
//            household of 2 eating the same thing twice shops for 4.
//  'batch' – another night off that same cook (meal prep). Adds nothing to the
//            shopping list, but ticks off on its own.
//  'out'   – eating out. No recipe, no shopping, just a filled day.
export type MealEntryType = 'cook' | 'batch' | 'out';

export interface MealPlanRecipe {
  id: string;
  meal_plan_id: string;
  // Null only for 'out' entries.
  recipe_id: string | null;
  is_cooked: boolean;
  added_at: string;
  // 0 = Monday … 6 = Sunday. Null means "in the week, not on a day yet" —
  // placing a meal on a day is always optional.
  day_index: number | null;
  entry_type: MealEntryType;
  // 'batch' rows point at the 'cook' row they were portioned from.
  parent_id: string | null;
  // Servings for this plan only; falls back to the recipe's own value.
  servings: number | null;
  // Free text for 'out' entries ("Thai place").
  note: string | null;
}

export interface MealPlanEntry extends MealPlanRecipe {
  recipe: Recipe | null;
}

// One row per cook of a recipe. Ratings (1–5) are collected right after
// cooking and are all optional — a skipped rating still logs the cook.
export interface RecipeCook {
  id: string;
  recipe_id: string;
  user_id: string;
  meal_plan_recipe_id: string | null;
  cooked_at: string;
  rating_taste: number | null;
  rating_ease: number | null;
  rating_value: number | null;
}

export interface Cookbook {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  // Chosen cover recipe (shown as the cookbook's thumbnail in the
  // save-to-cookbook sheet). Null = automatic (newest recipe photo).
  cover_recipe_id?: string | null;
  // Manual display order (ascending). Lower = earlier. Defaults to 0 server-side.
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface CookbookRecipe {
  cookbook_id: string;
  recipe_id: string;
  added_at: string;
}

export type CookbookInsert = Omit<Cookbook, 'id' | 'created_at' | 'updated_at'>;
export type CookbookUpdate = Partial<CookbookInsert>;

export interface FamilyGroup {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface FamilyMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile?: { display_name: string };
}

export interface FamilyInvitation {
  id: string;
  group_id: string;
  invited_by: string;
  invited_email: string;
  token: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
  expires_at: string;
}
