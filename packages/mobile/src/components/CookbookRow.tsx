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
}

// Editorial "shelf" row — mirrors the web CookbookCard (Pie Keeper Screen 02).
// Index · name · count, a 4-across photo strip under a hairline, then a
// description · "Open →" footer.
export default function CookbookRow({ cookbook, recipeCount, coverImages, index = 0, onPress }: Props) {
  const t = useTheme();
  const slots = [0, 1, 2, 3].map((i) => coverImages[i] ?? null);

  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={{ paddingHorizontal: 16 }}>
      {/* Title row: index · name · count */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
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
