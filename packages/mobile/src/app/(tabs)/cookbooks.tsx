import { Ionicons } from '@expo/vector-icons';
import type { Cookbook } from '@recipe-aggregator/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CookbookFormModal from '@/components/CookbookFormModal';
import { CookbookListSkeleton } from '@/components/Skeleton';
import SortableCookbookList from '@/components/SortableCookbookList';
import { Body, Eyebrow, Serif } from '@/components/ui';
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

export default function CookbooksScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

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
        : `${total} cookbooks in your collection · hold anywhere on a shelf to reorder.`;

  // Drop lands: show the new order straight away, then write the positions.
  async function saveOrder(next: CookbookListItem[]) {
    const previous = queryClient.getQueryData<CookbookListItem[]>(['cookbooks']) ?? cookbooks;
    const renumbered = next.map((cb, i) => ({ ...cb, sort_order: i }));
    setOrderError(null);
    queryClient.setQueryData(['cookbooks'], renumbered);

    // Only the rows that actually moved need writing.
    const updates = renumbered.filter((cb, i) => previous[i]?.id !== cb.id);
    const results = await Promise.all(
      updates.map((cb) =>
        supabase.from('cookbooks').update({ sort_order: cb.sort_order }).eq('id', cb.id),
      ),
    );

    if (results.some((r) => r.error)) {
      queryClient.setQueryData(['cookbooks'], previous);
      setOrderError('Could not save the new order. Please try again.');
    }
  }

  const header = (
    <>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 20 }}>
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

        {orderError && (
          <Body color={t.red} size={13} style={{ marginTop: 12 }}>
            {orderError}
          </Body>
        )}
      </View>

      {/* Outside the masthead's gutter — both already carry their own. */}
      {isPending && <CookbookListSkeleton count={4} />}
      {error && (
        <Body color={t.red} style={{ textAlign: 'center', paddingHorizontal: 16, paddingBottom: 24 }}>
          {error.message}
        </Body>
      )}
    </>
  );

  const newButton = (
    <Pressable
      onPress={() => setShowCreate(true)}
      style={{
        marginHorizontal: 16,
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
      <SortableCookbookList
        cookbooks={cookbooks}
        header={header}
        footer={!isPending ? newButton : null}
        refreshing={isRefetching}
        onRefresh={refetch}
        onOpen={(id) => router.push({ pathname: '/cookbook/[id]', params: { id } })}
        onReorder={saveOrder}
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
