import { Ionicons } from '@expo/vector-icons';
import type { Cookbook } from '@recipe-aggregator/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CookbookFormModal from '@/components/CookbookFormModal';
import { Body, Eyebrow, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type CookbookListItem = Cookbook & { recipeCount: number; coverImages: string[] };

type CookbookImageRow = {
  cookbook_id: string;
  recipes:
    | { image_url: string | null; created_at: string }
    | { image_url: string | null; created_at: string }[]
    | null;
};

async function fetchCookbooks(): Promise<CookbookListItem[]> {
  const { data: cookbooks, error } = await supabase
    .from('cookbooks')
    .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const list = (cookbooks ?? []) as Cookbook[];
  if (list.length === 0) return [];

  const ids = list.map((c) => c.id);
  const { data: rows } = await supabase
    .from('cookbook_recipes')
    .select('cookbook_id, recipes(image_url, created_at)')
    .in('cookbook_id', ids);

  const counts: Record<string, number> = {};
  const images: Record<string, { url: string; created_at: string }[]> = {};
  for (const row of (rows ?? []) as unknown as CookbookImageRow[]) {
    counts[row.cookbook_id] = (counts[row.cookbook_id] ?? 0) + 1;
    const rec = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
    if (rec?.image_url) {
      images[row.cookbook_id] = images[row.cookbook_id] ?? [];
      images[row.cookbook_id].push({ url: rec.image_url, created_at: rec.created_at });
    }
  }

  return list.map((c) => ({
    ...c,
    recipeCount: counts[c.id] ?? 0,
    coverImages: (images[c.id] ?? [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4)
      .map((x) => x.url),
  }));
}

function CoverCollage({ images, emoji }: { images: string[]; emoji: string | null }) {
  const t = useTheme();
  if (images.length === 0) {
    return (
      <View style={{ width: 96, height: 96, backgroundColor: t.paper3, alignItems: 'center', justifyContent: 'center' }}>
        <Body size={30}>{emoji ?? '📖'}</Body>
      </View>
    );
  }
  return (
    <View style={{ width: 96, height: 96, flexDirection: 'row', flexWrap: 'wrap', backgroundColor: t.paper3 }}>
      {images.slice(0, 4).map((url, i) => (
        <Image
          key={`${url}-${i}`}
          source={{ uri: url }}
          style={{ width: images.length === 1 ? '100%' : '50%', height: images.length <= 2 ? '100%' : '50%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={url}
        />
      ))}
    </View>
  );
}

export default function CookbooksScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['cookbooks'],
    queryFn: fetchCookbooks,
    enabled: !!session,
  });

  const cookbooks = data ?? [];
  const total = cookbooks.length;
  const subtitle = isPending
    ? 'Loading your cookbooks…'
    : total === 0
      ? 'No cookbooks yet — create one to start grouping recipes.'
      : total === 1
        ? '1 cookbook in your collection.'
        : `${total} cookbooks in your collection.`;

  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, marginBottom: 8 }}>
      <Eyebrow>The shelves</Eyebrow>
      <Serif size={34} style={{ marginTop: 10, lineHeight: 36 }}>
        Cookbooks
        {profile?.display_name ? (
          <>
            {', '}
            <Serif size={34} italic color={t.green}>
              {profile.display_name}
            </Serif>
          </>
        ) : (
          ''
        )}
      </Serif>
      <Body size={14.5} color={t.textSoft} style={{ marginTop: 10 }}>
        {subtitle}
      </Body>
    </View>
  );

  const newButton = (
    <Pressable
      onPress={() => setShowCreate(true)}
      style={{
        marginHorizontal: 16,
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 18,
        paddingHorizontal: 18,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: t.green,
        borderRadius: 4,
      }}
    >
      <Ionicons name="add" size={18} color={t.green} />
      <Serif size={16} italic color={t.green}>
        New cookbook
      </Serif>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={cookbooks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24, gap: 14 }}
        ListHeaderComponent={header}
        ListFooterComponent={!isPending ? newButton : null}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={t.green} />}
        ListEmptyComponent={
          !isPending && error ? (
            <Body color={t.red} style={{ textAlign: 'center', padding: 24 }}>
              {error.message}
            </Body>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/cookbook/[id]', params: { id: item.id } })}
            style={({ pressed }) => ({
              marginHorizontal: 16,
              flexDirection: 'row',
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: 10,
              overflow: 'hidden',
              backgroundColor: t.card,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <CoverCollage images={item.coverImages} emoji={item.emoji} />
            <View style={{ flex: 1, padding: 14, justifyContent: 'center', gap: 4 }}>
              <Serif size={19} numberOfLines={2}>
                {item.emoji ? `${item.emoji} ` : ''}
                {item.name}
              </Serif>
              {item.description ? (
                <Body size={13} color={t.muted} numberOfLines={2}>
                  {item.description}
                </Body>
              ) : null}
              <Mono size={10} style={{ marginTop: 2 }}>
                {item.recipeCount === 1 ? '1 RECIPE' : `${item.recipeCount} RECIPES`}
              </Mono>
            </View>
          </Pressable>
        )}
      />

      <CookbookFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['cookbooks'] });
        }}
      />
    </View>
  );
}
