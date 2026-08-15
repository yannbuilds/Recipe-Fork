import { Ionicons } from '@expo/vector-icons';
import { findRecipeWithSameSource, normalizeRecipeSourceUrl } from '@recipe-aggregator/shared/recipeSource';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Button, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { saveTags } from '@/lib/saveTags';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

type Step = 'choose' | 'url' | 'photo' | 'processing' | 'error';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

interface Props {
  open: boolean;
  onClose: () => void;
}

async function findExistingRecipe(sourceUrl: string): Promise<{ id: string } | undefined> {
  const { data, error } = await supabase.from('recipes').select('id, source_url');
  if (error) throw new Error(error.message);
  return findRecipeWithSameSource(data ?? [], sourceUrl);
}

// The "Add a recipe" chooser + URL import, hosted in the standard bottom sheet
// so it hugs its content and drags to dismiss like every other sheet.
export default function AddRecipeSheet({ open, onClose }: Props) {
  const t = useTheme();
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [url, setUrl] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [status, setStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorReturnStep, setErrorReturnStep] = useState<Step>('url');

  // Always reopen on the chooser step with a clean slate.
  useEffect(() => {
    if (open) {
      setStep('choose');
      setUrl('');
      setPhotos([]);
      setStatus('');
      setErrorMsg('');
    }
  }, [open]);

  // Close the sheet, then navigate once it's out of the way.
  function closeThen(go: () => void) {
    onClose();
    setTimeout(go, 250);
  }

  function goManual() {
    closeThen(() => router.push('/recipe/new'));
  }

  function showError(message: string, returnStep: Step) {
    haptics.error();
    setErrorMsg(message);
    setErrorReturnStep(returnStep);
    setStep('error');
  }

  function appendPhotos(assets: ImagePicker.ImagePickerAsset[]) {
    const available = MAX_PHOTOS - photos.length;
    const selected = assets.slice(0, available);
    const oversized = selected.find((asset) => (asset.fileSize ?? 0) > MAX_PHOTO_BYTES);
    if (oversized) {
      showError(`${oversized.fileName ?? 'That photo'} is larger than 20 MB.`, 'photo');
      return;
    }
    setPhotos((current) => [...current, ...selected]);
  }

  async function choosePhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.8,
      orderedSelection: true,
    });
    if (!result.canceled) appendPhotos(result.assets);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showError('Camera access is needed to photograph a recipe.', 'photo');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) appendPhotos(result.assets);
  }

  async function functionErrorMessage(error: { context?: unknown; message?: string }, fallback: string) {
    try {
      if (error.context instanceof Response) {
        const clone = error.context.clone();
        try {
          const body = await clone.json();
          return body?.error || fallback;
        } catch {
          return await error.context.text() || fallback;
        }
      }
      return error.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function handlePhotoImport() {
    if (photos.length === 0) return;
    setStep('processing');
    setStatus('Uploading photos…');
    const uploadedPaths: string[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!session || !userId) throw new Error('Please sign in to scan recipes');

      for (let index = 0; index < photos.length; index++) {
        setStatus(`Uploading photo ${index + 1} of ${photos.length}…`);
        const photo = photos[index];
        const bytes = await fetch(photo.uri).then((response) => response.arrayBuffer());
        if (bytes.byteLength > MAX_PHOTO_BYTES) {
          throw new Error(`${photo.fileName ?? `Photo ${index + 1}`} is larger than 20 MB.`);
        }
        const mimeType = photo.mimeType || 'image/jpeg';
        const extensionFromName = photo.fileName?.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const extension = extensionFromName || mimeType.split('/')[1] || 'jpg';
        const path = `${userId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('recipe-scans')
          .upload(path, bytes, { contentType: mimeType, upsert: false });
        if (uploadError) throw new Error(`Could not upload photo ${index + 1}: ${uploadError.message}`);
        uploadedPaths.push(path);
      }

      setStatus('Reading your recipe…');
      const { data, error } = await supabase.functions.invoke('import-recipe-photo', {
        body: { paths: uploadedPaths },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw new Error(await functionErrorMessage(error, 'Failed to scan recipe'));
      if (data?.error) throw new Error(data.error);
      if (!data?.recipe) throw new Error('No recipe was found in those photos');

      setStatus('Saving recipe…');
      const { data: saved, error: saveError } = await supabase
        .from('recipes')
        .insert({ ...data.recipe, user_id: userId, is_favourite: false })
        .select('id')
        .single();
      if (saveError || !saved) throw new Error(saveError?.message ?? 'Failed to save recipe');

      await saveTags(saved.id, data.tags ?? []).catch(() => {});
      haptics.success();
      closeThen(() => router.push({ pathname: '/recipe/[id]', params: { id: saved.id } }));
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Something went wrong', 'photo');
    } finally {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('recipe-scans').remove(uploadedPaths).catch(() => {});
      }
    }
  }

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      showError('Please enter a valid URL (e.g. https://example.com/recipe)', 'url');
      return;
    }

    setStep('processing');
    setStatus('Checking for duplicates…');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || !session) throw new Error('Please sign in to import recipes');

      const normalizedUrl = normalizeRecipeSourceUrl(trimmed);
      const existing = await findExistingRecipe(normalizedUrl);
      if (existing) {
        closeThen(() => router.push({ pathname: '/recipe/[id]', params: { id: existing.id } }));
        return;
      }

      setStatus('Cooking recipe…');
      const { data, error } = await supabase.functions.invoke('import-recipe', {
        body: { url: normalizedUrl },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw new Error(error.message || 'Failed to import recipe');
      if (data?.error) throw new Error(data.error);

      const { recipe, tags } = data;
      const canonicalUrl =
        typeof recipe?.source_url === 'string' ? recipe.source_url : normalizedUrl;
      const canonicalDuplicate = await findExistingRecipe(canonicalUrl);
      if (canonicalDuplicate) {
        closeThen(() => router.push({ pathname: '/recipe/[id]', params: { id: canonicalDuplicate.id } }));
        return;
      }

      setStatus('Saving recipe…');
      const { data: saved, error: saveError } = await supabase
        .from('recipes')
        .insert({
          ...recipe,
          source_url: normalizeRecipeSourceUrl(canonicalUrl),
          user_id: userId,
          is_favourite: false,
        })
        .select('id')
        .single();
      if (saveError || !saved) throw new Error(saveError?.message ?? 'Failed to save recipe');

      await saveTags(saved.id, tags ?? []).catch(() => {});
      haptics.success();
      closeThen(() => router.push({ pathname: '/recipe/[id]', params: { id: saved.id } }));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong', 'url');
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        {step === 'choose' && (
          <>
            <Serif size={20} weight="semi" style={{ textAlign: 'center', marginBottom: 20 }}>
              Add a recipe
            </Serif>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { icon: 'share-social-outline' as const, title: 'From a link', sub: 'Web, Instagram, TikTok + more', onPress: () => setStep('url') },
                { icon: 'images-outline' as const, title: 'From photos', sub: 'Scan pages or cards', onPress: () => setStep('photo') },
                { icon: 'create-outline' as const, title: 'Paste or type', sub: 'Drop everything in at once', onPress: goManual },
              ].map((opt) => (
                <Pressable
                  key={opt.title}
                  onPress={opt.onPress}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: 7,
                    paddingVertical: 20,
                    paddingHorizontal: 7,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: t.border,
                  }}
                >
                  <Ionicons name={opt.icon} size={28} color={t.green} />
                  <Serif size={14} weight="semi" style={{ textAlign: 'center' }}>
                    {opt.title}
                  </Serif>
                  <Body size={12} color={t.muted} style={{ textAlign: 'center' }}>
                    {opt.sub}
                  </Body>
                </Pressable>
              ))}
            </View>
            <Button label="Cancel" variant="secondary" full onPress={onClose} style={{ marginTop: 18 }} />
          </>
        )}

        {step === 'photo' && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Pressable onPress={() => setStep('choose')} hitSlop={8}>
                <Ionicons name="arrow-back" size={20} color={t.muted} />
              </Pressable>
              <Serif size={18} weight="semi">
                Scan a recipe
              </Serif>
            </View>
            <Body size={12} color={t.muted} style={{ marginBottom: 14 }}>
              Add up to 5 clear photos in page order. Include the title, ingredients, and full method.
            </Body>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label="Camera roll"
                variant="secondary"
                onPress={choosePhotos}
                disabled={photos.length >= MAX_PHOTOS}
                style={{ flex: 1 }}
              />
              <Button
                label="Take photo"
                variant="secondary"
                onPress={takePhoto}
                disabled={photos.length >= MAX_PHOTOS}
                style={{ flex: 1 }}
              />
            </View>
            {photos.length > 0 && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 9, paddingTop: 4, paddingRight: 8 }}>
                    {photos.map((photo, index) => (
                      <View key={`${photo.uri}-${index}`}>
                        <Image
                          source={{ uri: photo.uri }}
                          style={{ width: 72, height: 72, borderRadius: 9, borderWidth: 1, borderColor: t.border }}
                          resizeMode="cover"
                        />
                        <Pressable
                          onPress={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}
                          hitSlop={6}
                          style={{ position: 'absolute', right: -4, top: -4, borderRadius: 12, backgroundColor: t.red }}
                        >
                          <Ionicons name="close" size={18} color="#fff" />
                        </Pressable>
                        <View
                          style={{ position: 'absolute', left: 4, bottom: 4, minWidth: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: 'rgba(0,0,0,.65)' }}
                        >
                          <Body size={11} color="#fff" style={{ textAlign: 'center' }}>{index + 1}</Body>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <Button
                  label={photos.length === 1 ? 'Scan photo' : `Scan ${photos.length} photos`}
                  variant="filled"
                  full
                  onPress={handlePhotoImport}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </>
        )}

        {step === 'url' && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Pressable onPress={() => setStep('choose')}>
                <Ionicons name="arrow-back" size={20} color={t.muted} />
              </Pressable>
              <Serif size={18} weight="semi">
                Import from a link
              </Serif>
            </View>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="Paste a recipe or social post URL…"
              placeholderTextColor={t.muted}
              autoCapitalize="none"
              keyboardType="url"
              autoFocus
              onSubmitEditing={handleImport}
              style={{
                borderWidth: 1,
                borderColor: t.border,
                backgroundColor: t.bg,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 13,
                fontSize: 15,
                color: t.text,
                fontFamily: font.sans,
              }}
            />
            <Button
              label="Import recipe"
              variant="filled"
              full
              disabled={!url.trim()}
              onPress={handleImport}
              style={{ marginTop: 12 }}
            />
          </>
        )}

        {step === 'processing' && (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 16 }}>
            <ActivityIndicator size="large" color={t.green} />
            <Body size={14} color={t.muted}>
              {status}
            </Body>
          </View>
        )}

        {step === 'error' && (
          <View style={{ paddingVertical: 12 }}>
            <Body size={14} color={t.red} style={{ textAlign: 'center', marginBottom: 8 }}>
              {errorMsg}
            </Body>
            {errorMsg.includes('fetch') && (
              <Body size={12} color={t.muted} style={{ textAlign: 'center', marginBottom: 12 }}>
                Some sites block automated requests. Try the Pie Keeper Chrome extension instead.
              </Body>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
              <Button label="Try again" variant="filled" onPress={() => setStep(errorReturnStep)} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
