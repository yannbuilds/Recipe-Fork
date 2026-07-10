import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';

/* ── Screen-on glow ─────────────────────────────────────────────
   Native answer to the web's `.rd-screen-on-frame`: a soft halo hugging
   every screen edge while keep-awake is active, so it's obvious the phone
   won't sleep. Web uses a blurred yellow band; here it's a green→orange
   blend (the palette's own accents) built from four fading edge bands —
   green on the top/left, orange on the bottom/right — so the frame reads as
   a diagonal green-to-orange wash. Breathes with a gentle opacity pulse,
   matching the web's "warm light" movement. RN Animated only (Expo Go safe). */

const THICKNESS = 96; // how far each edge glow bleeds inward

// hex (#rrggbb) → rgba() string at the given alpha
function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function ScreenOnGlow({ active }: { active: boolean }) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0)).current; // 0 → dim, 1 → bright

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  if (!active) return null;

  // gentle breathing between 0.65 and 1 — the "little movement"
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });

  const green = t.green;
  const orange = t.orange;
  const edge = 0.55; // strength at the very edge
  const fade: [number, number] = [0, 1];

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity }]}
      pointerEvents="none"
      accessible={false}
    >
      {/* Top — green, fading downward */}
      <LinearGradient
        colors={[rgba(green, edge), rgba(green, 0)]}
        locations={fade}
        style={[styles.band, { top: 0, left: 0, right: 0, height: THICKNESS }]}
      />
      {/* Left — green, fading rightward */}
      <LinearGradient
        colors={[rgba(green, edge), rgba(green, 0)]}
        locations={fade}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.band, { top: 0, bottom: 0, left: 0, width: THICKNESS }]}
      />
      {/* Bottom — orange, fading upward */}
      <LinearGradient
        colors={[rgba(orange, 0), rgba(orange, edge)]}
        locations={fade}
        style={[styles.band, { bottom: 0, left: 0, right: 0, height: THICKNESS }]}
      />
      {/* Right — orange, fading leftward */}
      <LinearGradient
        colors={[rgba(orange, 0), rgba(orange, edge)]}
        locations={fade}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.band, { top: 0, bottom: 0, right: 0, width: THICKNESS }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute' },
});
