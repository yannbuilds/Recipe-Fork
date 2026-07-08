import { Ionicons } from '@expo/vector-icons';
import type { Ingredient, Recipe, Step } from '@recipe-aggregator/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Divider, Eyebrow, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

interface Props {
  recipeId?: string;
}

interface IngRow {
  quantity: string;
  unit: string;
  item: string;
}

export default function RecipeFormScreen({ recipeId }: Props) {
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
  const [sourceUrl, setSourceUrl] = useState('');
  const [servings, setServings] = useState('');
  const [prep, setPrep] = useState('');
  const [cook, setCook] = useState('');
  const [ingredients, setIngredients] = useState<IngRow[]>([{ quantity: '', unit: '', item: '' }]);
  const [steps, setSteps] = useState<string[]>(['']);

  useEffect(() => {
    if (!recipeId) return;
    (async () => {
      const { data } = await supabase.from('recipes').select('*').eq('id', recipeId).single();
      if (data) {
        const r = data as Recipe;
        setTitle(r.title);
        setDescription(r.description ?? '');
        setImageUrl(r.image_url ?? '');
        setSourceUrl(r.source_url ?? '');
        setServings(r.servings != null ? String(r.servings) : '');
        setPrep(r.prep_time != null ? String(r.prep_time) : '');
        setCook(r.cook_time != null ? String(r.cook_time) : '');
        setIngredients(
          r.ingredients.length > 0
            ? r.ingredients.map((i) => ({ quantity: i.quantity, unit: i.unit, item: i.item }))
            : [{ quantity: '', unit: '', item: '' }],
        );
        const sorted = [...r.steps].sort((a, b) => a.order - b.order).map((s) => s.instruction);
        setSteps(sorted.length > 0 ? sorted : ['']);
      }
      setLoading(false);
    })();
  }, [recipeId]);

  async function save() {
    if (!title.trim() || !user) return;
    setSaving(true);
    const cleanIngredients: Ingredient[] = ingredients
      .filter((i) => i.item.trim())
      .map((i) => ({ quantity: i.quantity.trim(), unit: i.unit.trim(), item: i.item.trim() }));
    const cleanSteps: Step[] = steps
      .filter((s) => s.trim())
      .map((s, idx) => ({ order: idx + 1, instruction: s.trim() }));

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      source_url: sourceUrl.trim() || '',
      servings: servings ? Number(servings) : null,
      prep_time: prep ? Number(prep) : null,
      cook_time: cook ? Number(cook) : null,
      ingredients: cleanIngredients,
      steps: cleanSteps,
    };

    if (recipeId) {
      await supabase.from('recipes').update(payload).eq('id', recipeId);
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setSaving(false);
      router.back();
    } else {
      const { data } = await supabase
        .from('recipes')
        .insert({ ...payload, user_id: user.id, is_favourite: false })
        .select('id')
        .single();
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setSaving(false);
      if (data) router.replace({ pathname: '/recipe/[id]', params: { id: data.id } });
      else router.back();
    }
  }

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
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

        {label('Image URL')}
        <TextInput value={imageUrl} onChangeText={setImageUrl} placeholder="https://…" placeholderTextColor={t.muted} autoCapitalize="none" style={inputStyle} />

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

        <Divider style={{ marginTop: 24 }} />
        <Serif size={20} style={{ marginTop: 18, marginBottom: 4 }}>
          Ingredients
        </Serif>
        {ingredients.map((ing, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <TextInput
              value={ing.quantity}
              onChangeText={(v) => setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, quantity: v } : x)))}
              placeholder="Qty"
              placeholderTextColor={t.muted}
              style={[inputStyle, { width: 56 }]}
            />
            <TextInput
              value={ing.unit}
              onChangeText={(v) => setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, unit: v } : x)))}
              placeholder="Unit"
              placeholderTextColor={t.muted}
              style={[inputStyle, { width: 64 }]}
            />
            <TextInput
              value={ing.item}
              onChangeText={(v) => setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, item: v } : x)))}
              placeholder="Ingredient"
              placeholderTextColor={t.muted}
              style={[inputStyle, { flex: 1 }]}
            />
            <Pressable onPress={() => setIngredients((prev) => prev.filter((_, xi) => xi !== i))} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={t.muted} />
            </Pressable>
          </View>
        ))}
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
        {steps.map((step, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
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
        ))}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
