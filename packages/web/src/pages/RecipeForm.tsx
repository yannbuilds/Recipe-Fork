import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Ingredient, Step, Recipe, Tag } from '@recipe-aggregator/shared';

export default function RecipeForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
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
    // Carry over the category from the last ingredient for convenience
    const lastCategory = ingredients.length > 0 ? ingredients[ingredients.length - 1].category : '';
    setIngredients([...ingredients, { item: '', quantity: '', unit: '', category: lastCategory }]);
  }

  function removeIngredient(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  function updateIngredient(index: number, field: keyof Ingredient, value: string) {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
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
        .insert(recipeData)
        .select('id')
        .single();
      if (saveError || !data) {
        setError(saveError?.message ?? 'Failed to create recipe.');
        setSubmitting(false);
        return;
      }
      recipeId = data.id;
    }

    // Sync tags: delete all existing, then insert selected
    await supabase.from('recipe_tags').delete().eq('recipe_id', recipeId!);

    if (selectedTagIds.size > 0) {
      const tagRows = Array.from(selectedTagIds).map((tag_id) => ({
        recipe_id: recipeId!,
        tag_id,
      }));
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
    return <p className="text-center text-gray-500 py-12">Loading recipe...</p>;
  }

  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          to={isEditing ? `/recipe/${id}` : '/'}
          className="inline-flex items-center text-blue-600 hover:underline text-sm mb-6"
        >
          &larr; {isEditing ? 'Back to recipe' : 'Back to recipes'}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {isEditing ? 'Edit Recipe' : 'New Recipe'}
        </h1>

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className={labelClass}>
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Recipe title"
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              rows={3}
              placeholder="Brief description"
            />
          </div>

          {/* Time & Servings */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Prep time (min)</label>
              <input
                type="number"
                min={0}
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Cook time (min)</label>
              <input
                type="number"
                min={0}
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Servings</label>
              <input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* URLs */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Source URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className={inputClass}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className={labelClass}>Image URL</label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className={inputClass}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className={labelClass}>Video URL</label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className={inputClass}
                placeholder="https://youtube.com/..."
              />
            </div>
          </div>

          {/* Tags */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700">Tags</legend>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedTagIds.has(tag.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
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
                className={inputClass}
                placeholder="New tag name"
              />
              <button
                type="button"
                onClick={handleAddNewTag}
                className="shrink-0 rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
              >
                Add Tag
              </button>
            </div>
          </fieldset>

          {/* Ingredients */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700">Ingredients</legend>
            {ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  type="text"
                  value={ing.category ?? ''}
                  onChange={(e) => updateIngredient(i, 'category', e.target.value)}
                  className="w-28 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Category"
                />
                <input
                  type="text"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                  className="w-16 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Qty"
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                  className="w-20 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Unit"
                />
                <input
                  type="text"
                  value={ing.item}
                  onChange={(e) => updateIngredient(i, 'item', e.target.value)}
                  className="flex-1 min-w-0 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Ingredient"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(i)}
                  className="text-red-500 hover:text-red-700 text-sm px-2 py-2"
                  aria-label="Remove ingredient"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addIngredient}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add ingredient
            </button>
          </fieldset>

          {/* Steps */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-700">Steps</legend>
            {steps.map((step, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-sm text-gray-500 pt-2 w-6 text-right">{step.order}.</span>
                <input
                  type="text"
                  value={step.category ?? ''}
                  onChange={(e) => updateStep(i, 'category', e.target.value)}
                  className="w-28 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Category"
                />
                <textarea
                  value={step.instruction}
                  onChange={(e) => updateStep(i, 'instruction', e.target.value)}
                  className={inputClass + ' flex-1'}
                  rows={2}
                  placeholder={`Step ${step.order}`}
                />
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="text-red-500 hover:text-red-700 text-sm px-2 py-2"
                  aria-label="Remove step"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addStep}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add step
            </button>
          </fieldset>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : isEditing ? 'Update Recipe' : 'Save Recipe'}
          </button>
        </form>
      </div>
    </div>
  );
}
