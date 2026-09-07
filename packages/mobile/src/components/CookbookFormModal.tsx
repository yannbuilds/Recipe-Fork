import type { Cookbook } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import PhotoField from '@/components/PhotoField';
import { Body, Button, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

// Default cover glyph kept for the DB column; no longer shown in the UI
// (matches web — cookbook covers use recipe photos with a line-icon fallback).
const DEFAULT_COVER = '📖';
const COVER_BUCKET = 'cookbook-covers';

function coverStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${COVER_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;
  try {
    return decodeURIComponent(url.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

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
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverImageAsset, setCoverImageAsset] = useState<ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(cookbook?.name ?? '');
      setDescription(cookbook?.description ?? '');
      setCoverRecipeId(cookbook?.cover_recipe_id ?? null);
      setCoverImageUrl(cookbook?.cover_image_url ?? '');
      setCoverImageAsset(null);
      setError(null);
    }
  }, [open, cookbook]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    if (cookbook) {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      let uploadedPath: string | null = null;
      let nextCoverImageUrl = coverImageUrl.trim() || null;

      if (coverImageAsset) {
        if (!uid) {
          setError('Sign in again to upload a cover.');
          setSaving(false);
          return;
        }
        try {
          const bytes = await fetch(coverImageAsset.uri).then((response) => response.arrayBuffer());
          const mime = coverImageAsset.mimeType || 'image/jpeg';
          const extension =
            coverImageAsset.fileName?.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() ||
            mime.split('/')[1] ||
            'jpg';
          uploadedPath = `${uid}/${cookbook.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from(COVER_BUCKET)
            .upload(uploadedPath, bytes, { contentType: mime, upsert: false });
          if (uploadError) throw uploadError;
          nextCoverImageUrl = supabase.storage.from(COVER_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
        } catch (uploadError) {
          setError(uploadError instanceof Error ? `Could not upload the cover: ${uploadError.message}` : 'Could not upload the cover.');
          setSaving(false);
          return;
        }
      }

      const { data, error: updateError } = await supabase
        .from('cookbooks')
        .update({
          name: trimmed,
          description: description.trim() || null,
          cover_recipe_id: coverRecipeId,
          cover_image_url: nextCoverImageUrl,
        })
        .eq('id', cookbook.id)
        .select('id, user_id, name, description, emoji, cover_recipe_id, cover_image_url, sort_order, created_at, updated_at')
        .single();
      if (updateError) {
        if (uploadedPath) await supabase.storage.from(COVER_BUCKET).remove([uploadedPath]);
        setError(updateError.message);
        setSaving(false);
        return;
      }

      const previousPath = coverStoragePath(cookbook.cover_image_url);
      if (previousPath && cookbook.cover_image_url !== nextCoverImageUrl) {
        await supabase.storage.from(COVER_BUCKET).remove([previousPath]);
      }
      if (data) onSaved(data as Cookbook);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data } = await supabase
          .from('cookbooks')
          .insert({ user_id: uid, name: trimmed, description: description.trim() || null, emoji: DEFAULT_COVER })
          .select('id, user_id, name, description, emoji, cover_recipe_id, cover_image_url, sort_order, created_at, updated_at')
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4 }}
      >
        <Serif size={18} weight="semi">
          {cookbook ? 'Edit cookbook' : 'New cookbook'}
        </Serif>

        {cookbook ? (
          <>
            <Body size={12} color={t.muted} style={{ marginTop: 16, marginBottom: 6 }}>
              Cover image
            </Body>
            <PhotoField
              asset={coverImageAsset}
              url={coverImageUrl}
              height={150}
              onPick={(asset) => {
                setCoverImageAsset(asset);
                setCoverRecipeId(null);
                setError(null);
              }}
              onRemove={() => {
                setCoverImageAsset(null);
                setCoverImageUrl('');
                setCoverRecipeId(null);
              }}
              onError={setError}
            />

            {recipes?.some((r) => r.image_url) ? (
              <>
                <Body size={11} color={t.muted} style={{ marginTop: 12, marginBottom: 7 }}>
                  Or use a recipe photo
                </Body>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      setCoverImageAsset(null);
                      setCoverImageUrl('');
                      setCoverRecipeId(null);
                    }}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderStyle: 'dashed',
                      borderColor: !coverImageAsset && !coverImageUrl && coverRecipeId === null ? t.green : t.border,
                      backgroundColor: !coverImageAsset && !coverImageUrl && coverRecipeId === null ? t.greenLight : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Body size={11} weight="semi" color={!coverImageAsset && !coverImageUrl && coverRecipeId === null ? t.green : t.muted}>
                      Auto
                    </Body>
                  </Pressable>
                  {recipes
                    .filter((r) => r.image_url)
                    .map((r) => (
                      <Pressable
                        key={r.id}
                        onPress={() => {
                          setCoverImageAsset(null);
                          setCoverImageUrl('');
                          setCoverRecipeId(r.id);
                        }}
                        style={{
                          borderRadius: 10,
                          borderWidth: 2,
                          borderColor: !coverImageAsset && !coverImageUrl && coverRecipeId === r.id ? t.green : 'transparent',
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
              </>
            ) : null}
            <Body size={11} color={t.muted} style={{ marginTop: 6 }}>
              Used on your cookbook shelf and when saving a recipe.
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

        {error ? (
          <Body size={13} color={t.red} style={{ marginTop: 12 }}>
            {error}
          </Body>
        ) : null}

        <Button
          label={cookbook ? 'Save changes' : 'Create cookbook'}
          variant="filled"
          full
          loading={saving}
          disabled={!name.trim()}
          onPress={handleSave}
          style={{ marginTop: 18 }}
        />
      </ScrollView>
    </BottomSheet>
  );
}
