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
  video_url: string | null;
  image_url: string | null;
  servings: number | null;
  custom_servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
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

export interface MealPlanRecipe {
  id: string;
  meal_plan_id: string;
  recipe_id: string;
  is_cooked: boolean;
  added_at: string;
}

export interface MealPlanEntry extends MealPlanRecipe {
  recipe: Recipe;
}

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
