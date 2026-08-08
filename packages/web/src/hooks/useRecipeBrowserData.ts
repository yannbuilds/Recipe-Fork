import { useEffect, useMemo, useState } from 'react';
import { dedupeRecipesBySource, supabase } from '@recipe-aggregator/shared';
import type { Cookbook, Recipe, Tag } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import type { RecipeTagRow } from '../constants/tagMeta';

export interface RecipeBrowserData {
  /** Every recipe, as stored. */
  recipes: Recipe[];
  /** What the browser lists — URL variants of one source collapsed to one. */
  uniqueRecipes: Recipe[];
  tags: Tag[];
  recipeTags: RecipeTagRow[];
  /** Recipe id → the last time it was cooked, for the "not cooked lately" sort. */
  lastCooked: Record<string, string>;
  cookbooks: Cookbook[];
  cookbookRecipes: Record<string, Set<string>>;
  /** Cookbooks you can actually pick from — an empty one is just noise. */
  pickableCookbooks: Cookbook[];
  /** Cookbook id → up to four cover images, newest first. */
  cookbookCovers: Record<string, string[]>;
  loading: boolean;
}

/**
 * Everything the recipe browser lists, fetched once each time the modal holding
 * it opens. Plan mode and the add-a-recipe picker share it so both show the
 * same collection, the same cookbooks and the same cooking history.
 */
export default function useRecipeBrowserData(open: boolean): RecipeBrowserData {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipeTags, setRecipeTags] = useState<RecipeTagRow[]>([]);
  const [lastCooked, setLastCooked] = useState<Record<string, string>>({});
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [cookbookRecipes, setCookbookRecipes] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [
        { data: recipeData },
        { data: cookData },
        { data: cbData },
        { data: cbRecipeData },
        { data: tagData },
        { data: recipeTagData },
      ] = await Promise.all([
        supabase.from('recipes').select('*').order('title'),
        supabase.from('recipe_cooks').select('recipe_id, cooked_at'),
        supabase
          .from('cookbooks')
          .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase.from('cookbook_recipes').select('cookbook_id, recipe_id'),
        supabase.from('tags').select('*').order('name'),
        supabase.from('recipe_tags').select('recipe_id, tag_id'),
      ]);
      if (cancelled) return;
      setRecipes((recipeData as Recipe[]) ?? []);
      const map: Record<string, string> = {};
      for (const row of (cookData as { recipe_id: string; cooked_at: string }[]) ?? []) {
        if (!map[row.recipe_id] || row.cooked_at > map[row.recipe_id]) {
          map[row.recipe_id] = row.cooked_at;
        }
      }
      setLastCooked(map);
      setCookbooks((cbData as Cookbook[]) ?? []);
      const members: Record<string, Set<string>> = {};
      for (const row of (cbRecipeData as { cookbook_id: string; recipe_id: string }[]) ?? []) {
        (members[row.cookbook_id] ??= new Set()).add(row.recipe_id);
      }
      setCookbookRecipes(members);
      setTags((tagData as Tag[]) ?? []);
      setRecipeTags((recipeTagData as RecipeTagRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Importing the same page with a trailing slash or a tracking link creates a
  // handful of distinct rows. They are one recipe as far as picking goes.
  const uniqueRecipes = useMemo(
    () => dedupeRecipesBySource(recipes, user?.id),
    [recipes, user?.id],
  );

  const pickableCookbooks = useMemo(
    () => cookbooks.filter((c) => (cookbookRecipes[c.id]?.size ?? 0) > 0),
    [cookbooks, cookbookRecipes],
  );

  // Four plates per shelf, newest first — the same cover strip the Cookbook
  // page builds, derived from data already loaded here.
  const cookbookCovers = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const out: Record<string, string[]> = {};
    for (const cb of cookbooks) {
      const ids = cookbookRecipes[cb.id];
      out[cb.id] = !ids
        ? []
        : [...ids]
            .map((id) => byId.get(id))
            .filter((r): r is Recipe => !!r?.image_url)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 4)
            .map((r) => r.image_url as string);
    }
    return out;
  }, [recipes, cookbooks, cookbookRecipes]);

  return {
    recipes,
    uniqueRecipes,
    tags,
    recipeTags,
    lastCooked,
    cookbooks,
    cookbookRecipes,
    pickableCookbooks,
    cookbookCovers,
    loading,
  };
}
