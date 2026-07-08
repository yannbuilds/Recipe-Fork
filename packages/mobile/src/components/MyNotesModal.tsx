import { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Serif } from '@/components/ui';
import { stripHtml } from '@/lib/text';
import { font, useTheme } from '@/lib/theme';

interface Props {
  open: boolean;
  content: string | null;
  saving: boolean;
  onSave: (text: string) => void;
  onClose: () => void;
}

export default function MyNotesModal({ open, content, saving, onSave, onClose }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  useEffect(() => {
    if (open) setText(stripHtml(content ?? ''));
  }, [open, content]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: t.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Serif size={18} weight="semi">
              My notes
            </Serif>
            <Body size={12} color={t.muted}>
              {saving ? 'Saving…' : ''}
            </Body>
          </View>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              onSave(v);
            }}
            placeholder="Add your notes about this recipe…"
            placeholderTextColor={t.muted}
            multiline
            style={{
              marginTop: 12,
              minHeight: 140,
              maxHeight: 260,
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              lineHeight: 22,
              color: t.text,
              fontFamily: font.sans,
              textAlignVertical: 'top',
            }}
          />
          <Button label="Done" variant="filled" onPress={onClose} full style={{ marginTop: 14 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
