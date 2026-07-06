import { Utensils, Globe, Beef, Leaf, CookingPot, type LucideIcon } from 'lucide-react';
import type { TagCategory } from '../constants/tagMeta';

// Line icons for the top-level category tabs (replacing emojis).
const TAB_ICON: Record<TagCategory, LucideIcon> = {
  meal: Utensils,
  cuisine: Globe,
  protein: Beef,
  dietary: Leaf,
  style: CookingPot,
};

interface CategoryItem {
  tag: string;
  label: string;
  emoji: string;
}

interface RecipeFilterBarProps {
  activeCategories: Set<string>;
  categoryTab: TagCategory | null;
  setCategoryTab: (value: TagCategory | null) => void;
  visibleCategories: CategoryItem[];
  visibleTabs: { value: TagCategory; label: string; emoji: string }[];
  toggleCategory: (tagName: string) => void;
  tabHasSelection: (tabValue: TagCategory) => boolean;
  animated?: boolean;
}

// Owner filter (All recipes / Mine / Shared) now lives in the filter dropdown
// on the home page — this bar only handles the category facets.
export default function RecipeFilterBar({
  activeCategories,
  categoryTab,
  setCategoryTab,
  visibleCategories,
  visibleTabs,
  toggleCategory,
  tabHasSelection,
  animated = false,
}: RecipeFilterBarProps) {
  return (
    <>
      {/* Category tab pills */}
      <div
        className="rf-category-tabs mb-3"
        style={animated ? { animation: 'fadeUp 0.4s ease 0.14s both' } : undefined}
      >
        <div className="rf-category-tabs-scroll">
          {visibleTabs.map((tab) => {
            const Icon = TAB_ICON[tab.value];
            return (
              <button
                key={tab.value}
                onClick={() => setCategoryTab(categoryTab === tab.value ? null : tab.value)}
                className={`rf-category-tab ${categoryTab === tab.value ? 'rf-category-tab-active' : ''} ${tabHasSelection(tab.value) ? 'rf-category-tab-has-selection' : ''}`}
              >
                {Icon && <Icon size={13} strokeWidth={1.6} />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category chips – only when a tab is selected (text-only, editorial) */}
      {categoryTab && visibleCategories.length > 0 && (
        <div
          className="rf-category-section mb-6"
          style={{ animation: 'fadeUp 0.15s ease both' }}
        >
          <div className="rf-category-tabs-scroll">
            {visibleCategories.map((cat) => (
              <button
                key={cat.tag}
                onClick={() => toggleCategory(cat.tag)}
                className={`rf-category-tab ${activeCategories.has(cat.tag) ? 'rf-category-tab-active' : ''}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!categoryTab && <div className="mb-4" />}
    </>
  );
}
