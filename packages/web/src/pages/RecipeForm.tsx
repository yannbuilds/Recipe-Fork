import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Ingredient, Step, Recipe, Tag } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';

export default function RecipeForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { item: '', quantity: '', unit: '', category: '' },
  ]);
  const [steps, setSteps] = useState<Step[]>([
    { order: 1, instruction: '', category: '' },
  ]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [newTagName, setNewTagName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      const tagsResult = await supabase.from('tags').select('*').order('name');
      if (!tagsResult.error && tagsResult.data) {
        setAllTags(tagsResult.data as Tag[]);
      }

      if (!id) return;

      const [recipeResult, recipeTagsResult] = await Promise.all([
        supabase.from('recipes').select('*').eq('id', id).single(),
        supabase.from('recipe_tags').select('tag_id').eq('recipe_id', id),
      ]);

      if (recipeResult.error) {
        setError(recipeResult.error.message);
      } else {
        const recipe = recipeResult.data as Recipe;
        setTitle(recipe.title);
        setDescription(recipe.description ?? '');
        setServings(recipe.servings != null ? String(recipe.servings) : '');
        setPrepTime(recipe.prep_time != null ? String(recipe.prep_time) : '');
        setCookTime(recipe.cook_time != null ? String(recipe.cook_time) : '');
        setSourceUrl(recipe.source_url ?? '');
        setImageUrl(recipe.image_url ?? '');
        setVideoUrl(recipe.video_url ?? '');
        setCreatorName(recipe.creator_name ?? '');
        setIngredients(
          recipe.ingredients.length > 0
            ? recipe.ingredients.map((ing) => ({ ...ing, category: ing.category ?? '' }))
            : [{ item: '', quantity: '', unit: '', category: '' }],
        );
        setSteps(
          recipe.steps.length > 0
            ? [...recipe.steps].sort((a, b) => a.order - b.order).map((s) => ({ ...s, category: s.category ?? '' }))
            : [{ order: 1, instruction: '', category: '' }],
        );
      }

      if (!recipeTagsResult.error && recipeTagsResult.data) {
        setSelectedTagIds(new Set(recipeTagsResult.data.map((rt: any) => rt.tag_id)));
      }

      setLoading(false);
    }

    fetchData();
  }, [id]);

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }

  async function handleAddNewTag() {
    const name = newTagName.trim().toLowerCase();
    if (!name) return;

    const existing = allTags.find((t) => t.name.toLowerCase() === name);
    if (existing) {
      setSelectedTagIds((prev) => new Set(prev).add(existing.id));
      setNewTagName('');
      return;
    }

    const { data, error } = await supabase
      .from('tags')
      .insert({ name })
      .select()
      .single();

    if (error) {
      setError(error.message);
    } else if (data) {
      const tag = data as Tag;
      setAllTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTagIds((prev) => new Set(prev).add(tag.id));
    }
    setNewTagName('');
  }

  function addIngredient() {
    const lastCategory = ingredients.length > 0 ? ingredients[ingredients.length - 1].category : '';
    setIngredients([...ingredients, { item: '', quantity: '', unit: '', category: lastCategory }]);
  }

  function removeIngredient(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  function updateIngredient(index: number, field: keyof Ingredient, value: string) {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    // Clear original_text when structured fields change so it regenerates on save
    if (field !== 'original_text' && field !== 'category') {
      updated[index].original_text = undefined;
    }
    setIngredients(updated);
  }

  function addStep() {
    const lastCategory = steps.length > 0 ? steps[steps.length - 1].category : '';
    setSteps([...steps, { order: steps.length + 1, instruction: '', category: lastCategory }]);
  }

  function removeStep(index: number) {
    const updated = steps.filter((_, i) => i !== index);
    setSteps(updated.map((s, i) => ({ ...s, order: i + 1, category: s.category })));
  }

  function updateStep(index: number, field: 'instruction' | 'category', value: string) {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSubmitting(true);

    const filteredIngredients = ingredients
      .filter((ing) => ing.item.trim())
      .map((ing) => {
        const clean: Ingredient = { item: ing.item, quantity: ing.quantity, unit: ing.unit };
        if (ing.category?.trim()) clean.category = ing.category.trim();
        // Preserve existing original_text or auto-generate from structured fields
        const parts = [ing.quantity, ing.unit, ing.item].filter(Boolean);
        clean.original_text = ing.original_text?.trim() || parts.join(' ');
        return clean;
      });
    const filteredSteps = steps
      .filter((s) => s.instruction.trim())
      .map((s, i) => {
        const clean: Step = { order: i + 1, instruction: s.instruction };
        if (s.category?.trim()) clean.category = s.category.trim();
        return clean;
      });

    const recipeData = {
      title: title.trim(),
      description: description.trim() || null,
      servings: servings ? Number(servings) : null,
      prep_time: prepTime ? Number(prepTime) : null,
      cook_time: cookTime ? Number(cookTime) : null,
      source_url: sourceUrl.trim() || '',
      creator_name: creatorName.trim() || null,
      video_url: videoUrl.trim() || null,
      image_url: imageUrl.trim() || null,
      ingredients: filteredIngredients,
      steps: filteredSteps,
    };

    let recipeId = id;

    if (isEditing) {
      const { error: saveError } = await supabase
        .from('recipes')
        .update(recipeData)
        .eq('id', id!);
      if (saveError) {
        setError(saveError.message);
        setSubmitting(false);
        return;
      }
    } else {
      const { data, error: saveError } = await supabase
        .from('recipes')
        .insert({ ...recipeData, user_id: user!.id })
        .select('id')
        .single();
      if (saveError || !data) {
        setError(saveError?.message ?? 'Failed to create recipe.');
        setSubmitting(false);
        return;
      }
      recipeId = data.id;
    }

    // Sync tags: diff-based — only delete removed, only insert added
    const { data: currentTagRows } = await supabase
      .from('recipe_tags')
      .select('tag_id')
      .eq('recipe_id', recipeId!);

    const currentTagIds = new Set((currentTagRows ?? []).map((rt: any) => rt.tag_id));
    const toRemove = [...currentTagIds].filter((id) => !selectedTagIds.has(id));
    const toAdd = [...selectedTagIds].filter((id) => !currentTagIds.has(id));

    if (toRemove.length > 0) {
      await supabase
        .from('recipe_tags')
        .delete()
        .eq('recipe_id', recipeId!)
        .in('tag_id', toRemove);
    }

    if (toAdd.length > 0) {
      const tagRows = toAdd.map((tag_id) => ({ recipe_id: recipeId!, tag_id }));
      const { error: tagError } = await supabase.from('recipe_tags').insert(tagRows);
      if (tagError) {
        setError(tagError.message);
        setSubmitting(false);
        return;
      }
    }

    navigate(isEditing ? `/recipe/${id}` : '/');
  }

  if (loading) {
    return (
      <p className="text-center text-sm py-12" style={{ color: 'var(--muted)' }}>
        Loading recipe...
      </p>
    );
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '28px 24px 64px' }}>
      <Link
        to={isEditing ? `/recipe/${id}` : '/'}
        className="inline-flex items-center text-sm mb-6 hover:underline"
        style={{ color: 'var(--green)' }}
      >
        &larr; {isEditing ? 'Back to recipe' : 'Back to recipes'}
      </Link>

      <h1 className="rf-heading text-2xl font-bold mb-6" style={{ color: 'var(--text)' }}>
        {isEditing ? 'Edit Recipe' : 'New Recipe'}
      </h1>

      {error && (
        <p className="text-sm mb-4" style={{ color: 'var(--red)' }}>{error}</p>
      )}

      <div className="rf-card" style={{ padding: 24 }}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Title <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rf-input w-full"
              placeholder="Recipe title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rf-input w-full"
              rows={3}
              placeholder="Brief description"
            />
          </div>

          {/* Time & Servings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Prep time (min)</label>
              <input
                type="number"
                min={0}
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                className="rf-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Cook time (min)</label>
              <input
                type="number"
                min={0}
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                className="rf-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Servings</label>
              <input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="rf-input w-full"
              />
            </div>
          </div>

          {/* Original creator */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Original creator</label>
            <input
              type="text"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              className="rf-input w-full"
              placeholder="e.g. Nagi | RecipeTin Eats"
            />
          </div>

          {/* URLs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Source URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="rf-input w-full"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Image URL</label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="rf-input w-full"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Video URL</label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="rf-input w-full"
                placeholder="https://youtube.com/..."
              />
            </div>
          </div>

          {/* Tags */}
          <fieldset className="space-y-3">
            <legend className="rf-heading text-sm font-semibold" style={{ color: 'var(--muted)' }}>Tags</legend>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`rf-tag cursor-pointer ${selectedTagIds.has(tag.id) ? 'rf-tag-active' : ''}`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNewTag();
                  }
                }}
                className="rf-input w-full"
                placeholder="New tag name"
              />
              <button
                type="button"
                onClick={handleAddNewTag}
                className="rf-btn rf-btn-secondary shrink-0"
              >
                Add Tag
              </button>
            </div>
          </fieldset>

          {/* Ingredients */}
          <fieldset className="space-y-3">
            <legend className="rf-heading text-sm font-semibold" style={{ color: 'var(--muted)' }}>Ingredients</legend>
            {ingredients.map((ing, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-start">
                <input
                  type="text"
                  value={ing.category ?? ''}
                  onChange={(e) => updateIngredient(i, 'category', e.target.value)}
                  className="rf-input w-full sm:w-28 shrink-0"
                  placeholder="Category"
                />
                <input
                  type="text"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                  className="rf-input w-16 shrink-0"
                  placeholder="Qty"
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                  className="rf-input w-20 shrink-0"
                  placeholder="Unit"
                />
                <input
                  type="text"
                  value={ing.item}
                  onChange={(e) => updateIngredient(i, 'item', e.target.value)}
                  className="rf-input flex-1 min-w-0"
                  placeholder="Ingredient"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(i)}
                  className="text-sm px-2 py-2 transition-colors"
                  style={{ color: 'var(--red)' }}
                  aria-label="Remove ingredient"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addIngredient}
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--green)' }}
            >
              + Add ingredient
            </button>
          </fieldset>

          {/* Steps */}
          <fieldset className="space-y-3">
            <legend className="rf-heading text-sm font-semibold" style={{ color: 'var(--muted)' }}>Steps</legend>
            {steps.map((step, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-start">
                <span className="text-sm pt-2 w-6 text-right" style={{ color: 'var(--muted)' }}>{step.order}.</span>
                <input
                  type="text"
                  value={step.category ?? ''}
                  onChange={(e) => updateStep(i, 'category', e.target.value)}
                  className="rf-input w-full sm:w-28 shrink-0"
                  placeholder="Category"
                />
                <textarea
                  value={step.instruction}
                  onChange={(e) => updateStep(i, 'instruction', e.target.value)}
                  className="rf-input flex-1 min-w-0"
                  rows={2}
                  placeholder={`Step ${step.order}`}
                />
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="text-sm px-2 py-2 transition-colors"
                  style={{ color: 'var(--red)' }}
                  aria-label="Remove step"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addStep}
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--green)' }}
            >
              + Add step
            </button>
          </fieldset>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="rf-btn rf-btn-filled w-full"
          >
            {submitting ? 'Saving...' : isEditing ? 'Update Recipe' : 'Save Recipe'}
          </button>
        </form>
      </div>
    </div>
  );
}
