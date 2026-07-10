import { View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
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

// Confirmation prompt, rendered as the standard bottom sheet (no centered
// dialogs anywhere in the app).
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
    <BottomSheet open={open} onClose={onCancel}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
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
      </View>
    </BottomSheet>
  );
}
