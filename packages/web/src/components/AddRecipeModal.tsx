import { useEffect, useState, useRef } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe } from '@recipe-aggregator/shared';

interface AddRecipeModalProps {
  open: boolean;
  existingRecipeIds: Set<string>;
  onAdd: (recipe: Recipe) => void;
  onClose: () => void;
}

export default function AddRecipeModal({ open, existingRecipeIds, onAdd, onClose }: AddRecipeModalProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setLoading(true);
    supabase
      .from('recipes')
      .select('*')
      .order('title')
      .then(({ data }) => {
        setRecipes((data as Recipe[]) || []);
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

  const q = search.toLowerCase();
  const filtered = recipes.filter(
    (r) => r.title.toLowerCase().includes(q) || r.ingredients.some((ing) => ing.item.toLowerCase().includes(q))
  );

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
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="rf-input w-full"
          />
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {loading && (
            <p className="text-center text-sm py-4" style={{ color: 'var(--muted)' }}>Loading...</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-sm py-4" style={{ color: 'var(--muted)' }}>No recipes found.</p>
          )}
          {filtered.map((recipe) => {
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
