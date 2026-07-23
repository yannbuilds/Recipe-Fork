import type { Cookbook } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Button, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

// Default cover glyph kept for the DB column; no longer shown in the UI
// (matches web — cookbook covers use recipe photos with a line-icon fallback).
const DEFAULT_COVER = '📖';

interface Props {
  open: boolean;
  cookbook?: Cookbook | null;
  // Recipes in the cookbook (edit mode) — offered as cover choices.
  recipes?: { id: string; title: string; image_url: string | null }[];
  onClose: () => void;
  onSaved: (cb: Cookbook) => void;
}

export default function CookbookFormModal({ open, cookbook, recipes, onClose, onSaved }: Props) {
  const t = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverRecipeId, setCoverRecipeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(cookbook?.name ?? '');
      setDescription(cookbook?.description ?? '');
      setCoverRecipeId(cookbook?.cover_recipe_id ?? null);
    }
  }, [open, cookbook]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    if (cookbook) {
      const { data } = await supabase
        .from('cookbooks')
        .update({ name: trimmed, description: description.trim() || null, cover_recipe_id: coverRecipeId })
        .eq('id', cookbook.id)
        .select('id, user_id, name, description, emoji, cover_recipe_id, sort_order, created_at, updated_at')
        .single();
      if (data) onSaved(data as Cookbook);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data } = await supabase
          .from('cookbooks')
          .insert({ user_id: uid, name: trimmed, description: description.trim() || null, emoji: DEFAULT_COVER })
          .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
          .single();
        if (data) onSaved(data as Cookbook);
      }
    }
    setSaving(false);
    haptics.success();
    onClose();
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.bg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: t.text,
    fontFamily: font.sans,
  } as const;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Serif size={18} weight="semi">
          {cookbook ? 'Edit cookbook' : 'New cookbook'}
        </Serif>

        {cookbook && recipes?.some((r) => r.image_url) ? (
          <>
            <Body size={12} color={t.muted} style={{ marginTop: 16, marginBottom: 6 }}>
              Cover
            </Body>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                onPress={() => setCoverRecipeId(null)}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: coverRecipeId === null ? t.green : t.border,
                  backgroundColor: coverRecipeId === null ? t.greenLight : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Body size={11} weight="semi" color={coverRecipeId === null ? t.green : t.muted}>
                  Auto
                </Body>
              </Pressable>
              {recipes!
                .filter((r) => r.image_url)
                .map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => setCoverRecipeId(r.id)}
                    style={{
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: coverRecipeId === r.id ? t.green : 'transparent',
                    }}
                  >
                    <Image
                      source={{ uri: r.image_url! }}
                      style={{ width: 52, height: 52, borderRadius: 8 }}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                      recyclingKey={r.image_url!}
                    />
                  </Pressable>
                ))}
            </ScrollView>
            <Body size={11} color={t.muted} style={{ marginTop: 6 }}>
              Shown next to the cookbook when saving a recipe.
            </Body>
          </>
        ) : null}

        <Body size={12} color={t.muted} style={{ marginTop: 16, marginBottom: 6 }}>
          Name
        </Body>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Weeknight dinners"
          placeholderTextColor={t.muted}
          style={inputStyle}
          autoFocus={!cookbook}
        />

        <Body size={12} color={t.muted} style={{ marginTop: 12, marginBottom: 6 }}>
          Description (optional)
        </Body>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What's this collection about?"
          placeholderTextColor={t.muted}
          style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]}
          multiline
        />

        <Button
          label={cookbook ? 'Save changes' : 'Create cookbook'}
          variant="filled"
          full
          loading={saving}
          disabled={!name.trim()}
          onPress={handleSave}
          style={{ marginTop: 18 }}
        />
      </View>
    </BottomSheet>
  );
}
