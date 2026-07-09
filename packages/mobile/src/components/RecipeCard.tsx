import { Ionicons } from '@expo/vector-icons';
import type { Recipe } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import FavouriteButton from '@/components/FavouriteButton';
import PressableScale from '@/components/PressableScale';
import { Mono, Serif } from '@/components/ui';
import { useTheme } from '@/lib/theme';

interface Props {
  recipe: Pick<
    Recipe,
    'id' | 'user_id' | 'title' | 'image_url' | 'prep_time' | 'cook_time' | 'servings' | 'is_favourite'
  >;
  onToggleFavourite?: (id: string, next: boolean) => void;
  ownerName?: string;
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Editorial recipe card — 4:5 photo with hairline, serif caption below.
export default function RecipeCard({ recipe, onToggleFavourite, ownerName }: Props) {
  const t = useTheme();
  const router = useRouter();
  const totalTime =
    recipe.prep_time != null && recipe.cook_time != null
      ? recipe.prep_time + recipe.cook_time
      : (recipe.prep_time ?? recipe.cook_time ?? null);

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
    >
      {/* Photo */}
      <View
        style={{
          position: 'relative',
          aspectRatio: 4 / 5,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: t.paper3,
        }}
      >
        {recipe.image_url ? (
          <Image
            source={{ uri: recipe.image_url }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={recipe.id}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="restaurant-outline" size={32} color={t.muted} />
          </View>
        )}

        {/* Hairline */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.08)',
          }}
        />

        {/* Owner badge */}
        {ownerName && (
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 4,
              backgroundColor: 'rgba(251,248,241,0.92)',
            }}
          >
            <View
              style={{
                width: 15,
                height: 15,
                borderRadius: 999,
                backgroundColor: t.greenLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Mono size={8} color={t.greenDeep}>
                {ownerName[0]?.toUpperCase()}
              </Mono>
            </View>
            <Mono size={9} color={t.text}>
              {ownerName.toUpperCase()}
            </Mono>
          </View>
        )}

        {/* Favourite */}
        {onToggleFavourite && (
          <View style={{ position: 'absolute', top: 8, right: 8 }}>
            <FavouriteButton
              recipeId={recipe.id}
              isFavourite={recipe.is_favourite}
              onToggle={(v) => onToggleFavourite(recipe.id, v)}
              size="sm"
            />
          </View>
        )}
      </View>

      {/* Caption */}
      <View style={{ marginTop: 8 }}>
        <Serif size={17} numberOfLines={2} style={{ lineHeight: 20 }}>
          {recipe.title}
        </Serif>
        {(totalTime != null || recipe.servings != null) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
            {totalTime != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="time-outline" size={11} color={t.muted} />
                <Mono size={10} style={{ letterSpacing: 0.6 }}>
                  {formatTime(totalTime).toUpperCase()}
                </Mono>
              </View>
            )}
            {totalTime != null && recipe.servings != null && (
              <Mono size={10}>·</Mono>
            )}
            {recipe.servings != null && (
              <Mono size={10} style={{ letterSpacing: 0.6 }}>
                {recipe.servings} SERVES
              </Mono>
            )}
          </View>
        )}
      </View>
    </PressableScale>
  );
}
