import { Ionicons } from '@expo/vector-icons';
import type { Cookbook } from '@recipe-aggregator/shared';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, TextInput, View } from 'react-native';
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

interface Toast {
  key: number;
  text: string;
  kind: 'added' | 'removed' | 'error';
}

export default function AddToCookbookSheet({ open, recipeId, onClose }: Props) {
  const t = useTheme();
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // Slide the toast in, hold, fade it out. Re-tapping re-runs the entrance so
  // rapid saves each get their own beat of confirmation.
  useEffect(() => {
    if (!toast) return;
    toastAnim.setValue(0);
    Animated.spring(toastAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 20,
      stiffness: 300,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(
        () => setToast(null),
      );
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

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
    const name = cookbooks.find((cb) => cb.id === cookbookId)?.name ?? 'cookbook';
    if (isMember) haptics.light();
    else haptics.success();
    setMemberOf((prev) => {
      const next = new Set(prev);
      if (isMember) next.delete(cookbookId);
      else next.add(cookbookId);
      return next;
    });
    const { error } = isMember
      ? await supabase
          .from('cookbook_recipes')
          .delete()
          .eq('cookbook_id', cookbookId)
          .eq('recipe_id', recipeId)
      : await supabase.from('cookbook_recipes').insert({ cookbook_id: cookbookId, recipe_id: recipeId });
    if (error) {
      // Revert the optimistic tick — never leave a tick that lied.
      haptics.error();
      setMemberOf((prev) => {
        const next = new Set(prev);
        if (isMember) next.add(cookbookId);
        else next.delete(cookbookId);
        return next;
      });
      setToast({ key: Date.now(), kind: 'error', text: 'Couldn’t save – try again' });
    } else {
      setToast({
        key: Date.now(),
        kind: isMember ? 'removed' : 'added',
        text: isMember ? `Removed from ${name}` : `Added to ${name}`,
      });
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
      const { error } = await supabase
        .from('cookbook_recipes')
        .insert({ cookbook_id: cb.id, recipe_id: recipeId });
      if (error) {
        haptics.error();
        setToast({ key: Date.now(), kind: 'error', text: 'Couldn’t save – try again' });
      } else {
        setMemberOf((prev) => new Set(prev).add(cb.id));
        haptics.success();
        setToast({ key: Date.now(), kind: 'added', text: `Added to ${cb.name}` });
      }
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
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: t.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="book-outline" size={16} color={t.green} />
                  </View>
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

        {/* Save confirmation toast — floats over the list, never blocks taps. */}
        {toast && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              bottom: 68,
              alignItems: 'center',
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                maxWidth: '100%',
                backgroundColor:
                  toast.kind === 'added' ? t.greenSolid : toast.kind === 'error' ? t.red : t.text,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }}
            >
              {toast.kind === 'added' && (
                <Ionicons name="checkmark-circle" size={16} color={t.onGreen} />
              )}
              {toast.kind === 'error' && (
                <Ionicons name="alert-circle" size={16} color="#fff" />
              )}
              <Body
                size={13}
                weight="semi"
                numberOfLines={1}
                color={toast.kind === 'removed' ? t.card : toast.kind === 'added' ? t.onGreen : '#fff'}
              >
                {toast.text}
              </Body>
            </View>
          </Animated.View>
        )}
      </View>
    </BottomSheet>
  );
}
