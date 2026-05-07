import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook, Recipe } from '@recipe-aggregator/shared';
import RecipeCard from '../components/RecipeCard';
import RecipeCardSkeleton from '../components/RecipeCardSkeleton';
import CookbookFormModal from '../components/CookbookFormModal';
import ConfirmModal from '../components/ConfirmModal';
import AddRecipeModal from '../components/AddRecipeModal';
import { useAuth } from '../context/AuthContext';

const RECIPE_SELECT =
  'id, user_id, title, image_url, prep_time, cook_time, servings, is_favourite, created_at, ingredients';

export default function CookbookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, familyMembers, loading: authLoading } = useAuth();

  const [cookbook, setCookbook] = useState<Cookbook | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (authLoading || !id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const cbResult = await supabase
        .from('cookbooks')
        .select('id, user_id, name, description, emoji, created_at, updated_at')
        .eq('id', id!)
        .maybeSingle();
      if (cancelled) return;
      if (cbResult.error || !cbResult.data) {
        setError(cbResult.error?.message ?? 'Cookbook not found');
        setLoading(false);
        return;
      }
      setCookbook(cbResult.data as Cookbook);

      const crResult = await supabase
        .from('cookbook_recipes')
        .select(`recipe_id, recipes(${RECIPE_SELECT})`)
        .eq('cookbook_id', id!);

      if (cancelled) return;

      if (crResult.error) {
        setError(crResult.error.message);
      } else {
        const rows = ((crResult.data ?? []) as unknown) as { recipes: Recipe | Recipe[] | null }[];
        const list = rows
          .map((r) => (Array.isArray(r.recipes) ? r.recipes[0] : r.recipes))
          .filter((r): r is Recipe => !!r)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecipes(list);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, authLoading]);

  function handleToggleFavourite(recipeId: string, newValue: boolean) {
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipeId ? { ...r, is_favourite: newValue } : r))
    );
  }

  async function handleDelete() {
    if (!cookbook) return;
    await supabase.from('cookbooks').delete().eq('id', cookbook.id);
    navigate('/');
  }

  async function handleAddRecipe(recipe: Recipe) {
    if (!cookbook) return;
    setRecipes((prev) => (prev.some((r) => r.id === recipe.id) ? prev : [recipe, ...prev]));
    await supabase
      .from('cookbook_recipes')
      .insert({ cookbook_id: cookbook.id, recipe_id: recipe.id });
  }

  const familyOwnerNames = new Map<string, string>();
  for (const m of familyMembers) {
    if (m.user_id !== user?.id && m.profile?.display_name) {
      familyOwnerNames.set(m.user_id, m.profile.display_name);
    }
  }

  if (error) {
    return (
      <p className="text-center text-sm py-12" style={{ color: 'var(--red)' }}>
        {error}
      </p>
    );
  }

  return (
    <>
      {/* Header */}
      <div style={{ animation: 'fadeUp 0.4s ease both' }} className="mb-5 flex items-start gap-4">
        <span style={{ fontSize: 48, lineHeight: 1 }}>{cookbook?.emoji ?? '📖'}</span>
        <div className="flex-1 min-w-0">
          <h1
            className="rf-heading font-bold"
            style={{ color: 'var(--text)', fontSize: 26 }}
          >
            {cookbook?.name ?? 'Cookbook'}
          </h1>
          {cookbook?.description && (
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {cookbook.description}
            </p>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
          </p>
        </div>
        {cookbook && (
          <button
            onClick={() => setShowAdd(true)}
            className="rf-btn rf-btn-filled shrink-0"
            style={{ padding: '8px 14px' }}
          >
            + Add recipe
          </button>
        )}
        {cookbook && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}
              aria-label="More"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="rf-filter-dropdown" style={{ width: 160 }}>
                <button
                  onClick={() => {
                    setShowEdit(true);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm"
                  style={{ color: 'var(--text)' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setShowDelete(true);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm"
                  style={{ color: 'var(--red)' }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <RecipeCardSkeleton key={i} index={i} />
          ))}
        </div>
      )}

      {!loading && recipes.length === 0 && (
        <div className="text-center py-16" style={{ animation: 'fadeUp 0.4s ease 0.1s both' }}>
          <span className="block text-5xl">📭</span>
          <p className="rf-heading text-lg font-bold mt-4" style={{ color: 'var(--text)' }}>
            No recipes in this cookbook yet
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Pick from your existing recipes to fill it up.
          </p>
          <button onClick={() => setShowAdd(true)} className="rf-btn rf-btn-filled mt-6">
            + Add recipe
          </button>
        </div>
      )}

      {!loading && recipes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {recipes.map((recipe, index) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onToggleFavourite={handleToggleFavourite}
              index={index}
              ownerName={familyOwnerNames.get(recipe.user_id)}
            />
          ))}
        </div>
      )}

      <CookbookFormModal
        open={showEdit}
        cookbook={cookbook}
        onClose={() => setShowEdit(false)}
        onSaved={(cb) => setCookbook(cb)}
      />

      <AddRecipeModal
        open={showAdd}
        existingRecipeIds={new Set(recipes.map((r) => r.id))}
        onAdd={(recipe) => {
          handleAddRecipe(recipe);
        }}
        onClose={() => setShowAdd(false)}
        title={cookbook ? `Add recipe to ${cookbook.name}` : 'Add recipe'}
      />

      <ConfirmModal
        open={showDelete}
        title="Delete cookbook?"
        message="This removes the cookbook but does not delete the recipes inside it."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </>
  );
}
