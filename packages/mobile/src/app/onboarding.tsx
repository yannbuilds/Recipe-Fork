import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Eyebrow, Serif } from '@/components/ui';
import { useOnboarding } from '@/context/OnboardingContext';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  italic: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'bookmark-outline',
    eyebrow: 'Save',
    title: 'Every recipe,',
    italic: 'none of the noise',
    body: 'Clip any recipe from the web and keep just the parts that matter — ingredients, steps, done. No life stories, no pop-ups.',
  },
  {
    icon: 'calendar-outline',
    eyebrow: 'Plan',
    title: 'Plan the week,',
    italic: 'shop in one tap',
    body: 'Drop meals onto your week and Pie Keeper builds the shopping list for you — combined, categorised, ready for the store.',
  },
  {
    icon: 'flame-outline',
    eyebrow: 'Cook',
    title: 'Cook hands-free,',
    italic: 'stay in flow',
    body: 'Scale servings on the fly, tick off steps as you go, and the screen stays awake while you cook. Share it all with family.',
  },
];

export default function OnboardingScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { markSeen } = useOnboarding();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  function finish() {
    haptics.success();
    markSeen();
    router.replace('/sign-in');
  }

  function next() {
    if (isLast) return finish();
    haptics.select();
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  function skip() {
    haptics.light();
    finish();
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Skip */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 6,
          right: 16,
          zIndex: 10,
        }}
      >
        {!isLast && (
          <Pressable hitSlop={12} onPress={skip} style={{ padding: 8 }}>
            <Body size={14} weight="medium" color={t.muted}>
              Skip
            </Body>
          </Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <SlideView key={i} slide={slide} width={width} topInset={insets.top} scrollX={scrollX} index={i} />
        ))}
      </Animated.ScrollView>

      {/* Footer: dots + CTA */}
      <View style={{ paddingHorizontal: 28, paddingBottom: insets.bottom + 20, gap: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
          {SLIDES.map((_, i) => {
            const active = i === index;
            return (
              <View
                key={i}
                style={{
                  width: active ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: active ? t.green : t.border,
                }}
              />
            );
          })}
        </View>
        <Button
          label={isLast ? 'Get started' : 'Next'}
          variant="filled"
          full
          onPress={next}
          style={{ paddingVertical: 15 }}
        />
      </View>
    </View>
  );
}

function SlideView({
  slide,
  width,
  topInset,
  scrollX,
  index,
}: {
  slide: Slide;
  width: number;
  topInset: number;
  scrollX: Animated.Value;
  index: number;
}) {
  const t = useTheme();
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
  // Content drifts + fades as the page scrolls past — parallax depth.
  const translateY = scrollX.interpolate({
    inputRange,
    outputRange: [40, 0, 40],
    extrapolate: 'clamp',
  });
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });
  const iconScale = scrollX.interpolate({
    inputRange,
    outputRange: [0.8, 1, 0.8],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ width, flex: 1, justifyContent: 'center', paddingHorizontal: 34, paddingTop: topInset }}>
      <Animated.View style={{ opacity, transform: [{ translateY }] }}>
        <Animated.View
          style={{
            width: 88,
            height: 88,
            borderRadius: 24,
            backgroundColor: t.greenLight,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 36,
            transform: [{ scale: iconScale }],
          }}
        >
          <Ionicons name={slide.icon} size={40} color={t.green} />
        </Animated.View>

        <Eyebrow>{slide.eyebrow}</Eyebrow>
        <Serif size={40} style={{ marginTop: 12, lineHeight: 44 }}>
          {slide.title}
          {'\n'}
          <Serif size={40} italic color={t.green}>
            {slide.italic}
          </Serif>
        </Serif>
        <Body size={16} color={t.textSoft} style={{ marginTop: 18, lineHeight: 25 }}>
          {slide.body}
        </Body>
      </Animated.View>
    </View>
  );
}
