import { Modal, Pressable, View } from 'react-native';
import { Body, Button, Serif } from '@/components/ui';
import { useTheme } from '@/lib/theme';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTheme();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: t.card, borderRadius: 16, padding: 22, width: '100%', maxWidth: 400 }}
        >
          <Serif size={19} weight="semi">
            {title}
          </Serif>
          <Body size={14} color={t.textSoft} style={{ marginTop: 8, lineHeight: 20 }}>
            {message}
          </Body>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
            <Button
              label={confirmLabel}
              variant={danger ? 'danger' : 'filled'}
              onPress={onConfirm}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
