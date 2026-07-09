import type { Cookbook } from '@recipe-aggregator/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Button, CheckSquare, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

interface Props {
  open: boolean;
  recipeId: string;
  onClose: () => void;
}

export default function AddToCookbookSheet({ open, recipeId, onClose }: Props) {
  const t = useTheme();
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [cbRes, crRes] = await Promise.all([
        supabase
          .from('cookbooks')
          .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase.from('cookbook_recipes').select('cookbook_id').eq('recipe_id', recipeId),
      ]);
      if (cancelled) return;
      setCookbooks((cbRes.data as Cookbook[]) ?? []);
      setMemberOf(new Set(((crRes.data ?? []) as { cookbook_id: string }[]).map((r) => r.cookbook_id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, recipeId]);

  async function toggle(cookbookId: string) {
    const isMember = memberOf.has(cookbookId);
    if (isMember) haptics.light();
    else haptics.success();
    setMemberOf((prev) => {
      const next = new Set(prev);
      if (isMember) next.delete(cookbookId);
      else next.add(cookbookId);
      return next;
    });
    if (isMember) {
      await supabase
        .from('cookbook_recipes')
        .delete()
        .eq('cookbook_id', cookbookId)
        .eq('recipe_id', recipeId);
    } else {
      await supabase.from('cookbook_recipes').insert({ cookbook_id: cookbookId, recipe_id: recipeId });
    }
  }

  async function createCookbook() {
    const name = newName.trim();
    if (!name) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from('cookbooks')
      .insert({ user_id: uid, name })
      .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
      .single();
    if (data) {
      const cb = data as Cookbook;
      setCookbooks((prev) => [cb, ...prev]);
      await supabase.from('cookbook_recipes').insert({ cookbook_id: cb.id, recipe_id: recipeId });
      setMemberOf((prev) => new Set(prev).add(cb.id));
      haptics.success();
    }
    setNewName('');
    setCreating(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Serif size={18} weight="semi">
          Save to cookbook
        </Serif>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={t.green} />
        ) : (
          <ScrollView style={{ maxHeight: 320, marginTop: 12 }}>
            {cookbooks.length === 0 && (
              <Body size={14} color={t.muted} style={{ paddingVertical: 16, textAlign: 'center' }}>
                No cookbooks yet.
              </Body>
            )}
            {cookbooks.map((cb) => {
              const checked = memberOf.has(cb.id);
              return (
                <Pressable
                  key={cb.id}
                  onPress={() => toggle(cb.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 11,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: checked ? t.green : 'transparent',
                    backgroundColor: checked ? t.greenLight : 'transparent',
                    marginBottom: 4,
                  }}
                >
                  <Body size={20}>{cb.emoji ?? '📖'}</Body>
                  <Body size={14} weight="semi" style={{ flex: 1 }}>
                    {cb.name}
                  </Body>
                  <CheckSquare checked={checked} size={20} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {creating ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Cookbook name"
              placeholderTextColor={t.muted}
              autoFocus
              onSubmitEditing={createCookbook}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: t.border,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 11,
                color: t.text,
                fontFamily: font.sans,
                fontSize: 15,
              }}
            />
            <Button label="Add" variant="filled" onPress={createCookbook} />
          </View>
        ) : (
          <Button
            label="+ New cookbook"
            variant="primary"
            full
            style={{ marginTop: 12 }}
            onPress={() => setCreating(true)}
          />
        )}
      </View>
    </BottomSheet>
  );
}
