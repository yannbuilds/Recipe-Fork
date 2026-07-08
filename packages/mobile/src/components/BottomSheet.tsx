import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

// Simple modal bottom sheet: dimmed backdrop, rounded card sliding up from the
// bottom, drag handle, tap-outside to dismiss. Content scrolls if it overflows.
export default function BottomSheet({ open, onClose, children }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

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
            paddingBottom: insets.bottom + 16,
            maxHeight: '86%',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.border }} />
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
