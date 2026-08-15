import { Ionicons } from '@expo/vector-icons';
import type { Ingredient, Step } from '@recipe-aggregator/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Eyebrow, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';
import { saveTags } from '@/lib/saveTags';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

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

const STEPS: WizardStep[] = ['paste', 'review', 'look', 'details', 'finish'];
const LABELS = ['Paste', 'Review', 'Make it yours', 'Details', 'Save'];
const EMPTY: Draft = { title: '', description: '', ingredients: [], steps: [], servings: '', prepTime: '', cookTime: '', creatorName: '', authorNotes: '', sourceUrl: '' };

async function functionMessage(error: { context?: unknown; message?: string }, fallback: string) {
  try {
    if (error.context instanceof Response) {
      const clone = error.context.clone();
      try { return (await clone.json())?.error || fallback; } catch { return (await error.context.text()) || fallback; }
    }
    return error.message || fallback;
  } catch { return fallback; }
}

export default function ManualRecipeWizardScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const animation = useRef(new Animated.Value(1)).current;
  const [step, setStep] = useState<WizardStep>('paste');
  const [paste, setPaste] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [editingIngredient, setEditingIngredient] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);

  const index = STEPS.indexOf(step);
  const valid = !!draft.title.trim() && draft.ingredients.some((i) => i.item.trim()) && draft.steps.some((s) => s.instruction.trim());
  const previewImage = imageAsset?.uri || imageUrl.trim();
  const titles = useMemo(() => ({
    paste: ['Start with everything', 'Paste the recipe exactly as you have it. We’ll organise it without rewriting a word.'],
    review: ['Check the recipe', 'Tap any line to correct how it was classified.'],
    look: ['Make it look good', 'Both are optional—you can skip this whole step.'],
    details: ['A few useful details', 'Keep what was found, add anything missing, or skip ahead.'],
    finish: ['Ready for your recipe box', 'One last look before it’s saved.'],
  }[step]), [step]);

  useEffect(() => {
    animation.setValue(0);
    Animated.timing(animation, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [step, animation]);

  const input = {
    borderWidth: 1, borderColor: t.border, backgroundColor: t.card, borderRadius: 11,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.text, fontFamily: font.sans,
  } as const;

  function go(next: WizardStep) {
    setError('');
    setStep(next);
    setEditingIngredient(null);
    setEditingStep(null);
  }

  function ingredientLine(ingredient: Ingredient) {
    return ingredient.original_text?.trim() || [ingredient.quantity, ingredient.unit, ingredient.item].filter(Boolean).join(' ');
  }

  async function organise() {
    if (paste.trim().length < 20) { setError('Paste the title, ingredients, and method first.'); return; }
    setBusy(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in to organise a recipe.');
      const { data, error: invokeError } = await supabase.functions.invoke('parse-recipe-text', {
        body: { action: 'classify', text: paste }, headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (invokeError) throw new Error(await functionMessage(invokeError, 'The recipe could not be organised.'));
      if (data?.error) throw new Error(data.error);
      const recipe = data.recipe ?? {};
      setDraft({
        title: recipe.title ?? '', description: recipe.description ?? '', ingredients: recipe.ingredients ?? [], steps: recipe.steps ?? [],
        servings: recipe.servings != null ? String(recipe.servings) : '', prepTime: recipe.prep_time != null ? String(recipe.prep_time) : '',
        cookTime: recipe.cook_time != null ? String(recipe.cook_time) : '', creatorName: recipe.creator_name ?? '',
        authorNotes: recipe.author_notes ?? '', sourceUrl: recipe.source_url ?? '',
      });
      setSuggestedTags(data.tags ?? []); setSelectedTags(new Set()); setUncertain(data.uncertain ?? []);
      haptics.success(); go('review');
    } catch (organiseError) {
      haptics.error(); setError(organiseError instanceof Error ? organiseError.message : 'The recipe could not be organised.');
    } finally { setBusy(false); }
  }

  async function pickPhoto(camera = false) {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setError('Camera access is needed to take a recipe photo.'); return; }
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) {
      const asset = result.assets[0];
      if ((asset.fileSize ?? 0) > 20 * 1024 * 1024) { setError('Choose an image smaller than 20 MB.'); return; }
      setImageAsset(asset); setImageUrl('');
    }
  }

  async function draftDescription() {
    setDrafting(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in first.');
      const { data, error: invokeError } = await supabase.functions.invoke('parse-recipe-text', {
        body: { action: 'draft-description', recipe: { title: draft.title, ingredients: draft.ingredients, steps: draft.steps } },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (invokeError) throw new Error(await functionMessage(invokeError, 'Could not draft a description.'));
      setDraft((current) => ({ ...current, description: data?.description ?? '' }));
    } catch (descriptionError) { setError(descriptionError instanceof Error ? descriptionError.message : 'Could not draft a description.'); }
    finally { setDrafting(false); }
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageAsset || !user) return imageUrl.trim() || null;
    const bytes = await fetch(imageAsset.uri).then((response) => response.arrayBuffer());
    const mime = imageAsset.mimeType || 'image/jpeg';
    const extension = imageAsset.fileName?.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || mime.split('/')[1] || 'jpg';
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('recipe-images').upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) throw new Error(`Could not upload the image: ${uploadError.message}`);
    return supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl;
  }

  async function save() {
    if (!valid || !user) { setError('Add a title, at least one ingredient, and at least one step.'); return; }
    setBusy(true); setError('');
    try {
      const savedImage = await uploadImage();
      const ingredients = draft.ingredients.filter((i) => i.item.trim()).map((i) => ({ ...i, item: i.item.trim() }));
      const steps = draft.steps.filter((s) => s.instruction.trim()).map((s, i) => ({ ...s, order: i + 1, instruction: s.instruction.trim() }));
      const { data, error: saveError } = await supabase.from('recipes').insert({
        user_id: user.id, title: draft.title.trim(), description: draft.description.trim() || null,
        ingredients, steps, servings: draft.servings ? Number(draft.servings) : null,
        prep_time: draft.prepTime ? Number(draft.prepTime) : null, cook_time: draft.cookTime ? Number(draft.cookTime) : null,
        source_url: draft.sourceUrl.trim(), creator_name: draft.creatorName.trim() || null,
        author_notes: draft.authorNotes.trim() || null, image_url: savedImage, video_url: null,
        original_paste: paste, is_favourite: false,
      }).select('id').single();
      if (saveError || !data) throw new Error(saveError?.message ?? 'Could not save the recipe.');
      await saveTags(data.id, suggestedTags.filter((tag) => selectedTags.has(tag.name))).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['recipes'] }); haptics.success();
      router.replace({ pathname: '/recipe/[id]', params: { id: data.id } });
    } catch (saveError) { haptics.error(); setError(saveError instanceof Error ? saveError.message : 'Could not save the recipe.'); }
    finally { setBusy(false); }
  }

  const header = <>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
      <Pressable onPress={() => index ? go(STEPS[index - 1]) : router.back()} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, width: 62 }}><Ionicons name="arrow-back" size={18} color={t.muted} /><Body size={13} color={t.muted}>Back</Body></Pressable>
      <View style={{ flexDirection: 'row', gap: 5 }}>{STEPS.map((item, i) => <View key={item} style={{ width: i === index ? 25 : 7, height: 7, borderRadius: 99, backgroundColor: i <= index ? t.green : t.border }} />)}</View>
      <Eyebrow style={{ width: 62, textAlign: 'right' }}>{index + 1} / 5</Eyebrow>
    </View>
    <Eyebrow style={{ marginBottom: 8 }}>{LABELS[index]}</Eyebrow>
    <Serif size={34} style={{ lineHeight: 36 }}>{titles[0]}</Serif>
    <Body size={14} color={t.muted} style={{ lineHeight: 20, marginTop: 7, marginBottom: 23 }}>{titles[1]}</Body>
    {!!error && <View style={{ backgroundColor: t.redLight, borderRadius: 10, padding: 12, marginBottom: 16 }}><Body size={13} color={t.red}>{error}</Body></View>}
  </>;

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ title: 'Add a recipe', headerBackVisible: false }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 44 }}>
      {header}
      <Animated.View style={{ opacity: animation, transform: [{ translateX: animation.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
        {step === 'paste' && <>
          <TextInput value={paste} onChangeText={setPaste} autoFocus multiline textAlignVertical="top" placeholder={'Chocolate cake\n\nIngredients\n2 cups flour\n…\n\nMethod\n1. Preheat the oven…'} placeholderTextColor={t.muted} style={[input, { minHeight: 330, fontSize: 16, lineHeight: 24 }]} />
          <Button label="Organise recipe" variant="filled" full loading={busy} disabled={paste.trim().length < 20} icon={<Ionicons name="sparkles" size={17} color={t.onGreen} />} onPress={organise} style={{ marginTop: 16 }} />
          <Button label="Enter field by field" variant="secondary" full icon={<Ionicons name="create-outline" size={17} color={t.text} />} onPress={() => router.replace({ pathname: '/recipe/new', params: { mode: 'fields' } })} style={{ marginTop: 10 }} />
        </>}

        {step === 'review' && <>
          {(!valid || uncertain.length > 0) && <View style={{ backgroundColor: t.warm, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 12, marginBottom: 16 }}>{!valid && <Body size={13} color={t.red}>A title, ingredient, and step are required.</Body>}{uncertain.length > 0 && <Body size={12} color={t.muted} style={{ marginTop: 4 }}>Worth checking: {uncertain.join(' · ')}</Body>}</View>}
          <Body size={12} color={t.muted} style={{ marginBottom: 6 }}>Title</Body>
          <TextInput value={draft.title} onChangeText={(title) => setDraft((d) => ({ ...d, title }))} placeholder="Recipe title" placeholderTextColor={t.muted} style={[input, { fontSize: 18 }]} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 9 }}><Serif size={21}>Ingredients</Serif><Pressable onPress={() => { setEditingIngredient(draft.ingredients.length); setDraft((d) => ({ ...d, ingredients: [...d.ingredients, { item: '', quantity: '', unit: '', original_text: '' }] })); }}><Body size={13} color={t.green}>+ Add</Body></Pressable></View>
          {draft.ingredients.map((ingredient, i) => <View key={i} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 13, marginBottom: 8 }}>
            {editingIngredient === i ? <View style={{ gap: 8 }}><TextInput value={ingredient.original_text ?? ''} onChangeText={(value) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((item, x) => x === i ? { ...item, original_text: value } : item) }))} placeholder="Complete ingredient line" placeholderTextColor={t.muted} style={input} /><View style={{ flexDirection: 'row', gap: 7 }}><TextInput value={ingredient.quantity} onChangeText={(value) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((item, x) => x === i ? { ...item, quantity: value } : item) }))} placeholder="Qty" placeholderTextColor={t.muted} style={[input, { width: 68 }]} /><TextInput value={ingredient.unit} onChangeText={(value) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((item, x) => x === i ? { ...item, unit: value } : item) }))} placeholder="Unit" placeholderTextColor={t.muted} style={[input, { width: 82 }]} /><TextInput value={ingredient.item} onChangeText={(value) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((item, x) => x === i ? { ...item, item: value } : item) }))} placeholder="Ingredient" placeholderTextColor={t.muted} style={[input, { flex: 1 }]} /></View><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Pressable onPress={() => { setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, x) => x !== i) })); setEditingIngredient(null); }}><Body size={12} color={t.red}>Remove</Body></Pressable><Button label="Done" variant="secondary" onPress={() => setEditingIngredient(null)} /></View></View>
              : <Pressable onPress={() => setEditingIngredient(i)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}><Body size={14} style={{ flex: 1, lineHeight: 21 }}>{ingredientLine(ingredient) || 'Empty ingredient'}</Body><Ionicons name="create-outline" size={16} color={t.muted} /></Pressable>}
          </View>)}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 9 }}><Serif size={21}>Steps</Serif><Pressable onPress={() => { setEditingStep(draft.steps.length); setDraft((d) => ({ ...d, steps: [...d.steps, { order: d.steps.length + 1, instruction: '' }] })); }}><Body size={13} color={t.green}>+ Add</Body></Pressable></View>
          {draft.steps.map((recipeStep, i) => <View key={i} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 13, marginBottom: 8 }}>
            {editingStep === i ? <View style={{ gap: 8 }}><TextInput value={recipeStep.instruction} onChangeText={(instruction) => setDraft((d) => ({ ...d, steps: d.steps.map((item, x) => x === i ? { ...item, instruction } : item) }))} multiline textAlignVertical="top" style={[input, { minHeight: 90 }]} /><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Pressable onPress={() => { setDraft((d) => ({ ...d, steps: d.steps.filter((_, x) => x !== i).map((s, x) => ({ ...s, order: x + 1 })) })); setEditingStep(null); }}><Body size={12} color={t.red}>Remove</Body></Pressable><Button label="Done" variant="secondary" onPress={() => setEditingStep(null)} /></View></View>
              : <Pressable onPress={() => setEditingStep(i)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}><View style={{ width: 25, height: 25, borderRadius: 13, backgroundColor: t.green, alignItems: 'center', justifyContent: 'center' }}><Body size={12} weight="bold" color={t.onGreen}>{i + 1}</Body></View><Body size={14} style={{ flex: 1, lineHeight: 21 }}>{recipeStep.instruction || 'Empty step'}</Body><Ionicons name="create-outline" size={16} color={t.muted} /></Pressable>}
          </View>)}
          <Button label="Looks right" variant="filled" full disabled={!valid} onPress={() => go('look')} style={{ marginTop: 16 }} />
        </>}

        {step === 'look' && <>
          <View style={{ height: 230, borderRadius: 12, overflow: 'hidden', backgroundColor: t.warm, borderWidth: 1, borderColor: t.border }}>{previewImage ? <Image source={{ uri: previewImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Pressable onPress={() => pickPhoto(false)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}><Ionicons name="image-outline" size={34} color={t.muted} /><Body color={t.muted}>Add a photo</Body></Pressable>}</View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><Button label="Camera roll" variant="secondary" onPress={() => pickPhoto(false)} style={{ flex: 1 }} /><Button label="Take photo" variant="secondary" onPress={() => pickPhoto(true)} style={{ flex: 1 }} />{previewImage && <Pressable onPress={() => { setImageAsset(null); setImageUrl(''); }} style={{ width: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 9 }}><Ionicons name="close" size={19} color={t.muted} /></Pressable>}</View>
          <Body size={12} color={t.muted} style={{ marginTop: 20, marginBottom: 6 }}>Or paste an image URL</Body><TextInput value={imageUrl} onChangeText={(value) => { setImageUrl(value); setImageAsset(null); }} autoCapitalize="none" placeholder="https://…" placeholderTextColor={t.muted} style={input} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, marginBottom: 6 }}><Body size={12} color={t.muted}>Description</Body><Pressable onPress={draftDescription} disabled={drafting} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="sparkles" size={14} color={t.green} /><Body size={12} color={t.green}>{drafting ? 'Drafting…' : 'Draft description'}</Body></Pressable></View>
          <TextInput value={draft.description} onChangeText={(description) => setDraft((d) => ({ ...d, description }))} multiline textAlignVertical="top" placeholder="Optional short description" placeholderTextColor={t.muted} style={[input, { minHeight: 96 }]} />
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 18 }}><Button label="Skip" variant="secondary" onPress={() => go('details')} style={{ flex: 1 }} /><Button label="Next" variant="filled" onPress={() => go('details')} style={{ flex: 1 }} /></View>
        </>}

        {step === 'details' && <>
          <View style={{ flexDirection: 'row', gap: 8 }}>{([['Servings', 'servings'], ['Prep (min)', 'prepTime'], ['Cook (min)', 'cookTime']] as const).map(([label, key]) => <View key={key} style={{ flex: 1 }}><Body size={11} color={t.muted} style={{ marginBottom: 6 }}>{label}</Body><TextInput value={draft[key]} onChangeText={(value) => setDraft((d) => ({ ...d, [key]: value }))} keyboardType="number-pad" placeholder="—" placeholderTextColor={t.muted} style={input} /></View>)}</View>
          <Body size={12} color={t.muted} style={{ marginTop: 20, marginBottom: 6 }}>Source URL</Body><TextInput value={draft.sourceUrl} onChangeText={(sourceUrl) => setDraft((d) => ({ ...d, sourceUrl }))} autoCapitalize="none" placeholder="https://…" placeholderTextColor={t.muted} style={input} />
          <Body size={12} color={t.muted} style={{ marginTop: 18, marginBottom: 6 }}>Original creator</Body><TextInput value={draft.creatorName} onChangeText={(creatorName) => setDraft((d) => ({ ...d, creatorName }))} placeholder="Optional" placeholderTextColor={t.muted} style={input} />
          <Body size={12} color={t.muted} style={{ marginTop: 18, marginBottom: 6 }}>Author’s notes</Body><TextInput value={draft.authorNotes} onChangeText={(authorNotes) => setDraft((d) => ({ ...d, authorNotes }))} multiline textAlignVertical="top" placeholder="Optional" placeholderTextColor={t.muted} style={[input, { minHeight: 84 }]} />
          {suggestedTags.length > 0 && <View style={{ marginTop: 20 }}><Body size={12} color={t.muted} style={{ marginBottom: 9 }}>Suggested tags — choose any you want</Body><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{suggestedTags.map((tag) => { const selected = selectedTags.has(tag.name); return <Pressable key={tag.name} onPress={() => setSelectedTags((current) => { const next = new Set(current); selected ? next.delete(tag.name) : next.add(tag.name); return next; })} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: selected ? t.green : t.border, backgroundColor: selected ? t.greenLight : t.card }}><Body size={12} color={selected ? t.green : t.text}>{tag.emoji} {tag.name}{selected ? ' ✓' : ''}</Body></Pressable>; })}</View></View>}
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 22 }}><Button label="Skip" variant="secondary" onPress={() => go('finish')} style={{ flex: 1 }} /><Button label="Review" variant="filled" onPress={() => go('finish')} style={{ flex: 1 }} /></View>
        </>}

        {step === 'finish' && <>
          <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, overflow: 'hidden' }}>{previewImage && <Image source={{ uri: previewImage }} style={{ width: '100%', height: 200 }} contentFit="cover" />}<View style={{ padding: 18 }}><Eyebrow style={{ marginBottom: 7 }}>{selectedTags.size ? [...selectedTags].join(' · ') : 'New recipe'}</Eyebrow><Serif size={28}>{draft.title}</Serif>{!!draft.description && <Body size={14} color={t.textSoft} style={{ lineHeight: 20, marginTop: 9 }}>{draft.description}</Body>}<View style={{ flexDirection: 'row', gap: 14, marginTop: 15 }}><Body size={12} color={t.muted}>{draft.ingredients.filter((i) => i.item.trim()).length} ingredients</Body><Body size={12} color={t.muted}>{draft.steps.filter((s) => s.instruction.trim()).length} steps</Body>{!!draft.servings && <Body size={12} color={t.muted}>Serves {draft.servings}</Body>}</View></View></View>
          <Pressable onPress={() => setShowOriginal((value) => !value)} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 14, marginTop: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Body size={13} weight="semi">Original paste</Body><Ionicons name={showOriginal ? 'chevron-up' : 'chevron-down'} size={17} color={t.muted} /></View>{showOriginal && <Body size={13} color={t.muted} style={{ lineHeight: 20, marginTop: 12 }}>{paste}</Body>}</Pressable>
          <Button label="Save recipe" variant="filled" full loading={busy} disabled={!valid} icon={<Ionicons name="checkmark" size={18} color={t.onGreen} />} onPress={save} style={{ marginTop: 18 }} />
        </>}
      </Animated.View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
