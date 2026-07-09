import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { FALLBACK_EMOJI, getIngredientImageUrl } from '@/lib/ingredientImages';

// Small ingredient thumbnail from the Supabase bucket, with an emoji fallback
// when the image 404s (many ingredients have no matching image).
export default function IngredientIcon({ item, size = 34 }: { item: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed || !item) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.6 }}>{FALLBACK_EMOJI}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: getIngredientImageUrl(item) }}
      style={{ width: size, height: size, borderRadius: 6 }}
      contentFit="contain"
      onError={() => setFailed(true)}
      transition={120}
      cachePolicy="memory-disk"
      recyclingKey={item}
    />
  );
}
