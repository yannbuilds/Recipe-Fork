import { useMemo, useState } from 'react';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import {
  TAG_EMOJI,
  TAG_CATEGORY,
  CATEGORY_TABS,
  type RecipeTagRow,
  type TagCategory,
  type OwnerFilter,
} from '../constants/tagMeta';

interface UseRecipeFiltersOptions {
  recipes: Recipe[];
  tags: Tag[];
  recipeTags: RecipeTagRow[];
  userId?: string;
  searchQuery: string;
}

export default function useRecipeFilters({
  recipes,
  tags,
  recipeTags,
  userId,
  searchQuery,
}: UseRecipeFiltersOptions) {
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [categoryTab, setCategoryTab] = useState<TagCategory | null>(null);

  const tagNameToId = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));

  const allCategories = useMemo(() => {
    const countByTagId = new Map<string, number>();
    for (const rt of recipeTags) {
      countByTagId.set(rt.tag_id, (countByTagId.get(rt.tag_id) ?? 0) + 1);
    }

    return tags
      .filter((t) => (countByTagId.get(t.id) ?? 0) > 0)
      .sort((a, b) => (countByTagId.get(b.id) ?? 0) - (countByTagId.get(a.id) ?? 0))
      .map((t) => ({
        tag: t.name.toLowerCase(),
        label: t.name.charAt(0).toUpperCase() + t.name.slice(1),
        emoji: t.emoji || TAG_EMOJI[t.name.toLowerCase()] || '🏷️',
      }));
  }, [tags, recipeTags]);

  const visibleCategories = useMemo(() => {
    if (!categoryTab) return [];
    return allCategories.filter((c) => TAG_CATEGORY[c.tag] === categoryTab);
  }, [allCategories, categoryTab]);

  const visibleTabs = useMemo(() => {
    return CATEGORY_TABS.filter((tab) => {
      return allCategories.some((c) => TAG_CATEGORY[c.tag] === tab.value);
    });
  }, [allCategories]);

  function toggleCategory(tagName: string) {
    const tagCategory = TAG_CATEGORY[tagName];
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        if (tagCategory) {
          for (const existing of prev) {
            if (TAG_CATEGORY[existing] === tagCategory) next.delete(existing);
          }
        }
        next.add(tagName);
      }
      return next;
    });
  }

  function tabHasSelection(tabValue: TagCategory): boolean {
    return [...activeCategories].some((tag) => TAG_CATEGORY[tag] === tabValue);
  }

  function resetFilters() {
    setActiveCategories(new Set());
    setCategoryTab(null);
    setOwnerFilter('all');
  }

  const activeTagIds = new Set(
    [...activeCategories].map((name) => tagNameToId.get(name)).filter(Boolean) as string[]
  );

  const filteredRecipes = recipes.filter((r) => {
    if (ownerFilter === 'mine' && r.user_id !== userId) return false;
    if (ownerFilter === 'shared' && r.user_id === userId) return false;

    if (activeTagIds.size > 0) {
      const recipeTagIds = recipeTags.filter((rt) => rt.recipe_id === r.id).map((rt) => rt.tag_id);
      const hasAllTags = [...activeTagIds].every((tagId) => recipeTagIds.includes(tagId));
      if (!hasAllTags) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const titleMatch = r.title.toLowerCase().includes(q);
      const ingredientMatch = r.ingredients.some((ing) => ing.item.toLowerCase().includes(q));
      if (!titleMatch && !ingredientMatch) return false;
    }

    return true;
  });

  const hasActiveFilter = activeCategories.size > 0 || ownerFilter !== 'all';

  return {
    filteredRecipes,
    activeCategories,
    ownerFilter,
    setOwnerFilter,
    categoryTab,
    setCategoryTab,
    visibleCategories,
    visibleTabs,
    toggleCategory,
    tabHasSelection,
    resetFilters,
    hasActiveFilter,
  };
}
