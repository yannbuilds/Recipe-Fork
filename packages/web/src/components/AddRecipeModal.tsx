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
        className="bg-white rounded-lg shadow-lg w-full max-w-lg mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Add Recipe to Meal Plan</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {loading && <p className="text-center text-gray-500 py-4">Loading...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-500 py-4">No recipes found.</p>
          )}
          {filtered.map((recipe) => {
            const alreadyAdded = existingRecipeIds.has(recipe.id);
            return (
              <button
                key={recipe.id}
                disabled={alreadyAdded}
                onClick={() => onAdd(recipe)}
                className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 transition-colors ${
                  alreadyAdded
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-blue-50 cursor-pointer'
                }`}
              >
                {recipe.image_url ? (
                  <img src={recipe.image_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded bg-gray-100 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{recipe.title}</p>
                  <p className="text-xs text-gray-500">
                    {[
                      recipe.prep_time != null && `Prep: ${recipe.prep_time}m`,
                      recipe.cook_time != null && `Cook: ${recipe.cook_time}m`,
                      recipe.servings != null && `Serves ${recipe.servings}`,
                    ].filter(Boolean).join(' · ') || 'No details'}
                  </p>
                </div>
                {alreadyAdded && (
                  <span className="ml-auto text-xs text-green-600 shrink-0">Added</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
