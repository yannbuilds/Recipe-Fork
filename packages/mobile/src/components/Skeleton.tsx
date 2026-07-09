import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsDark, useTheme } from '@/lib/theme';

/* ── Shimmer block ──────────────────────────────────────────────
   A rounded placeholder with a light sweep moving across it. Used to
   compose skeleton layouts while real content loads. */
export function Shimmer({
  width,
  height,
  radius = 6,
  style,
}: {
  width?: number | `${number}%`;
  height: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const isDark = useIsDark();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: [-w, w],
  });

  const highlight = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)';

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: t.paper3,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {w > 0 && (
        <Animated.View
          style={{
            width: w,
            height: '100%',
            transform: [{ translateX }],
          }}
        >
          <LinearGradient
            colors={['transparent', highlight, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

/* ── Recipe card skeleton ───────────────────────────────────────
   Mirrors the RecipeCard layout: 4:5 photo, title line, meta line. */
export function RecipeCardSkeleton() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ aspectRatio: 4 / 5, borderRadius: 4, overflow: 'hidden' }}>
        <Shimmer width="100%" height="100%" radius={4} />
      </View>
      <View style={{ marginTop: 10, gap: 7 }}>
        <Shimmer width="90%" height={13} radius={4} />
        <Shimmer width="55%" height={13} radius={4} />
        <Shimmer width="40%" height={9} radius={3} style={{ marginTop: 2 }} />
      </View>
    </View>
  );
}

/* ── Cookbook row skeleton ──────────────────────────────────────
   Mirrors the cookbook list row: square cover + two text lines. */
function CookbookRowSkeleton() {
  const t = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 16,
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: t.card,
      }}
    >
      <Shimmer width={96} height={96} radius={0} />
      <View style={{ flex: 1, padding: 14, justifyContent: 'center', gap: 9 }}>
        <Shimmer width="70%" height={16} radius={4} />
        <Shimmer width="90%" height={11} radius={4} />
        <Shimmer width="35%" height={9} radius={3} style={{ marginTop: 2 }} />
      </View>
    </View>
  );
}

export function CookbookListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CookbookRowSkeleton key={i} />
      ))}
    </View>
  );
}

/* A two-column grid of card skeletons for list screens. */
export function RecipeGridSkeleton({ count = 6 }: { count?: number }) {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += 2) rows.push([i, i + 1].filter((n) => n < count));
  return (
    <View style={{ gap: 18, paddingHorizontal: 16 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 14 }}>
          {row.map((c) => (
            <RecipeCardSkeleton key={c} />
          ))}
          {row.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}
