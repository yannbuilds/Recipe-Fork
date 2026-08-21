import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Link2, Loader2, PenLine, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Ingredient, Recipe, Step, Tag } from '@recipe-aggregator/shared';
import { subRecipeIdsIn, supabase } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import { saveTags, syncTags } from '../lib/saveTags';
import PhotoField from './PhotoField';
import { SortableRow, SortableRows, moveAdoptingCategory, rowIds } from './SortableRows';

type WizardStep = 'paste' | 'review' | 'look' | 'details' | 'finish';
type SuggestedTag = { name: string; emoji: string };

interface Draft {
  title: string;
  description: string;
  ingredients: Ingredient[];
  steps: Step[];
  servings: string;
  prepTime: string;
  cookTime: string;
  creatorName: string;
  authorNotes: string;
  sourceUrl: string;
}

const CREATE_STEPS: WizardStep[] = ['paste', 'review', 'look', 'details', 'finish'];
// Editing skips the paste step — the recipe is already organised. Re-pasting is
// still available from the review step for a recipe worth redoing from scratch.
const EDIT_STEPS: WizardStep[] = ['review', 'look', 'details', 'finish'];
const STEP_LABELS: Record<WizardStep, string> = {
  paste: 'Paste', review: 'Review', look: 'Make it yours', details: 'Details', finish: 'Save',
};
const EMPTY_DRAFT: Draft = {
  title: '', description: '', ingredients: [], steps: [], servings: '', prepTime: '', cookTime: '',
  creatorName: '', authorNotes: '', sourceUrl: '',
};

async function functionMessage(error: { context?: unknown; message?: string }, fallback: string) {
  try {
    if (error.context instanceof Response) {
      const clone = error.context.clone();
      try { return (await clone.json())?.error || fallback; } catch { return (await error.context.text()) || fallback; }
    }
    return error.message || fallback;
  } catch { return fallback; }
}

