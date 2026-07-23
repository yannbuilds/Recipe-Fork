import { Ionicons } from '@expo/vector-icons';
import type { Cookbook, Recipe } from '@recipe-aggregator/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import ConfirmModal from '@/components/ConfirmModal';
import CookbookFormModal from '@/components/CookbookFormModal';
import RecipeCard from '@/components/RecipeCard';
import RecipePickerSheet from '@/components/RecipePickerSheet';
import { Body, Button, Eyebrow, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

const RECIPE_SELECT =
  'id, user_id, title, image_url, prep_time, cook_time, servings, is_favourite, created_at, ingredients';

type RecipeItem = Pick<
  Recipe,
  'id' | 'user_id' | 'title' | 'image_url' | 'prep_time' | 'cook_time' | 'servings' | 'is_favourite' | 'created_at'
>;

interface Data {
  cookbook: Cookbook;
  recipes: RecipeItem[];
}

async function fetchDetail(id: string): Promise<Data> {
  const [cbRes, crRes] = await Promise.all([
    supabase
      .from('cookbooks')
      .select('id, user_id, name, description, emoji, cover_recipe_id, sort_order, created_at, updated_at')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('cookbook_recipes').select(`recipe_id, recipes(${RECIPE_SELECT})`).eq('cookbook_id', id),
  ]);
  if (cbRes.error || !cbRes.data) throw new Error(cbRes.error?.message ?? 'Cookbook not found');
  const recipes = ((crRes.data ?? []) as unknown as { recipes: RecipeItem | RecipeItem[] | null }[])
    .map((r) => (Array.isArray(r.recipes) ? r.recipes[0] : r.recipes))
    .filter((r): r is RecipeItem => !!r)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { cookbook: cbRes.data as Cookbook, recipes };
}

export default function CookbookDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, familyMembers, user } = useAuth();

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ['cookbook', id],
    queryFn: () => fetchDetail(id),
    enabled: !!session && !!id,
  });

  const familyOwnerNames = new Map<string, string>();
  for (const m of familyMembers) {
    if (m.user_id !== user?.id && m.profile?.display_name) familyOwnerNames.set(m.user_id, m.profile.display_name);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['cookbook', id] });
    queryClient.invalidateQueries({ queryKey: ['cookbooks'] });
  }

  async function addRecipe(recipeId: string) {
    await supabase.from('cookbook_recipes').insert({ cookbook_id: id, recipe_id: recipeId });
    invalidate();
  }

  async function handleDelete() {
    setShowDelete(false);
    haptics.success();
    await supabase.from('cookbooks').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['cookbooks'] });
    router.back();
  }

  if (!session) return <Redirect href="/sign-in" />;

  const cookbook = data?.cookbook;
  const recipes = data?.recipes ?? [];

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: t.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="book-outline" size={22} color={t.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Eyebrow>Cookbook</Eyebrow>
          <Serif size={28} style={{ marginTop: 6, lineHeight: 32 }}>
            {cookbook?.name ?? 'Cookbook'}
          </Serif>
          {cookbook?.description ? (
            <Body size={14} color={t.muted} style={{ marginTop: 4 }}>
              {cookbook.description}
            </Body>
          ) : null}
          <Mono size={10} style={{ marginTop: 6 }}>
            {recipes.length === 1 ? '1 RECIPE' : `${recipes.length} RECIPES`}
          </Mono>
        </View>
        {cookbook && (
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: t.border,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.card,
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={t.muted} />
          </Pressable>
        )}
      </View>

      {menuOpen && (
        <View
          style={{
            alignSelf: 'flex-end',
            marginTop: 6,
            backgroundColor: t.card,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 10,
            width: 160,
            overflow: 'hidden',
          }}
        >
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              setShowEdit(true);
            }}
            style={{ paddingVertical: 11, paddingHorizontal: 14 }}
          >
            <Body size={14}>Edit</Body>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              setShowDelete(true);
            }}
            style={{ paddingVertical: 11, paddingHorizontal: 14 }}
          >
            <Body size={14} color={t.red}>
              Delete
            </Body>
          </Pressable>
        </View>
      )}

      {cookbook && (
        <Button
          label="Add recipe"
          variant="filled"
          full
          style={{ marginTop: 14 }}
          icon={<Ionicons name="add" size={16} color={t.onGreen} />}
          onPress={() => setShowAdd(true)}
        />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: cookbook?.name ?? 'Cookbook' }} />
      <FlatList
        data={isPending ? [] : recipes}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 14, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 18, paddingBottom: 32 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          isPending ? null : (
            <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
              <Ionicons name="file-tray-outline" size={40} color={t.muted} />
              <Serif size={19} style={{ marginTop: 14 }}>
                {error ? 'Something went wrong' : 'No recipes here yet'}
              </Serif>
              <Body size={14} color={t.muted} style={{ marginTop: 4, textAlign: 'center' }}>
                {error ? error.message : 'Add recipes to fill this cookbook.'}
              </Body>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            <RecipeCard recipe={item} ownerName={familyOwnerNames.get(item.user_id)} />
          </View>
        )}
      />

      {cookbook && (
        <>
          <CookbookFormModal
            open={showEdit}
            cookbook={cookbook}
            recipes={recipes}
            onClose={() => setShowEdit(false)}
            onSaved={invalidate}
          />
          <RecipePickerSheet
            open={showAdd}
            title={`Add to ${cookbook.name}`}
            existingIds={new Set(recipes.map((r) => r.id))}
            onPick={(r) => addRecipe(r.id)}
            onClose={() => setShowAdd(false)}
          />
        </>
      )}
      <ConfirmModal
        open={showDelete}
        title="Delete cookbook?"
        message="This removes the cookbook but does not delete the recipes inside it."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </View>
  );
}
