import type { Recipe } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Mono, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

const RECIPE_SELECT =
  'id, user_id, title, image_url, prep_time, cook_time, servings, is_favourite, created_at, ingredients';

type Item = Pick<Recipe, 'id' | 'title' | 'image_url' | 'prep_time' | 'cook_time' | 'servings'>;

interface Props {
  open: boolean;
  title?: string;
  existingIds: Set<string>;
  onPick: (recipe: Item) => void;
  onClose: () => void;
}

export default function RecipePickerSheet({ open, title = 'Add a recipe', existingIds, onPick, onClose }: Props) {
  const t = useTheme();
  const [recipes, setRecipes] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setAdded(new Set());
    setSearch('');
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('recipes')
        .select(RECIPE_SELECT)
        .order('created_at', { ascending: false });
      setRecipes((data ?? []) as unknown as Item[]);
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => !existingIds.has(r.id) && !added.has(r.id) && (!q || r.title.toLowerCase().includes(q)));
  }, [recipes, search, existingIds, added]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Serif size={18} weight="semi">
          {title}
        </Serif>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search recipes…"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 11,
            color: t.text,
            fontFamily: font.sans,
            fontSize: 15,
            backgroundColor: t.bg,
          }}
        />

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 28 }} color={t.green} />
        ) : (
          <ScrollView style={{ maxHeight: 380, marginTop: 12 }}>
            {filtered.length === 0 && (
              <Body size={14} color={t.muted} style={{ paddingVertical: 20, textAlign: 'center' }}>
                No recipes to add.
              </Body>
            )}
            {filtered.map((r) => {
              const meta = (r.prep_time ?? 0) + (r.cook_time ?? 0);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    haptics.success();
                    onPick(r);
                    setAdded((prev) => new Set(prev).add(r.id));
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 8,
                  }}
                >
                  {r.image_url ? (
                    <Image
                      source={{ uri: r.image_url }}
                      style={{ width: 52, height: 52, borderRadius: 6 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={r.id}
                    />
                  ) : (
                    <View style={{ width: 52, height: 52, borderRadius: 6, backgroundColor: t.paper3 }} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Serif size={16} numberOfLines={1}>
                      {r.title}
                    </Serif>
                    {(meta > 0 || r.servings != null) && (
                      <Mono size={10} style={{ marginTop: 2 }}>
                        {meta > 0 ? `${meta} MIN` : ''}
                        {meta > 0 && r.servings != null ? '  ·  ' : ''}
                        {r.servings != null ? `${r.servings} SERVES` : ''}
                      </Mono>
                    )}
                  </View>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      borderWidth: 1,
                      borderColor: t.green,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Body size={18} color={t.green}>
                      +
                    </Body>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}
