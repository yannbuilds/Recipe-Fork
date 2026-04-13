import { useEffect, useState, useRef } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import RecipeFilterBar from './RecipeFilterBar';
import { useAuth } from '../context/AuthContext';
import useRecipeFilters from '../hooks/useRecipeFilters';
import type { RecipeTagRow } from '../constants/tagMeta';

type SortOption = 'newest' | 'oldest' | 'a-z' | 'z-a';

interface AddRecipeModalProps {
  open: boolean;
  existingRecipeIds: Set<string>;
  onAdd: (recipe: Recipe) => void;
  onClose: () => void;
}

export default function AddRecipeModal({ open, existingRecipeIds, onAdd, onClose }: AddRecipeModalProps) {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipeTags, setRecipeTags] = useState<RecipeTagRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('a-z');
  const [filterOpen, setFilterOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const filters = useRecipeFilters({
    recipes: showFavouritesOnly ? recipes.filter((r) => r.is_favourite) : recipes,
    tags,
    recipeTags,
    userId: user?.id,
    searchQuery: search,
  });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, filterOpen]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setShowFavouritesOnly(false);
    setSortBy('a-z');
    setFilterOpen(false);
    filters.resetFilters();
    setLoading(true);
    Promise.all([
      supabase.from('recipes').select('*').order('title'),
      supabase.from('tags').select('*').order('name'),
      supabase.from('recipe_tags').select('recipe_id, tag_id'),
    ]).then(([recipesResult, tagsResult, recipeTagsResult]) => {
      setRecipes((recipesResult.data as Recipe[]) || []);
      if (!tagsResult.error && tagsResult.data) {
        setTags(tagsResult.data as Tag[]);
      }
      if (!recipeTagsResult.error && recipeTagsResult.data) {
        setRecipeTags(recipeTagsResult.data as RecipeTagRow[]);
      }
      setLoading(false);
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const sortedRecipes = [...filters.filteredRecipes].sort((a, b) => {
    switch (sortBy) {
      case 'z-a': return b.title.localeCompare(a.title);
      case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      default: return a.title.localeCompare(b.title);
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="rf-card w-full max-w-[1100px] mx-3 sm:mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <h2 className="rf-heading text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Add Recipe to Meal Plan
            </h2>
            <button
              onClick={onClose}
              className="text-xl leading-none transition-colors"
              style={{ color: 'var(--muted)' }}
            >
              &times;
            </button>
          </div>
          <div className="flex items-center gap-3 relative">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="rf-input w-full"
            />
            <div className="relative shrink-0" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((prev) => !prev)}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors"
                style={
                  filterOpen || showFavouritesOnly || sortBy !== 'a-z'
                    ? { background: 'var(--green-light)', border: '1px solid var(--green)', color: 'var(--green)' }
                    : { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)', boxShadow: 'var(--shadow-sm)' }
                }
                aria-label="Filters"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="8" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                  <circle cx="6" cy="6" r="2" fill="currentColor" />
                  <circle cx="14" cy="12" r="2" fill="currentColor" />
                  <circle cx="8" cy="18" r="2" fill="currentColor" />
                </svg>
              </button>
              {filterOpen && (
                <div className="rf-filter-dropdown">
                  <button
                    onClick={() => setShowFavouritesOnly((prev) => !prev)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors"
                    style={showFavouritesOnly ? { background: 'var(--red-light)', color: 'var(--red)' } : { color: 'var(--text)' }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill={showFavouritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    Favourites only
                  </button>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
                  <p className="px-3 py-1 text-xs font-semibold" style={{ color: 'var(--muted)' }}>Sort by</p>
                  {([
                    ['a-z', 'A – Z'],
                    ['z-a', 'Z – A'],
                    ['newest', 'Newest first'],
                    ['oldest', 'Oldest first'],
                  ] as [SortOption, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setSortBy(value)}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors"
                      style={sortBy === value ? { background: 'var(--green-light)', color: 'var(--green)', fontWeight: 600 } : { color: 'var(--text)' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <RecipeFilterBar {...filters} />
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {loading && (
            <p className="text-center text-sm py-4" style={{ color: 'var(--muted)' }}>Loading...</p>
          )}
          {!loading && sortedRecipes.length === 0 && (
            <p className="text-center text-sm py-4" style={{ color: 'var(--muted)' }}>No recipes found.</p>
          )}
          {sortedRecipes.map((recipe) => {
            const alreadyAdded = existingRecipeIds.has(recipe.id);
            return (
              <button
                key={recipe.id}
                disabled={alreadyAdded}
                onClick={() => onAdd(recipe)}
                className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 transition-colors ${
                  alreadyAdded ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
                style={!alreadyAdded ? {} : undefined}
                onMouseEnter={(e) => {
                  if (!alreadyAdded) (e.currentTarget as HTMLElement).style.background = 'var(--warm)';
                }}
                onMouseLeave={(e) => {
                  if (!alreadyAdded) (e.currentTarget as HTMLElement).style.background = '';
                }}
              >
                {recipe.image_url ? (
                  <img src={recipe.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div
                    className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-lg"
                    style={{
                      background: 'linear-gradient(135deg, var(--warm) 0%, var(--warm-dark) 100%)',
                    }}
                  >
                    🍴
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--text)' }}>{recipe.title}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {[
                      recipe.prep_time != null && `Prep: ${recipe.prep_time}m`,
                      recipe.cook_time != null && `Cook: ${recipe.cook_time}m`,
                      recipe.servings != null && `Serves ${recipe.servings}`,
                    ].filter(Boolean).join(' · ') || 'No details'}
                  </p>
                </div>
                {alreadyAdded && (
                  <span className="ml-auto text-xs shrink-0" style={{ color: 'var(--green)' }}>Added</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
