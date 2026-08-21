import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { subRecipeIdsIn, supabase } from '@recipe-aggregator/shared';
import type { Ingredient, Step, Recipe, Tag } from '@recipe-aggregator/shared';
import AddRecipeModal from '../components/AddRecipeModal';
import PhotoField from '../components/PhotoField';
import { useAuth } from '../context/AuthContext';
import ManualRecipeWizard from '../components/ManualRecipeWizard';
import { SortableRow, SortableRows, moveItem, rowIds } from '../components/SortableRows';

export default function RecipeForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  // Creating and editing are the same experience now: the wizard. The
  // field-by-field form stays reachable at ?mode=fields for the things it
  // alone can do — ingredient categories and linked sub-recipes.
  if (searchParams.get('mode') !== 'fields') return <ManualRecipeWizard key={id ?? 'new'} recipeId={id} />;
  return <StructuredRecipeForm />;
}

function StructuredRecipeForm() {
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [authorNotes, setAuthorNotes] = useState('');
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
  // Which ingredient row is picking a recipe to link, and the titles of the
  // ones already linked (ingredients only store the id).
  const [linkTarget, setLinkTarget] = useState<number | null>(null);
  const [linkedTitles, setLinkedTitles] = useState<Record<string, string>>({});

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
        setAuthorNotes(recipe.author_notes ?? '');
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

  // Resolve the titles of linked recipes so the chips can name them. A link that
  // doesn't come back — deleted recipe, or one belonging to someone outside the
  // family group — just stays unnamed rather than breaking the form.
  const linkedIdKey = subRecipeIdsIn(ingredients).sort().join(',');
  useEffect(() => {
    const missing = subRecipeIdsIn(ingredients).filter((rid) => !linkedTitles[rid]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('recipes').select('id, title').in('id', missing);
      if (cancelled || !data) return;
      setLinkedTitles((prev) => {
        const next = { ...prev };
        for (const row of data as { id: string; title: string }[]) next[row.id] = row.title;
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedIdKey]);

  function removeTag(tagId: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      next.delete(tagId);
      return next;
    });
  }

  async function handleAddTag(tagToAdd?: Tag) {
    if (tagToAdd) {
      setSelectedTagIds((prev) => new Set(prev).add(tagToAdd.id));
      setNewTagName('');
      return;
    }

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

  const selectedTags = allTags.filter((tag) => selectedTagIds.has(tag.id));
  const normalisedTagQuery = newTagName.trim().toLowerCase();
  const matchingTags = normalisedTagQuery
    ? allTags
        .filter(
          (tag) =>
            !selectedTagIds.has(tag.id) &&
            tag.name.toLowerCase().includes(normalisedTagQuery),
        )
        .slice(0, 6)
    : [];
  const exactTagMatch = allTags.find(
    (tag) => tag.name.toLowerCase() === normalisedTagQuery,
  );

  function addIngredient() {
    const lastCategory = ingredients.length > 0 ? ingredients[ingredients.length - 1].category : '';
    setIngredients([...ingredients, { item: '', quantity: '', unit: '', category: lastCategory }]);
  }

  function removeIngredient(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  function updateIngredient(
    index: number,
    field: 'item' | 'quantity' | 'unit' | 'category' | 'original_text',
    value: string,
  ) {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    // Clear original_text when structured fields change so it regenerates on save
    if (field !== 'original_text' && field !== 'category') {
      updated[index].original_text = undefined;
    }
    setIngredients(updated);
  }

  // Drag-to-reorder. Categories are an editable field of their own here, so a
  // dropped row keeps whatever category it had — the recipe page renders the
  // list in exactly this order either way.
  function reorderIngredient(from: number, to: number) {
    setIngredients((prev) => moveItem(prev, from, to));
  }

  // Point an ingredient at another recipe, or clear the link. Kept separate from
  // updateIngredient on purpose: linking doesn't change what the line says, so
  // original_text must survive it.
  function linkIngredient(index: number, recipeId: string | null) {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], recipe_id: recipeId };
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

  // Renumbered on the way out, the same as removeStep — the step number is on
  // screen here, so it has to agree with the order straight away.
  function reorderStep(from: number, to: number) {
    setSteps((prev) => moveItem(prev, from, to).map((s, i) => ({ ...s, order: i + 1 })));
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

    let savedImageUrl = imageUrl.trim() || null;
    if (imageFile && user) {
      const extension = imageFile.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('recipe-images').upload(path, imageFile, {
        contentType: imageFile.type || 'image/jpeg', upsert: false,
      });
      if (uploadError) {
        setError(`Could not upload the photo: ${uploadError.message}`);
        setSubmitting(false);
        return;
      }
      savedImageUrl = supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl;
    }

    const filteredIngredients = ingredients
      .filter((ing) => ing.item.trim())
      .map((ing) => {
        const clean: Ingredient = { item: ing.item, quantity: ing.quantity, unit: ing.unit };
        if (ing.category?.trim()) clean.category = ing.category.trim();
        // A linked sub-recipe. This row is rebuilt field by field, so the link
        // has to be carried explicitly or saving silently drops it.
        if (ing.recipe_id) clean.recipe_id = ing.recipe_id;
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
      image_url: savedImageUrl,
      ingredients: filteredIngredients,
      steps: filteredSteps,
      author_notes: authorNotes.trim() || null,
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
      <div className="mb-6">
        <div className="rf-eyebrow" style={{ marginBottom: 8 }}>
          {isEditing ? 'Editing' : 'The kitchen'}
        </div>
        <h1 className="rf-heading text-2xl" style={{ color: 'var(--text)' }}>
          {isEditing ? 'Edit Recipe' : 'New Recipe'}
        </h1>
      </div>

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

          {/* Author's Notes */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Author's Notes</label>
            <textarea
              value={authorNotes}
              onChange={(e) => setAuthorNotes(e.target.value)}
              className="rf-input w-full"
              rows={4}
              placeholder="Original author's tips, substitutions, or notes"
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

          {/* Photo */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>Photo</label>
            <PhotoField
              file={imageFile}
              url={imageUrl}
              height={220}
              onError={setError}
              onPick={(file) => { setError(null); setImageFile(file); setImageUrl(''); }}
              onRemove={() => { setImageFile(null); setImageUrl(''); }}
            />
          </div>

          {/* URLs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Selected tags">
                {selectedTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => removeTag(tag.id)}
                    className="rf-tag rf-tag-active cursor-pointer"
                    aria-label={`Remove ${tag.name} tag`}
                  >
                    {tag.name} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
            <div className="rf-tag-search">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="rf-input w-full"
                  placeholder="Search or create a tag"
                  role="combobox"
                  aria-expanded={matchingTags.length > 0}
                  aria-controls="recipe-tag-suggestions"
                />
                <button
                  type="button"
                  onClick={() => handleAddTag()}
                  disabled={!normalisedTagQuery || selectedTagIds.has(exactTagMatch?.id ?? '')}
                  className="rf-btn rf-btn-secondary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exactTagMatch ? 'Add' : 'Create'}
                </button>
              </div>
              {matchingTags.length > 0 && (
                <div id="recipe-tag-suggestions" className="rf-tag-suggestions" role="listbox">
                  {matchingTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => handleAddTag(tag)}
                    >
                      <span>{tag.name}</span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>Add</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </fieldset>

          {/* Ingredients */}
          <fieldset className="space-y-3">
            <legend className="rf-heading text-sm font-semibold" style={{ color: 'var(--muted)' }}>Ingredients</legend>
            <SortableRows
              ids={rowIds('ingredient', ingredients.length)}
              onReorder={reorderIngredient}
              gap={12}
            >
            {ingredients.map((ing, i) => {
              const linkedTitle = ing.recipe_id ? linkedTitles[ing.recipe_id] : undefined;
              return (
                <SortableRow key={i} id={`ingredient-${i}`} handleOnly gripAlign="top">
                  <div className="rf-ingredient-edit-row">
                    <input
                      type="text"
                      value={ing.item}
                      onChange={(e) => updateIngredient(i, 'item', e.target.value)}
                      className="rf-input rf-ingredient-item"
                      placeholder="Ingredient"
                      aria-label={`Ingredient ${i + 1} name`}
                    />
                    <input
                      type="text"
                      value={ing.category ?? ''}
                      onChange={(e) => updateIngredient(i, 'category', e.target.value)}
                      className="rf-input rf-ingredient-category"
                      placeholder="Category"
                      aria-label={`Ingredient ${i + 1} category`}
                    />
                    <input
                      type="text"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                      className="rf-input rf-ingredient-quantity"
                      placeholder="Qty"
                      aria-label={`Ingredient ${i + 1} quantity`}
                    />
                    <input
                      type="text"
                      value={ing.unit}
                      onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                      className="rf-input rf-ingredient-unit"
                      placeholder="Unit"
                      aria-label={`Ingredient ${i + 1} unit`}
                    />
                    <button
                      type="button"
                      onClick={() => setLinkTarget(i)}
                      className="rf-ingredient-link transition-colors"
                      style={{ color: ing.recipe_id ? 'var(--green)' : 'var(--muted)' }}
                      title={ing.recipe_id ? 'Change the linked recipe' : 'Use another recipe for this ingredient'}
                      aria-label={
                        ing.recipe_id
                          ? `Change the recipe linked to ingredient ${i + 1}`
                          : `Link a recipe to ingredient ${i + 1}`
                      }
                    >
                      <Link2 size={16} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeIngredient(i)}
                      className="rf-ingredient-remove text-sm transition-colors"
                      style={{ color: 'var(--red)' }}
                      aria-label="Remove ingredient"
                    >
                      <span className="rf-ingredient-remove-label">Remove</span>
                      <span className="rf-ingredient-remove-icon" aria-hidden="true">×</span>
                    </button>
                  </div>
                  {ing.recipe_id && (
                    <div
                      className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full w-fit text-xs"
                      style={{ background: 'var(--green-light)', color: 'var(--green)' }}
                    >
                      <Link2 size={12} strokeWidth={2} />
                      <span>{linkedTitle ?? 'Linked recipe'}</span>
                      <button
                        type="button"
                        onClick={() => linkIngredient(i, null)}
                        className="leading-none pl-0.5"
                        style={{ color: 'inherit' }}
                        aria-label={`Unlink the recipe from ingredient ${i + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </SortableRow>
              );
            })}
            </SortableRows>
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
            <SortableRows
              ids={rowIds('step', steps.length)}
              onReorder={reorderStep}
              gap={12}
            >
            {steps.map((step, i) => (
              <SortableRow key={i} id={`step-${i}`} handleOnly gripAlign="top">
              <div className="flex flex-wrap sm:flex-nowrap gap-2 items-start">
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
              </SortableRow>
            ))}
            </SortableRows>
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

      <AddRecipeModal
        open={linkTarget !== null}
        eyebrow="Link an ingredient"
        title="Use another recipe for this ingredient"
        // Here you're hunting a specific component recipe by name, not browsing
        // what you saved lately — alphabetical stays the better default.
        defaultSort="a-z"
        existingRecipeIds={new Set()}
        // A recipe can't be an ingredient of itself.
        excludeRecipeIds={id ? new Set([id]) : undefined}
        onAdd={(recipe) => {
          if (linkTarget !== null) linkIngredient(linkTarget, recipe.id);
          setLinkedTitles((prev) => ({ ...prev, [recipe.id]: recipe.title }));
          setLinkTarget(null);
        }}
        onClose={() => setLinkTarget(null)}
      />
    </div>
  );
}
