import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

// Brand green — matches app.json splash backgroundColor so there is no visible
// seam between the native splash and this animated boot screen.
const BOOT_GREEN = '#2f5440';
const CREAM = '#f5efe2';

interface Props {
  /** When true, the boot screen fades away and unmounts. */
  ready: boolean;
}

// Full-screen branded loader shown while fonts + auth hydrate. Deliberately
// uses no custom fonts (they may not be loaded yet) and RN's Animated API so it
// works before any provider is mounted.
export default function BootScreen({ ready }: Props) {
  const [gone, setGone] = useState(false);
  const fade = useRef(new Animated.Value(0)).current; // content fade-in
  const rise = useRef(new Animated.Value(12)).current; // wordmark rise
  const pulse = useRef(new Animated.Value(0)).current; // logo breathing
  const cover = useRef(new Animated.Value(1)).current; // whole-screen fade-out

  // Entrance + looping pulse.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fade, rise, pulse]);

  // Cross-fade out once the app is ready. Small floor delay so the mark is
  // seen even on a warm start rather than flickering past.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      Animated.timing(cover, {
        toValue: 0,
        duration: 420,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setGone(true));
    }, 350);
    return () => clearTimeout(timer);
  }, [ready, cover]);

  if (gone) return null;

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.root, { opacity: cover }]}
    >
      <Animated.View style={{ opacity: fade, alignItems: 'center', transform: [{ translateY: rise }] }}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Image
            source={require('../../assets/images/splash-icon.png')}
            style={styles.mark}
            resizeMode="contain"
          />
        </Animated.View>
        <Text style={styles.wordmark}>PIE KEEPER</Text>
        <Text style={styles.tagline}>Your kitchen, saved</Text>
      </Animated.View>

      <Animated.View style={[styles.dot, { opacity: dotOpacity }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: BOOT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 104,
    height: 104,
    marginBottom: 22,
  },
  wordmark: {
    color: CREAM,
    fontSize: 15,
    letterSpacing: 5,
    fontWeight: '600',
  },
  tagline: {
    color: 'rgba(245,239,226,0.6)',
    fontSize: 12,
    letterSpacing: 1.5,
    marginTop: 8,
  },
  dot: {
    position: 'absolute',
    bottom: 72,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: CREAM,
  },
});
