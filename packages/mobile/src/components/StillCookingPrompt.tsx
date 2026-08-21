import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Body, Mono } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { SCREEN_ON_PROMPT_SECONDS } from '@recipe-aggregator/shared/keepAwake';

interface Props {
  /** Countdown is running — ask whether anyone's still there. */
  asking: boolean;
  secondsLeft: number;
  /** Nobody answered — explain why the screen stopped staying on. */
  turnedOff: boolean;
  onConfirm: () => void;
  onTurnOff: () => void;
  onTurnBackOn: () => void;
  /** Distance from the bottom of the screen, safe area already included. */
  bottom: number;
}

/*
 * The keep-awake dead-man's switch, made visible — native twin of the web
 * banner. Not a BottomSheet on purpose: a sheet is modal, and if you *are* at
 * the counter you should be able to keep scrolling the recipe (which answers
 * the prompt by itself, via the hook's touch observer).
 */
export default function StillCookingPrompt({
  asking,
  secondsLeft,
  turnedOff,
  onConfirm,
  onTurnOff,
  onTurnBackOn,
  bottom,
}: Props) {
  const t = useTheme();
  const enter = useRef(new Animated.Value(0)).current;
  const visible = asking || turnedOff;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: visible ? 1 : 0,
      duration: visible ? 240 : 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, enter]);

  if (!visible) return null;

  const anim = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  const card = {
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  } as const;

  if (turnedOff) {
    return (
      <Animated.View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          { position: 'absolute', left: 16, right: 16, bottom, zIndex: 100 },
          anim,
        ]}
      >
        <View
          style={[
            card,
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingLeft: 16,
              paddingRight: 8,
              paddingVertical: 8,
              borderRadius: 999,
            },
          ]}
        >
          <Ionicons name="moon" size={15} color={t.muted} />
          <Body size={13} color={t.textSoft} numberOfLines={2} style={{ flex: 1 }}>
            Screen-on switched off to save battery
          </Body>
          <Pressable
            onPress={onTurnBackOn}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: t.greenSolid,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Body size={13} weight="semi" color={t.onGreen}>
              Turn on
            </Body>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  const progress = Math.max(0, Math.min(1, secondsLeft / SCREEN_ON_PROMPT_SECONDS));

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[{ position: 'absolute', left: 16, right: 16, bottom, zIndex: 100 }, anim]}
    >
      <View style={[card, { borderRadius: 18, overflow: 'hidden' }]}>
        <View style={{ paddingHorizontal: 18, paddingTop: 15, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Ionicons name="sunny" size={16} color={t.green} />
            <Body size={15} weight="semi" style={{ flex: 1 }}>
              Still cooking?
            </Body>
            <Mono size={12} color={t.muted}>
              {secondsLeft}s
            </Mono>
          </View>
          <Body size={13} color={t.muted} style={{ lineHeight: 19 }}>
            No activity for a while — the screen will stop staying on so you don't come back to a
            flat battery.
          </Body>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                paddingVertical: 11,
                borderRadius: 999,
                backgroundColor: t.greenSolid,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Body size={14} weight="semi" color={t.onGreen}>
                Yes, keep it on
              </Body>
            </Pressable>
            <Pressable
              onPress={onTurnOff}
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: 11,
                paddingHorizontal: 16,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: t.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Body size={14} weight="semi" color={t.textSoft}>
                Turn off
              </Body>
            </Pressable>
          </View>
        </View>
        {/* Countdown rail — the time left, without reading the number. */}
        <View style={{ height: 3, backgroundColor: t.ruleSoft }}>
          <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: t.orange }} />
        </View>
      </View>
    </Animated.View>
  );
}
