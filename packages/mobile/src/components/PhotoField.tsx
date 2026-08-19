import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Platform, Pressable, View } from 'react-native';
import { Body } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

interface Props {
  /** A photo picked in this session, not yet uploaded. */
  asset: ImagePicker.ImagePickerAsset | null;
  /** The photo already on the recipe, or '' when there isn't one. */
  url: string;
  onPick: (asset: ImagePicker.ImagePickerAsset) => void;
  onRemove: () => void;
  onError?: (message: string) => void;
  height?: number;
}

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * The one way a photo gets onto a recipe: camera or library, replace, remove.
 * No URL box — imported recipes still carry a remote image_url, it just shows
 * as the current photo rather than as text to edit.
 */
export default function PhotoField({ asset, url, onPick, onRemove, onError, height = 230 }: Props) {
  const t = useTheme();
  const preview = asset?.uri || url.trim();

  async function pick(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { onError?.('Camera access is needed to take a photo.'); return; }
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled) return;
      const picked = result.assets[0];
      if ((picked.fileSize ?? 0) > MAX_BYTES) { onError?.('Choose a photo smaller than 20 MB.'); return; }
      haptics.success();
      onPick(picked);
    } catch {
      onError?.('Could not open the photo picker.');
    }
  }

  // One sheet for every photo action, so there is a single button on the card
  // instead of a row of them. Remove only appears when there is a photo to lose.
  function openSheet() {
    haptics.light();
    const labels = ['Take photo', 'Choose from library'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: preview ? [...labels, 'Remove photo', 'Cancel'] : [...labels, 'Cancel'],
          destructiveButtonIndex: preview ? 2 : undefined,
          cancelButtonIndex: preview ? 3 : 2,
          title: preview ? 'Replace photo' : 'Add a photo',
        },
        (index) => {
          if (index === 0) pick(true);
          else if (index === 1) pick(false);
          else if (index === 2 && preview) onRemove();
        },
      );
      return;
    }
    Alert.alert(preview ? 'Replace photo' : 'Add a photo', undefined, [
      { text: labels[0], onPress: () => pick(true) },
      { text: labels[1], onPress: () => pick(false) },
      ...(preview ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: onRemove }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  if (!preview) {
    return (
      <Pressable
        onPress={openSheet}
        style={({ pressed }) => ({
          height,
          borderRadius: 14,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: pressed ? t.green : t.border,
          backgroundColor: pressed ? t.greenLight : t.card,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
        })}
      >
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.warm, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="image-outline" size={22} color={t.muted} />
        </View>
        <Body size={15} weight="semi">Add a photo</Body>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="camera-outline" size={13} color={t.muted} />
          <Body size={12} color={t.muted}>Take one or choose from your library</Body>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ height, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: t.border, backgroundColor: t.warm }}>
      <Image source={{ uri: preview }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={preview} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, alignItems: 'flex-end' }}>
        <Pressable
          onPress={openSheet}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.28)',
            backgroundColor: pressed ? 'rgba(24,20,16,0.82)' : 'rgba(24,20,16,0.6)',
          })}
        >
          <Ionicons name="sync-outline" size={14} color="#fbf8f1" />
          <Body size={13} weight="semi" color="#fbf8f1">Replace photo</Body>
        </Pressable>
      </View>
    </View>
  );
}
