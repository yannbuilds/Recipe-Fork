import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Keyboard, Modal, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

const SCREEN_H = Dimensions.get('window').height;

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Fraction of the screen the sheet may grow to before its body scrolls. */
  maxHeightRatio?: number;
}

// The one standard bottom sheet for the whole app.
//
// Behaviour (matches every consumer, no modals anywhere else):
//  - Hugs its content: a two-button sheet is short, a long list grows until it
//    hits `maxHeightRatio` of the screen and then scrolls inside.
//  - Grab the handle and drag down to dismiss (past a threshold or with a
//    flick); short drags spring back.
//  - Backdrop tap and the Android back button also dismiss.
//  - Smooth spring in, timed slide out — deliberately unhurried so it reads as a
//    surface moving, not a flash.
export default function BottomSheet({ open, onClose, children, maxHeightRatio = 0.9 }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  // Keep the Modal mounted through the close animation so the slide-out is
  // actually visible; `open` drives the animation, `mounted` the Modal.
  const [mounted, setMounted] = useState(open);
  const [kbHeight, setKbHeight] = useState(0);
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetH = useRef(0);

  // Lift the sheet above the keyboard so inputs (cookbook name, notes, etc.)
  // aren't hidden behind it. iOS fires the *Will* events for a smooth ride.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const settle = () => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 240,
        mass: 0.9,
      }),
      Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (open) {
      setMounted(true);
      translateY.setValue(SCREEN_H);
      // Wait a frame so the Modal is on screen before we animate it up.
      requestAnimationFrame(settle);
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SCREEN_H, duration: 240, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Drag lives on the top grab strip only, so a scrollable body still scrolls.
  // We claim the gesture the instant a finger lands on the strip (it never needs
  // to scroll), which makes the pull feel immediate instead of finicky.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 2,
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        // A short pull OR a downward flick dismisses; otherwise snap back.
        if (g.dy > 80 || g.vy > 0.4) {
          haptics.light();
          onClose(); // parent flips `open`; the effect runs the slide-out
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 24,
            stiffness: 240,
            mass: 0.9,
          }).start();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  return (
    <Modal visible transparent onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop fills the whole screen (behind the keyboard too). */}
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: '#000',
          opacity: backdrop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Sheet sits at the bottom, lifted above the keyboard when it's open.
          box-none lets taps fall through to the backdrop except on the sheet. */}
      <View
        pointerEvents="box-none"
        style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: kbHeight }}
      >
        <Animated.View
          onLayout={(e) => {
            sheetH.current = e.nativeEvent.layout.height;
          }}
          style={{
            transform: [{ translateY }],
            backgroundColor: t.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: kbHeight > 0 ? 16 : insets.bottom + 16,
            // Cap at the screen ratio, but never taller than the room left above
            // the keyboard, so a lifted sheet can't slide off the top.
            maxHeight: Math.min(SCREEN_H * maxHeightRatio, SCREEN_H - kbHeight - insets.top - 8),
          }}
        >
          {/* Top grab strip — a generous full-width target for drag-to-dismiss. */}
          <View {...pan.panHandlers} style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 20 }}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: t.border }} />
          </View>

          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