export default function ManualRecipeWizard({ recipeId }: { recipeId?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const editing = Boolean(recipeId);
  const STEPS = editing ? EDIT_STEPS : CREATE_STEPS;

  const [step, setStep] = useState<WizardStep>(editing ? 'review' : 'paste');
  const [paste, setPaste] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [tagOptions, setTagOptions] = useState<SuggestedTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [tagLibrary, setTagLibrary] = useState<Tag[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [editingIngredient, setEditingIngredient] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [linkedTitles, setLinkedTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [draftingDescription, setDraftingDescription] = useState(false);
  const [error, setError] = useState('');

  // Re-pasting lands on the paste step, which isn't part of the edit sequence —
  // it gets its own header rather than a bogus position in the progress dots.
  const repasting = editing && step === 'paste';
  const currentIndex = Math.max(0, STEPS.indexOf(step));
  const valid = draft.title.trim() && draft.ingredients.some((i) => i.item.trim()) && draft.steps.some((s) => s.instruction.trim());
  const ingredientLine = (ingredient: Ingredient) =>
    ingredient.original_text?.trim() || [ingredient.quantity, ingredient.unit, ingredient.item].filter(Boolean).join(' ');

  // Load the recipe being edited, plus the tag library the search box needs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tagsResult, recipeResult, recipeTagsResult] = await Promise.all([
        supabase.from('tags').select('*').order('name'),
        recipeId ? supabase.from('recipes').select('*').eq('id', recipeId).single() : null,
        recipeId ? supabase.from('recipe_tags').select('tags(*)').eq('recipe_id', recipeId) : null,
      ]);
      if (cancelled) return;

      if (tagsResult.data) setTagLibrary(tagsResult.data as Tag[]);

      if (recipeResult?.error) setError(recipeResult.error.message);
      if (recipeResult?.data) {
        const recipe = recipeResult.data as Recipe;
        setDraft({
          title: recipe.title, description: recipe.description ?? '',
          ingredients: recipe.ingredients ?? [],
          steps: [...(recipe.steps ?? [])].sort((a, b) => a.order - b.order),
          servings: recipe.servings != null ? String(recipe.servings) : '',
          prepTime: recipe.prep_time != null ? String(recipe.prep_time) : '',
          cookTime: recipe.cook_time != null ? String(recipe.cook_time) : '',
          creatorName: recipe.creator_name ?? '', authorNotes: recipe.author_notes ?? '',
          sourceUrl: recipe.source_url ?? '',
        });
        setImageUrl(recipe.image_url ?? '');
        setPaste(recipe.original_paste ?? '');
      }

      const existing = (recipeTagsResult?.data ?? [])
        .map((row: any) => row.tags)
        .filter(Boolean)
        .map((tag: Tag) => ({ name: tag.name, emoji: tag.emoji ?? '' }));
      if (existing.length > 0) {
        setTagOptions(existing);
        setSelectedTags(new Set(existing.map((tag: SuggestedTag) => tag.name)));
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [recipeId]);

  // Name the sub-recipes an ingredient points at, so a link is visible here
  // instead of silently riding along. An unresolvable link just stays unnamed.
  const linkedIdKey = subRecipeIdsIn(draft.ingredients).sort().join(',');
  useEffect(() => {
    const missing = subRecipeIdsIn(draft.ingredients).filter((id) => !linkedTitles[id]);
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

  // Drag-to-reorder. Both lists carry a category the wizard never shows, so a
  // dropped row adopts its new neighbour's — see moveAdoptingCategory.
  function reorderIngredients(from: number, to: number) {
    setEditingIngredient(null);
    setDraft((d) => ({ ...d, ingredients: moveAdoptingCategory(d.ingredients, from, to) }));
  }

  function reorderSteps(from: number, to: number) {
    setEditingStep(null);
    setDraft((d) => ({
      ...d,
      // Renumbered here as well as on save, so the draft never carries an order
      // that disagrees with what the list shows.
      steps: moveAdoptingCategory(d.steps, from, to).map((s, i) => ({ ...s, order: i + 1 })),
    }));
  }

  function go(next: WizardStep) {
    setError('');
    setStep(next);
    setEditingIngredient(null);
    setEditingStep(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    if (repasting) { go('review'); return; }
    if (currentIndex > 0) { go(STEPS[currentIndex - 1]); return; }
    navigate(-1);
  }

  async function organise() {
    if (paste.trim().length < 20) {
      setError('Paste the title, ingredients, and method first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in to organise a recipe.');
      const { data, error: invokeError } = await supabase.functions.invoke('parse-recipe-text', {
        body: { action: 'classify', text: paste },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (invokeError) throw new Error(await functionMessage(invokeError, 'The recipe could not be organised.'));
      if (data?.error) throw new Error(data.error);
      const recipe = data.recipe ?? {};
      setDraft({
        title: recipe.title ?? '', description: recipe.description ?? '',
        ingredients: recipe.ingredients ?? [], steps: recipe.steps ?? [],
        servings: recipe.servings != null ? String(recipe.servings) : '',
        prepTime: recipe.prep_time != null ? String(recipe.prep_time) : '',
        cookTime: recipe.cook_time != null ? String(recipe.cook_time) : '',
        creatorName: recipe.creator_name ?? '', authorNotes: recipe.author_notes ?? '', sourceUrl: recipe.source_url ?? '',
      });
      // Keep whatever was already chosen; the suggestions just widen the choice.
      mergeTagOptions(data.tags ?? []);
      setUncertain(data.uncertain ?? []);
      go('review');
    } catch (organiseError) {
      setError(organiseError instanceof Error ? organiseError.message : 'The recipe could not be organised.');
    } finally { setBusy(false); }
  }

  function mergeTagOptions(incoming: SuggestedTag[]) {
    setTagOptions((current) => {
      const seen = new Set(current.map((tag) => tag.name.toLowerCase()));
      return [...current, ...incoming.filter((tag) => !seen.has(tag.name.toLowerCase()))];
    });
  }

  function toggleTag(name: string) {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function addTagFromQuery(tag?: Tag) {
    const name = (tag?.name ?? tagQuery).trim().toLowerCase();
    if (!name) return;
    mergeTagOptions([{ name, emoji: tag?.emoji ?? '' }]);
    setSelectedTags((current) => new Set(current).add(name));
    setTagQuery('');
  }

  async function draftDescription() {
    setDraftingDescription(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in first.');
      const { data, error: invokeError } = await supabase.functions.invoke('parse-recipe-text', {
        body: { action: 'draft-description', recipe: { title: draft.title, ingredients: draft.ingredients, steps: draft.steps } },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (invokeError) throw new Error(await functionMessage(invokeError, 'Could not draft a description.'));
      setDraft((current) => ({ ...current, description: data?.description ?? '' }));
    } catch (descriptionError) {
      setError(descriptionError instanceof Error ? descriptionError.message : 'Could not draft a description.');
    } finally { setDraftingDescription(false); }
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile || !user) return imageUrl.trim() || null;
    const extension = imageFile.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('recipe-images').upload(path, imageFile, {
      contentType: imageFile.type || 'image/jpeg', upsert: false,
    });
    if (uploadError) throw new Error(`Could not upload the image: ${uploadError.message}`);
    return supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl;
  }

  async function save() {
    if (!valid || !user) { setError('Add a title, at least one ingredient, and at least one step.'); return; }
    setBusy(true);
    setError('');
    try {
      const savedImageUrl = await uploadImage();
      // Spread the whole row: an ingredient's category and linked sub-recipe
      // ride along untouched even though this screen doesn't edit them.
      const ingredients = draft.ingredients.filter((i) => i.item.trim()).map((i) => ({ ...i, item: i.item.trim() }));
      const steps = draft.steps.filter((s) => s.instruction.trim()).map((s, index) => ({ ...s, order: index + 1, instruction: s.instruction.trim() }));
      const chosenTags = tagOptions.filter((tag) => selectedTags.has(tag.name));
      const payload = {
        title: draft.title.trim(), description: draft.description.trim() || null,
        ingredients, steps, servings: draft.servings ? Number(draft.servings) : null,
        prep_time: draft.prepTime ? Number(draft.prepTime) : null, cook_time: draft.cookTime ? Number(draft.cookTime) : null,
        source_url: draft.sourceUrl.trim(), creator_name: draft.creatorName.trim() || null,
        author_notes: draft.authorNotes.trim() || null, image_url: savedImageUrl,
        original_paste: paste.trim() || null,
      };

      if (recipeId) {
        // video_url, notes, favourite and nutrition are deliberately absent —
        // an edit here must not wipe what this screen never showed.
        const { error: saveError } = await supabase.from('recipes').update(payload).eq('id', recipeId);
        if (saveError) throw new Error(saveError.message);
        await syncTags(recipeId, chosenTags).catch(() => {});
        navigate(`/recipe/${recipeId}`, { replace: true });
        return;
      }

      const { data, error: saveError } = await supabase.from('recipes').insert({
        ...payload, user_id: user.id, video_url: null, is_favourite: false,
      }).select('id').single();
      if (saveError || !data) throw new Error(saveError?.message ?? 'Could not save the recipe.');
      await saveTags(data.id, chosenTags).catch(() => {});
      navigate(`/recipe/${data.id}`, { replace: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the recipe.');
    } finally { setBusy(false); }
  }

  const screenTitle = useMemo<[string, string]>(() => {
    if (repasting) return ['Start again from a paste', 'This replaces the title, ingredients and method below. Your photo and tags stay.'];
    const copy: Record<WizardStep, [string, string]> = {
      paste: ['Start with everything', 'Paste the recipe exactly as you have it. We’ll organise it without rewriting a word.'],
      review: editing
        ? ['Check the recipe', 'Tap any line to change it.']
        : ['Check the recipe', 'Tap any line to correct how it was classified.'],
      look: ['Make it look good', 'Both are optional—you can skip this whole step.'],
      details: ['A few useful details', 'Keep what was found, add anything missing, or skip ahead.'],
      finish: editing
        ? ['Ready to save', 'One last look before your changes go in.']
        : ['Ready for your recipe box', 'One last look before it’s saved.'],
    };
    return copy[step];
  }, [step, editing, repasting]);

  const normalisedTagQuery = tagQuery.trim().toLowerCase();
  const knownTagNames = new Set(tagOptions.map((tag) => tag.name.toLowerCase()));
  const matchingTags = normalisedTagQuery
    ? tagLibrary.filter((tag) => !knownTagNames.has(tag.name.toLowerCase()) && tag.name.toLowerCase().includes(normalisedTagQuery)).slice(0, 6)
    : [];

  if (loading) {
    return <p className="text-center text-sm py-12" style={{ color: 'var(--muted)' }}>Loading recipe…</p>;
  }

  const tagSection = (
    <div className="mt-7">
      <p className="text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>
        Tags {tagOptions.length > 0 && <span className="font-normal">— tap to choose</span>}
      </p>
      {tagOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {tagOptions.map((tag) => {
            const selected = selectedTags.has(tag.name);
            return (
              <button key={tag.name} type="button" onClick={() => toggleTag(tag.name)} className={selected ? 'rf-tag rf-tag-active' : 'rf-tag'}>
                {tag.emoji} {tag.name}{selected && ' ✓'}
              </button>
            );
          })}
        </div>
      )}
      <div className="rf-tag-search">
        <div className="flex gap-2">
          <input
            className="rf-input w-full"
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTagFromQuery(); } }}
            placeholder="Search or create a tag"
            role="combobox"
            aria-expanded={matchingTags.length > 0}
            aria-controls="wizard-tag-suggestions"
          />
          <button type="button" onClick={() => addTagFromQuery()} disabled={!normalisedTagQuery} className="rf-btn rf-btn-secondary shrink-0 disabled:opacity-50">
            Add
          </button>
        </div>
        {matchingTags.length > 0 && (
          <div id="wizard-tag-suggestions" className="rf-tag-suggestions" role="listbox">
            {matchingTags.map((tag) => (
              <button key={tag.id} type="button" role="option" aria-selected="false" onClick={() => addTagFromQuery(tag)}>
                <span>{tag.emoji} {tag.name}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Add</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <main className="mx-auto" style={{ maxWidth: 780, padding: '28px 20px 72px' }}>
      <div className="flex items-center justify-between gap-4 mb-7">
        <button type="button" onClick={goBack} className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <ArrowLeft size={17} /> Back
        </button>
        {!repasting && (
          <div className="flex items-center gap-1.5" aria-label={`Step ${currentIndex + 1} of ${STEPS.length}`}>
            {STEPS.map((item, index) => <span key={item} style={{ width: index === currentIndex ? 28 : 8, height: 8, borderRadius: 99, background: index <= currentIndex ? 'var(--green)' : 'var(--border)', transition: 'all .28s ease' }} />)}
          </div>
        )}
        <span className="rf-eyebrow" style={{ minWidth: 58, textAlign: 'right' }}>
          {repasting ? 'Redo' : `${currentIndex + 1} / ${STEPS.length}`}
        </span>
      </div>

      <section key={step} style={{ animation: 'fadeUp .28s ease both' }}>
        <div className="rf-eyebrow mb-2">{editing && !repasting ? `Editing · ${STEP_LABELS[step]}` : STEP_LABELS[step]}</div>
        <h1 className="rf-heading" style={{ fontSize: 'clamp(30px, 6vw, 42px)', color: 'var(--text)', lineHeight: 1.05 }}>{screenTitle[0]}</h1>
        <p className="mt-2 mb-7" style={{ color: 'var(--muted)', maxWidth: 600 }}>{screenTitle[1]}</p>

        {error && <div className="rounded-xl mb-5 text-sm" style={{ padding: 13, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)' }}>{error}</div>}

        {step === 'paste' && <>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} autoFocus rows={17} className="rf-input w-full" style={{ resize: 'vertical', fontSize: 16, lineHeight: 1.6, padding: 18 }} placeholder={'Chocolate cake\n\nIngredients\n2 cups flour\n…\n\nMethod\n1. Preheat the oven…'} />
          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <button type="button" onClick={organise} disabled={busy || paste.trim().length < 20} className="rf-btn rf-btn-primary flex-1 justify-center" style={{ minHeight: 50 }}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} {busy ? 'Organising…' : 'Organise recipe'}
            </button>
            {!editing && (
              <button type="button" onClick={() => navigate('/new?mode=fields', { replace: true })} className="rf-btn rf-btn-secondary justify-center">
                <PenLine size={17} /> Enter field by field
              </button>
            )}
          </div>
        </>}

        {step === 'review' && <>
          {(!valid || uncertain.length > 0) && <div className="rounded-xl mb-5" style={{ padding: 14, border: '1px solid var(--border)', background: 'var(--warm)' }}>
            {!valid && <p className="text-sm" style={{ color: 'var(--red)' }}>A title, ingredient, and step are required. Fill any missing section below.</p>}
            {uncertain.length > 0 && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Worth checking: {uncertain.join(' · ')}</p>}
          </div>}
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>Title</label>
          <input className="rf-input w-full text-lg" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Recipe title" />

          <div className="flex items-center justify-between mt-7 mb-3"><h2 className="rf-heading text-xl">Ingredients</h2><button type="button" onClick={() => { setDraft((d) => ({ ...d, ingredients: [...d.ingredients, { item: '', quantity: '', unit: '', original_text: '' }] })); setEditingIngredient(draft.ingredients.length); }} className="text-sm" style={{ color: 'var(--green)' }}>+ Add</button></div>
          <SortableRows
            ids={rowIds('ingredient', draft.ingredients.length)}
            onDragStart={() => setEditingIngredient(null)}
            onReorder={reorderIngredients}
          >
            {draft.ingredients.map((ingredient, index) => <SortableRow key={index} id={`ingredient-${index}`} disabled={editingIngredient === index} className="rf-card" style={{ padding: 14 }}>
              {editingIngredient === index ? <div className="space-y-3">
                <input className="rf-input w-full" value={ingredient.original_text ?? ''} onChange={(e) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((item, i) => i === index ? { ...item, original_text: e.target.value } : item) }))} placeholder="Complete ingredient line" autoFocus />
                <div className="grid grid-cols-3 gap-2">
                  <input className="rf-input" value={ingredient.quantity} onChange={(e) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item) }))} placeholder="Quantity" />
                  <input className="rf-input" value={ingredient.unit} onChange={(e) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((item, i) => i === index ? { ...item, unit: e.target.value } : item) }))} placeholder="Unit" />
                  <input className="rf-input" value={ingredient.item} onChange={(e) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((item, i) => i === index ? { ...item, item: e.target.value } : item) }))} placeholder="Ingredient" />
                </div>
                <div className="flex justify-between"><button type="button" onClick={() => { setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, i) => i !== index) })); setEditingIngredient(null); }} className="text-sm" style={{ color: 'var(--red)' }}>Remove</button><button type="button" onClick={() => setEditingIngredient(null)} className="rf-btn rf-btn-secondary"><Check size={15} /> Done</button></div>
              </div> : <button type="button" onClick={() => setEditingIngredient(index)} className="w-full flex items-start justify-between gap-3 text-left">
                <span>
                  {ingredientLine(ingredient) || 'Empty ingredient'}
                  {ingredient.recipe_id && <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-xs align-middle" style={{ background: 'var(--green-light)', color: 'var(--green)' }}><Link2 size={11} strokeWidth={2.2} />{linkedTitles[ingredient.recipe_id] ?? 'Linked recipe'}</span>}
                </span>
                <PenLine size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              </button>}
            </SortableRow>)}
          </SortableRows>

          <div className="flex items-center justify-between mt-8 mb-3"><h2 className="rf-heading text-xl">Steps</h2><button type="button" onClick={() => { setDraft((d) => ({ ...d, steps: [...d.steps, { order: d.steps.length + 1, instruction: '' }] })); setEditingStep(draft.steps.length); }} className="text-sm" style={{ color: 'var(--green)' }}>+ Add</button></div>
          <SortableRows
            ids={rowIds('step', draft.steps.length)}
            onDragStart={() => setEditingStep(null)}
            onReorder={reorderSteps}
          >
            {draft.steps.map((recipeStep, index) => <SortableRow key={index} id={`step-${index}`} disabled={editingStep === index} className="rf-card" style={{ padding: 14 }}>
            {editingStep === index ? <div className="space-y-3"><textarea className="rf-input w-full" rows={4} value={recipeStep.instruction} onChange={(e) => setDraft((d) => ({ ...d, steps: d.steps.map((item, i) => i === index ? { ...item, instruction: e.target.value } : item) }))} autoFocus /><div className="flex justify-between"><button type="button" onClick={() => { setDraft((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })) })); setEditingStep(null); }} className="text-sm" style={{ color: 'var(--red)' }}>Remove</button><button type="button" onClick={() => setEditingStep(null)} className="rf-btn rf-btn-secondary"><Check size={15} /> Done</button></div></div>
              : <button type="button" onClick={() => setEditingStep(index)} className="w-full flex items-start gap-3 text-left"><span className="shrink-0 flex items-center justify-center rounded-full text-xs font-bold text-white" style={{ width: 26, height: 26, background: 'var(--green)' }}>{index + 1}</span><span className="flex-1 leading-relaxed">{recipeStep.instruction || 'Empty step'}</span><PenLine size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} /></button>}
            </SortableRow>)}
          </SortableRows>
          <button type="button" onClick={() => go('look')} disabled={!valid} className="rf-btn rf-btn-primary w-full justify-center mt-7" style={{ minHeight: 50 }}>Looks right <ArrowRight size={18} /></button>
          {editing && (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-5 text-sm">
              <button type="button" onClick={() => go('paste')} className="inline-flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                <Sparkles size={14} /> Re-paste and reorganise
              </button>
              <button type="button" onClick={() => navigate(`/recipe/${recipeId}/edit?mode=fields`, { replace: true })} className="inline-flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                <PenLine size={14} /> Field-by-field editor
              </button>
            </div>
          )}
        </>}

        {step === 'look' && <>
          <PhotoField file={imageFile} url={imageUrl} onError={setError} onPick={(file) => { setError(''); setImageFile(file); setImageUrl(''); }} onRemove={() => { setImageFile(null); setImageUrl(''); }} />
          <div className="flex items-center justify-between mt-7 mb-2"><label className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Description</label><button type="button" onClick={draftDescription} disabled={draftingDescription} className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--green)' }}>{draftingDescription ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Draft description</button></div>
          <textarea className="rf-input w-full" rows={4} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Optional short description" />
          <div className="flex gap-3 mt-7"><button type="button" onClick={() => go('details')} className="rf-btn rf-btn-secondary flex-1 justify-center">Skip</button><button type="button" onClick={() => go('details')} className="rf-btn rf-btn-primary flex-1 justify-center">Next <ArrowRight size={18} /></button></div>
        </>}

        {step === 'details' && <>
          <div className="grid grid-cols-3 gap-3">
            {[['Servings', 'servings'], ['Prep (min)', 'prepTime'], ['Cook (min)', 'cookTime']].map(([label, key]) => <label key={key} className="text-sm" style={{ color: 'var(--muted)' }}>{label}<input type="number" min="0" className="rf-input w-full mt-2" value={draft[key as 'servings' | 'prepTime' | 'cookTime']} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} /></label>)}
          </div>
          <label className="block text-sm mt-6" style={{ color: 'var(--muted)' }}>Source URL<input type="url" className="rf-input w-full mt-2" value={draft.sourceUrl} onChange={(e) => setDraft((d) => ({ ...d, sourceUrl: e.target.value }))} placeholder="https://…" /></label>
          <label className="block text-sm mt-5" style={{ color: 'var(--muted)' }}>Original creator<input className="rf-input w-full mt-2" value={draft.creatorName} onChange={(e) => setDraft((d) => ({ ...d, creatorName: e.target.value }))} placeholder="Optional" /></label>
          <label className="block text-sm mt-5" style={{ color: 'var(--muted)' }}>Author’s notes<textarea className="rf-input w-full mt-2" rows={3} value={draft.authorNotes} onChange={(e) => setDraft((d) => ({ ...d, authorNotes: e.target.value }))} placeholder="Optional" /></label>
          {tagSection}
          <div className="flex gap-3 mt-8"><button type="button" onClick={() => go('finish')} className="rf-btn rf-btn-secondary flex-1 justify-center">Skip</button><button type="button" onClick={() => go('finish')} className="rf-btn rf-btn-primary flex-1 justify-center">Review <ArrowRight size={18} /></button></div>
        </>}

        {step === 'finish' && <>
          <div className="rf-card overflow-hidden">{(imageFile || imageUrl) && <FinishImage file={imageFile} url={imageUrl} />}<div style={{ padding: 22 }}><div className="rf-eyebrow mb-2">{selectedTags.size ? [...selectedTags].join(' · ') : editing ? 'Updated recipe' : 'New recipe'}</div><h2 className="rf-heading text-3xl">{draft.title}</h2>{draft.description && <p className="mt-3" style={{ color: 'var(--text-soft)' }}>{draft.description}</p>}<div className="flex gap-4 mt-5 text-sm" style={{ color: 'var(--muted)' }}><span>{draft.ingredients.filter((i) => i.item.trim()).length} ingredients</span><span>{draft.steps.filter((s) => s.instruction.trim()).length} steps</span>{draft.servings && <span>Serves {draft.servings}</span>}</div></div></div>
          {paste.trim() && <details className="mt-4 rf-card" style={{ padding: 16 }}><summary className="cursor-pointer text-sm font-medium">Original paste</summary><pre className="whitespace-pre-wrap text-sm mt-4" style={{ color: 'var(--muted)', fontFamily: 'inherit', lineHeight: 1.55 }}>{paste}</pre></details>}
          <button type="button" onClick={save} disabled={busy || !valid} className="rf-btn rf-btn-primary w-full justify-center mt-6" style={{ minHeight: 52 }}>{busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} {busy ? 'Saving…' : editing ? 'Save changes' : 'Save recipe'}</button>
        </>}
      </section>
    </main>
  );
}

/** The finish card's photo — a picked file needs its own object URL. */
function FinishImage({ file, url }: { file: File | null; url: string }) {
  const [objectUrl, setObjectUrl] = useState('');
  useEffect(() => {
    if (!file) { setObjectUrl(''); return; }
    const next = URL.createObjectURL(file);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const src = objectUrl || url.trim();
  if (!src) return null;
  return <img src={src} alt="" className="w-full object-cover" style={{ height: 220 }} />;
}
