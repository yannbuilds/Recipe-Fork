import { Ionicons } from '@expo/vector-icons';
import { subRecipeIdsIn } from '@recipe-aggregator/shared/ingredients';
import type { Ingredient, Recipe, Step, Tag } from '@recipe-aggregator/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PhotoField from '@/components/PhotoField';
import RecipePickerSheet from '@/components/RecipePickerSheet';
import SortableRows, { moveItem, useSortableScroll } from '@/components/SortableRows';
import { Body, Button, Divider, Eyebrow, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';
import ManualRecipeWizardScreen from '@/components/ManualRecipeWizardScreen';

interface Props {
  recipeId?: string;
  forceStructured?: boolean;
}

// The picker wants a Set it can check; nothing is "already added" when linking.
const emptyIdSet = new Set<string>();

interface IngRow {
  quantity: string;
  unit: string;
  item: string;
  category?: string;
  original_text?: string;
  // A linked sub-recipe. Rows are rebuilt field by field on save, so anything
  // added here must also be carried through cleanIngredients() below.
  recipe_id?: string | null;
}

export default function RecipeFormScreen({ recipeId, forceStructured = false }: Props) {
  // Creating and editing are the same experience now: the wizard. The
  // field-by-field form stays reachable with mode=fields for the things it
  // alone can do — ingredient categories and linked sub-recipes.
  if (!forceStructured) return <ManualRecipeWizardScreen recipeId={recipeId} />;
  return <StructuredRecipeFormScreen recipeId={recipeId} />;
}

function StructuredRecipeFormScreen({ recipeId }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [loading, setLoading] = useState(!!recipeId);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [servings, setServings] = useState('');
  const [prep, setPrep] = useState('');
  const [cook, setCook] = useState('');
  const [ingredients, setIngredients] = useState<IngRow[]>([{ quantity: '', unit: '', item: '' }]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [tagQuery, setTagQuery] = useState('');
  const [tagSaving, setTagSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which ingredient row is picking a recipe to link, and the titles of the ones
  // already linked (ingredients only store the id).
  const [linkTarget, setLinkTarget] = useState<number | null>(null);
  const [linkedTitles, setLinkedTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const tagsRequest = supabase.from('tags').select('*').order('name');

      if (!recipeId) {
        const tagsResult = await tagsRequest;
        if (!tagsResult.error && tagsResult.data) setAllTags(tagsResult.data as Tag[]);
        return;
      }

      const [tagsResult, recipeResult, recipeTagsResult] = await Promise.all([
        tagsRequest,
        supabase.from('recipes').select('*').eq('id', recipeId).single(),
        supabase.from('recipe_tags').select('tag_id').eq('recipe_id', recipeId),
      ]);

      if (!tagsResult.error && tagsResult.data) setAllTags(tagsResult.data as Tag[]);
      if (!recipeTagsResult.error && recipeTagsResult.data) {
        setSelectedTagIds(new Set(recipeTagsResult.data.map((row) => row.tag_id)));
      }

      if (recipeResult.data) {
        const r = recipeResult.data as Recipe;
        setTitle(r.title);
        setDescription(r.description ?? '');
        setImageUrl(r.image_url ?? '');
        setSourceUrl(r.source_url ?? '');
        setServings(r.servings != null ? String(r.servings) : '');
        setPrep(r.prep_time != null ? String(r.prep_time) : '');
        setCook(r.cook_time != null ? String(r.cook_time) : '');
        setIngredients(
          r.ingredients.length > 0
            ? r.ingredients.map((i) => ({ ...i }))
            : [{ quantity: '', unit: '', item: '' }],
        );
        const sorted = [...r.steps].sort((a, b) => a.order - b.order).map((s) => s.instruction);
        setSteps(sorted.length > 0 ? sorted : ['']);
      } else if (recipeResult.error) {
        setError(recipeResult.error.message);
      }
      setLoading(false);
    })();
  }, [recipeId]);

  // The form's own scroll position, so a drag can reach past the fold and the
  // list holds still under a finger that is placing a row.
  const { scroll, scrollProps } = useSortableScroll();

  // Drag-to-reorder. Ingredient categories are carried through untouched here —
  // the recipe page renders both lists in exactly this order either way.
  function reorderIngredient(from: number, to: number) {
    setIngredients((prev) => moveItem(prev, from, to));
  }

  function reorderStep(from: number, to: number) {
    setSteps((prev) => moveItem(prev, from, to));
  }

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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedIdKey]);

  async function addTag(tagToAdd?: Tag) {
    if (tagToAdd) {
      setSelectedTagIds((prev) => new Set(prev).add(tagToAdd.id));
      setTagQuery('');
      return;
    }

    const name = tagQuery.trim().toLowerCase();
    if (!name) return;

    const existing = allTags.find((tag) => tag.name.toLowerCase() === name);
    if (existing) {
      setSelectedTagIds((prev) => new Set(prev).add(existing.id));
      setTagQuery('');
      return;
    }

    setTagSaving(true);
    const { data, error: tagError } = await supabase
      .from('tags')
      .insert({ name })
      .select()
      .single();
    setTagSaving(false);

    if (tagError) {
      setError(tagError.message);
      return;
    }

    if (data) {
      const tag = data as Tag;
      setAllTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTagIds((prev) => new Set(prev).add(tag.id));
      setTagQuery('');
    }
  }

  function removeTag(tagId: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      next.delete(tagId);
      return next;
    });
  }

  async function syncRecipeTags(savedRecipeId: string) {
    const { data: currentRows, error: readError } = await supabase
      .from('recipe_tags')
      .select('tag_id')
      .eq('recipe_id', savedRecipeId);
    if (readError) throw readError;

    const currentIds = new Set((currentRows ?? []).map((row) => row.tag_id));
    const toRemove = [...currentIds].filter((tagId) => !selectedTagIds.has(tagId));
    const toAdd = [...selectedTagIds].filter((tagId) => !currentIds.has(tagId));

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from('recipe_tags')
        .delete()
        .eq('recipe_id', savedRecipeId)
        .in('tag_id', toRemove);
      if (removeError) throw removeError;
    }

    if (toAdd.length > 0) {
      const { error: addError } = await supabase
        .from('recipe_tags')
        .insert(toAdd.map((tag_id) => ({ recipe_id: savedRecipeId, tag_id })));
      if (addError) throw addError;
    }
  }

  /** Push a freshly picked photo to storage; otherwise keep whatever is set. */
  async function uploadPhoto(): Promise<string | null> {
    if (!imageAsset || !user) return imageUrl.trim() || null;
    const bytes = await fetch(imageAsset.uri).then((response) => response.arrayBuffer());
    const mime = imageAsset.mimeType || 'image/jpeg';
    const extension =
      imageAsset.fileName?.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() ||
      mime.split('/')[1] ||
      'jpg';
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('recipe-images')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) throw new Error(`Could not upload the photo: ${uploadError.message}`);
    return supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl;
  }

  async function save() {
    if (!title.trim() || !user) return;
    setSaving(true);
    setError(null);
    const cleanIngredients: Ingredient[] = ingredients
      .filter((i) => i.item.trim())
      .map((i) => {
        const ingredient: Ingredient = {
          quantity: i.quantity.trim(),
          unit: i.unit.trim(),
          item: i.item.trim(),
        };
        if (i.category?.trim()) ingredient.category = i.category.trim();
        if (i.recipe_id) ingredient.recipe_id = i.recipe_id;
        ingredient.original_text =
          i.original_text?.trim() || [i.quantity, i.unit, i.item].filter(Boolean).join(' ');
        return ingredient;
      });
    const cleanSteps: Step[] = steps
      .filter((s) => s.trim())
      .map((s, idx) => ({ order: idx + 1, instruction: s.trim() }));

    let savedImageUrl: string | null;
    try {
      savedImageUrl = await uploadPhoto();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload the photo.');
      setSaving(false);
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      image_url: savedImageUrl,
      source_url: sourceUrl.trim() || '',
      servings: servings ? Number(servings) : null,
      prep_time: prep ? Number(prep) : null,
      cook_time: cook ? Number(cook) : null,
      ingredients: cleanIngredients,
      steps: cleanSteps,
    };

    try {
      if (recipeId) {
        const { error: saveError } = await supabase.from('recipes').update(payload).eq('id', recipeId);
        if (saveError) throw saveError;
        await syncRecipeTags(recipeId);
        queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] });
        queryClient.invalidateQueries({ queryKey: ['recipes'] });
        haptics.success();
        router.back();
        return;
      }

      const { data, error: saveError } = await supabase
        .from('recipes')
        .insert({ ...payload, user_id: user.id, is_favourite: false })
        .select('id')
        .single();
      if (saveError || !data) throw saveError ?? new Error('Failed to create recipe.');
      await syncRecipeTags(data.id);
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      haptics.success();
      router.replace({ pathname: '/recipe/[id]', params: { id: data.id } });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the recipe.');
    } finally {
      setSaving(false);
    }
  }

  const selectedTags = allTags.filter((tag) => selectedTagIds.has(tag.id));
  const normalisedTagQuery = tagQuery.trim().toLowerCase();
  const matchingTags = normalisedTagQuery
    ? allTags
        .filter(
          (tag) =>
            !selectedTagIds.has(tag.id) &&
            tag.name.toLowerCase().includes(normalisedTagQuery),
        )
        .slice(0, 5)
    : [];
  const exactTagMatch = allTags.find(
    (tag) => tag.name.toLowerCase() === normalisedTagQuery,
  );

  const inputStyle = {
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: t.text,
    fontFamily: font.sans,
  } as const;

  const label = (text: string) => (
    <Body size={12} color={t.muted} style={{ marginBottom: 6, marginTop: 16 }}>
      {text}
    </Body>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Stack.Screen options={{ title: 'Edit recipe' }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: recipeId ? 'Edit recipe' : 'New recipe' }} />
      <ScrollView {...scrollProps} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <Eyebrow>{recipeId ? 'Editing' : 'New'}</Eyebrow>
        <Serif size={28} style={{ marginTop: 8, marginBottom: 4 }}>
          {recipeId ? 'Edit recipe' : 'Add a recipe'}
        </Serif>

        {label('Title')}
        <TextInput value={title} onChangeText={setTitle} placeholder="Recipe title" placeholderTextColor={t.muted} style={inputStyle} />

        {label('Description')}
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="A short description"
          placeholderTextColor={t.muted}
          multiline
          style={[inputStyle, { minHeight: 64, textAlignVertical: 'top' }]}
        />

        {label('Photo')}
        <PhotoField
          asset={imageAsset}
          url={imageUrl}
          height={200}
          onError={setError}
          onPick={(asset) => { setError(null); setImageAsset(asset); setImageUrl(''); }}
          onRemove={() => { setImageAsset(null); setImageUrl(''); }}
        />

        {label('Source URL')}
        <TextInput value={sourceUrl} onChangeText={setSourceUrl} placeholder="https://…" placeholderTextColor={t.muted} autoCapitalize="none" style={inputStyle} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            {label('Servings')}
            <TextInput value={servings} onChangeText={setServings} placeholder="4" placeholderTextColor={t.muted} keyboardType="number-pad" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            {label('Prep (min)')}
            <TextInput value={prep} onChangeText={setPrep} placeholder="10" placeholderTextColor={t.muted} keyboardType="number-pad" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            {label('Cook (min)')}
            <TextInput value={cook} onChangeText={setCook} placeholder="30" placeholderTextColor={t.muted} keyboardType="number-pad" style={inputStyle} />
          </View>
        </View>

        {label('Tags')}
        {selectedTags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {selectedTags.map((tag) => (
              <Pressable
                key={tag.id}
                onPress={() => removeTag(tag.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${tag.name} tag`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 999,
                  backgroundColor: t.green,
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                }}
              >
                <Body size={12} weight="bold" color={t.onGreen}>{tag.name}</Body>
                <Ionicons name="close" size={13} color={t.onGreen} />
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={tagQuery}
            onChangeText={setTagQuery}
            onSubmitEditing={() => addTag()}
            placeholder="Search or create a tag"
            placeholderTextColor={t.muted}
            returnKeyType="done"
            style={[inputStyle, { flex: 1 }]}
          />
          <Pressable
            onPress={() => addTag()}
            disabled={!normalisedTagQuery || selectedTagIds.has(exactTagMatch?.id ?? '') || tagSaving}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minWidth: 74,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: 10,
              backgroundColor: t.card,
              opacity: !normalisedTagQuery || selectedTagIds.has(exactTagMatch?.id ?? '') || tagSaving ? 0.45 : pressed ? 0.7 : 1,
            })}
          >
            <Body size={13} weight="bold" color={t.text}>
              {tagSaving ? 'Saving…' : exactTagMatch ? 'Add' : 'Create'}
            </Body>
          </Pressable>
        </View>
        {matchingTags.length > 0 && (
          <View
            style={{
              marginTop: 6,
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: 10,
              backgroundColor: t.card,
              overflow: 'hidden',
            }}
          >
            {matchingTags.map((tag, index) => (
              <Pressable
                key={tag.id}
                onPress={() => addTag(tag)}
                style={({ pressed }) => ({
                  minHeight: 42,
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: t.border,
                  backgroundColor: pressed ? t.bg : t.card,
                })}
              >
                <Body size={14}>{tag.name}</Body>
                <Body size={12} color={t.muted}>Add</Body>
              </Pressable>
            ))}
          </View>
        )}

        <Divider style={{ marginTop: 24 }} />
        <Serif size={20} style={{ marginTop: 18, marginBottom: 4 }}>
          Ingredients
        </Serif>
        <SortableRows
          count={ingredients.length}
          gap={12}
          style={{ marginTop: 12 }}
          scroll={scroll}
          onReorder={reorderIngredient}
          renderItem={(i) => {
            const ing = ingredients[i];
            return (
          <View>
            <TextInput
              value={ing.item}
              onChangeText={(v) => setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, item: v, original_text: undefined } : x)))}
              placeholder="Ingredient"
              placeholderTextColor={t.muted}
              accessibilityLabel={`Ingredient ${i + 1} name`}
              style={inputStyle}
            />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <TextInput
                value={ing.quantity}
                onChangeText={(v) => setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, quantity: v, original_text: undefined } : x)))}
                placeholder="Qty"
                placeholderTextColor={t.muted}
                accessibilityLabel={`Ingredient ${i + 1} quantity`}
                style={[inputStyle, { width: 72 }]}
              />
              <TextInput
                value={ing.unit}
                onChangeText={(v) => setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, unit: v, original_text: undefined } : x)))}
                placeholder="Unit"
                placeholderTextColor={t.muted}
                accessibilityLabel={`Ingredient ${i + 1} unit`}
                style={[inputStyle, { flex: 1 }]}
              />
              <Pressable
                onPress={() => {
                  haptics.select();
                  setLinkTarget(i);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  ing.recipe_id
                    ? `Change the recipe linked to ingredient ${i + 1}`
                    : `Link a recipe to ingredient ${i + 1}`
                }
                style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="link" size={21} color={ing.recipe_id ? t.green : t.muted} />
              </Pressable>
              <Pressable
                onPress={() => setIngredients((prev) => prev.filter((_, xi) => xi !== i))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ingredient ${i + 1}`}
                style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close-circle" size={24} color={t.muted} />
              </Pressable>
            </View>
            {!!ing.recipe_id && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  gap: 6,
                  marginTop: 8,
                  paddingVertical: 5,
                  paddingLeft: 10,
                  paddingRight: 6,
                  borderRadius: 999,
                  backgroundColor: t.greenLight,
                }}
              >
                <Ionicons name="link" size={12} color={t.green} />
                <Body size={12} color={t.green}>
                  {linkedTitles[ing.recipe_id] ?? 'Linked recipe'}
                </Body>
                <Pressable
                  onPress={() => {
                    haptics.light();
                    setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, recipe_id: null } : x)));
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Unlink the recipe from ingredient ${i + 1}`}
                >
                  <Ionicons name="close" size={14} color={t.green} />
                </Pressable>
              </View>
            )}
          </View>
            );
          }}
        />
        <Pressable
          onPress={() => setIngredients((prev) => [...prev, { quantity: '', unit: '', item: '' }])}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}
        >
          <Ionicons name="add" size={16} color={t.green} />
          <Body size={14} color={t.green}>
            Add ingredient
          </Body>
        </Pressable>

        <Divider style={{ marginTop: 24 }} />
        <Serif size={20} style={{ marginTop: 18, marginBottom: 4 }}>
          Steps
        </Serif>
        <SortableRows
          count={steps.length}
          gap={10}
          style={{ marginTop: 10 }}
          scroll={scroll}
          onReorder={reorderStep}
          renderItem={(i) => {
            const step = steps[i];
            return (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.green, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
              <Body size={13} weight="bold" color={t.onGreen}>
                {i + 1}
              </Body>
            </View>
            <TextInput
              value={step}
              onChangeText={(v) => setSteps((prev) => prev.map((x, xi) => (xi === i ? v : x)))}
              placeholder={`Step ${i + 1}`}
              placeholderTextColor={t.muted}
              multiline
              style={[inputStyle, { flex: 1, minHeight: 44, textAlignVertical: 'top' }]}
            />
            <Pressable onPress={() => setSteps((prev) => prev.filter((_, xi) => xi !== i))} hitSlop={8} style={{ marginTop: 12 }}>
              <Ionicons name="close-circle" size={22} color={t.muted} />
            </Pressable>
          </View>
            );
          }}
        />
        <Pressable
          onPress={() => setSteps((prev) => [...prev, ''])}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}
        >
          <Ionicons name="add" size={16} color={t.green} />
          <Body size={14} color={t.green}>
            Add step
          </Body>
        </Pressable>

        <Button
          label={recipeId ? 'Save changes' : 'Create recipe'}
          variant="filled"
          full
          loading={saving}
          disabled={!title.trim()}
          onPress={save}
          style={{ marginTop: 28 }}
        />
        {error && (
          <Body size={13} color={t.red} style={{ marginTop: 10, textAlign: 'center' }}>
            {error}
          </Body>
        )}
      </ScrollView>

      <RecipePickerSheet
        open={linkTarget !== null}
        eyebrow="Link an ingredient"
        title="Use another recipe"
        // Here you're hunting a specific component recipe by name, not browsing
        // what you saved lately — alphabetical stays the better default.
        defaultSort="a-z"
        existingIds={emptyIdSet}
        // A recipe can't be an ingredient of itself.
        excludeIds={recipeId ? new Set([recipeId]) : undefined}
        onPick={(picked) => {
          setIngredients((prev) =>
            prev.map((x, xi) => (xi === linkTarget ? { ...x, recipe_id: picked.id } : x)),
          );
          setLinkedTitles((prev) => ({ ...prev, [picked.id]: picked.title }));
          setLinkTarget(null);
          haptics.success();
        }}
        onClose={() => setLinkTarget(null)}
      />
    </KeyboardAvoidingView>
  );
}
