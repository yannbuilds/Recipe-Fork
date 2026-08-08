import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, type LayoutChangeEvent } from 'react-native';

/**
 * A list row that leaves the list on its own. When `leaving` flips true the row
 * fades and collapses to nothing, so what's below slides up instead of jumping.
 *
 * The natural height is measured once from layout — React Native can't animate
 * to or from 'auto', so there's nothing to interpolate towards without it.
 */
export default function SettlingRow({
  leaving,
  duration = 380,
  children,
}: {
  leaving: boolean;
  duration?: number;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!leaving) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration,
      easing: Easing.out(Easing.quad),
      // Height isn't a native-driver property.
      useNativeDriver: false,
    }).start();
  }, [leaving, duration, progress]);

  function measure(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    // Only the resting height counts — later passes are the collapse itself.
    if (height == null && h > 0) setHeight(h);
  }

  return (
    <Animated.View
      onLayout={measure}
      style={[
        { opacity: progress, overflow: 'hidden' },
        leaving && height != null ? { height: Animated.multiply(progress, height) } : null,
      ]}
    >
      {children}
    </Animated.View>
  );
}
