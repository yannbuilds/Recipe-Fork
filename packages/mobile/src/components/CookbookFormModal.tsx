import type { Cookbook } from '@recipe-aggregator/shared';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Button, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

const EMOJI_CHOICES = ['📖', '🍝', '🥗', '🍰', '🍜', '🌮', '🍔', '🥘', '🍲', '🥧', '🔥', '🌱', '🥩', '🐟', '🍚'];

interface Props {
  open: boolean;
  cookbook?: Cookbook | null;
  onClose: () => void;
  onSaved: (cb: Cookbook) => void;
}

export default function CookbookFormModal({ open, cookbook, onClose, onSaved }: Props) {
  const t = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('📖');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(cookbook?.name ?? '');
      setDescription(cookbook?.description ?? '');
      setEmoji(cookbook?.emoji ?? '📖');
    }
  }, [open, cookbook]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    if (cookbook) {
      const { data } = await supabase
        .from('cookbooks')
        .update({ name: trimmed, description: description.trim() || null, emoji })
        .eq('id', cookbook.id)
        .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
        .single();
      if (data) onSaved(data as Cookbook);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data } = await supabase
          .from('cookbooks')
          .insert({ user_id: uid, name: trimmed, description: description.trim() || null, emoji })
          .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
          .single();
        if (data) onSaved(data as Cookbook);
      }
    }
    setSaving(false);
    haptics.success();
    onClose();
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.bg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: t.text,
    fontFamily: font.sans,
  } as const;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Serif size={18} weight="semi">
          {cookbook ? 'Edit cookbook' : 'New cookbook'}
        </Serif>

        <Body size={12} color={t.muted} style={{ marginTop: 16, marginBottom: 6 }}>
          Emoji
        </Body>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {EMOJI_CHOICES.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEmoji(e)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: emoji === e ? t.green : t.border,
                backgroundColor: emoji === e ? t.greenLight : t.bg,
              }}
            >
              <Body size={22}>{e}</Body>
            </Pressable>
          ))}
        </ScrollView>

        <Body size={12} color={t.muted} style={{ marginTop: 16, marginBottom: 6 }}>
          Name
        </Body>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Weeknight dinners"
          placeholderTextColor={t.muted}
          style={inputStyle}
          autoFocus={!cookbook}
        />

        <Body size={12} color={t.muted} style={{ marginTop: 12, marginBottom: 6 }}>
          Description (optional)
        </Body>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What's this collection about?"
          placeholderTextColor={t.muted}
          style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]}
          multiline
        />

        <Button
          label={cookbook ? 'Save changes' : 'Create cookbook'}
          variant="filled"
          full
          loading={saving}
          disabled={!name.trim()}
          onPress={handleSave}
          style={{ marginTop: 18 }}
        />
      </View>
    </BottomSheet>
  );
}
