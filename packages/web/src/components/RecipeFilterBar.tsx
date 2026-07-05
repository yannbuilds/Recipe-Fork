import { Utensils, Globe, Beef, Leaf, CookingPot, type LucideIcon } from 'lucide-react';
import type { TagCategory, OwnerFilter } from '../constants/tagMeta';

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
  ownerFilter: OwnerFilter;
  setOwnerFilter: (value: OwnerFilter) => void;
  categoryTab: TagCategory | null;
  setCategoryTab: (value: TagCategory | null) => void;
  visibleCategories: CategoryItem[];
  visibleTabs: { value: TagCategory; label: string; emoji: string }[];
  toggleCategory: (tagName: string) => void;
  tabHasSelection: (tabValue: TagCategory) => boolean;
  hasActiveFilter: boolean;
  resetFilters: () => void;
  animated?: boolean;
  onReset?: () => void;
  showReset?: boolean;
}

export default function RecipeFilterBar({
  activeCategories,
  ownerFilter,
  setOwnerFilter,
  categoryTab,
  setCategoryTab,
  visibleCategories,
  visibleTabs,
  toggleCategory,
  tabHasSelection,
  hasActiveFilter,
  resetFilters,
  animated = false,
  onReset,
  showReset,
}: RecipeFilterBarProps) {
  const shouldShowReset = showReset !== undefined ? showReset : hasActiveFilter;

  function handleReset() {
    resetFilters();
    onReset?.();
  }

  return (
    <>
      {/* Owner filter pills + Reset */}
      <div
        className="flex items-center gap-1.5 mb-4"
        style={animated ? { animation: 'fadeUp 0.4s ease 0.12s both' } : undefined}
      >
        {([
          ['all', 'All recipes'],
          ['mine', 'Mine'],
          ['shared', 'Shared'],
        ] as [OwnerFilter, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setOwnerFilter(value)}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={
              ownerFilter === value
                ? { background: 'var(--green-light)', color: 'var(--green)', border: '1px solid var(--green)' }
                : { background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }
            }
          >
            {label}
          </button>
        ))}
        {shouldShowReset && (
          <button
            onClick={handleReset}
            className="rf-reset-btn"
          >
            Reset
          </button>
        )}
      </div>

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
