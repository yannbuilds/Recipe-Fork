export interface Ingredient {
  item: string;
  quantity: string;
  unit: string;
}

export interface Step {
  order: number;
  instruction: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  source_url: string;
  image_url: string | null;
  servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface RecipeTag {
  recipe_id: string;
  tag_id: string;
}

export type RecipeInsert = Omit<Recipe, 'id' | 'created_at' | 'updated_at'>;
export type RecipeUpdate = Partial<RecipeInsert>;
export type TagInsert = Omit<Tag, 'id'>;
