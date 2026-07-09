import { type ReactNode, useRef } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface Props {
  children: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  /** How far to shrink on press. 0.96 is a gentle default. */
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
}

// A Pressable that springs its content down slightly on touch — the tactile
// "give" that makes native taps feel alive. Built on RN's Animated so it needs
// no reanimated/worklets babel setup.
export default function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled,
  scaleTo = 0.96,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => spring(scaleTo)}
      onPressOut={() => spring(1)}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}
