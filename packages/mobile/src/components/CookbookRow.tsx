import { Ionicons } from '@expo/vector-icons';
import type { Cookbook } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { View } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { Body, Mono, Serif } from '@/components/ui';
import { useTheme } from '@/lib/theme';

interface Props {
  cookbook: Cookbook;
  recipeCount: number;
  coverImages: string[]; // up to 4
  index?: number;
  onPress: () => void;
  /** Gutter to line the row up with whatever it's listed inside. */
  gutter?: number;
  /** Show the reorder grip beside the entry number. */
  reorderable?: boolean;
  /** True while this row is the one being carried. */
  lifted?: boolean;
  onLongPress?: () => void;
  onPressOut?: () => void;
  delayLongPress?: number;
}

// Editorial "shelf" row — mirrors the web CookbookCard (Pie Keeper Screen 02).
// Index · name · count, a 4-across photo strip under a hairline, then a
// description · "Open →" footer.
export default function CookbookRow({
  cookbook,
  recipeCount,
  coverImages,
  index = 0,
  onPress,
  gutter = 16,
  reorderable = false,
  lifted = false,
  onLongPress,
  onPressOut,
  delayLongPress,
}: Props) {
  const t = useTheme();
  const slots = [0, 1, 2, 3].map((i) => coverImages[i] ?? null);

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={delayLongPress}
      scaleTo={0.985}
      style={{ paddingHorizontal: gutter }}
    >
      {/* Title row: grip · index · name · count */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        {reorderable && (
          // On the paper beside the entry number, where it stays legible —
          // over the photo strip it vanished into the pictures. Flush with the
          // card's left spine, so the entry reads as indented behind it.
          <View
            pointerEvents="none"
            style={{
              alignSelf: 'center',
              width: 14,
              marginRight: -4,
              alignItems: 'center',
              opacity: lifted ? 1 : 0.4,
            }}
          >
            <Ionicons name="reorder-two-outline" size={15} color={lifted ? t.green : t.muted} />
          </View>
        )}
        <Serif size={14} italic color={t.green}>
          {String(index + 1).padStart(2, '0')}.
        </Serif>
        <Serif size={22} numberOfLines={1} style={{ flex: 1 }}>
          {cookbook.name}
        </Serif>
        <Mono size={10} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {recipeCount} {recipeCount === 1 ? 'recipe' : 'recipes'}
        </Mono>
      </View>

      {/* Photo strip — 4 across, like cookbook plates */}
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          borderTopWidth: 1,
          borderTopColor: t.border,
          paddingTop: 10,
        }}
      >
        {slots.map((src, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              aspectRatio: 1,
              borderRadius: 3,
              overflow: 'hidden',
              backgroundColor: t.paper3,
            }}
          >
            {src ? (
              <Image
                source={{ uri: src }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
                recyclingKey={src}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                <Ionicons name="restaurant-outline" size={18} color={t.muted} />
              </View>
            )}
            {/* Inset hairline, matching the web card's inner ring */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 3,
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.06)',
              }}
            />
          </View>
        ))}
      </View>

      {/* Footer: description · Open → */}
      <View
        style={{
          marginTop: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Serif size={13} italic color={t.muted} numberOfLines={1} style={{ flex: 1 }}>
          {cookbook.description || ' '}
        </Serif>
        <Body size={12} color={t.text} style={{ textDecorationLine: 'underline' }}>
          Open →
        </Body>
      </View>
    </PressableScale>
  );
}
