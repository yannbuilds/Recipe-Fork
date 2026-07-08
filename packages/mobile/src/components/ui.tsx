import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { font, useTheme } from '@/lib/theme';

/* ── Eyebrow (mono uppercase label) ─────────────────────────── */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: font.mono,
          fontSize: 9.5,
          letterSpacing: 1.7,
          textTransform: 'uppercase',
          color: t.muted,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ── Serif heading ──────────────────────────────────────────── */
export function Serif({
  children,
  size = 20,
  color,
  italic = false,
  weight = 'regular',
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  italic?: boolean;
  weight?: 'regular' | 'semi';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const family = italic ? font.serifItalic : weight === 'semi' ? font.serifSemi : font.serif;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: family, fontSize: size, letterSpacing: -0.3, color: color ?? t.text },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ── Sans body text ─────────────────────────────────────────── */
export function Body({
  children,
  size = 14,
  color,
  weight = 'regular',
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  weight?: 'regular' | 'medium' | 'semi' | 'bold';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const family =
    weight === 'bold'
      ? font.sansBold
      : weight === 'semi'
        ? font.sansSemi
        : weight === 'medium'
          ? font.sansMedium
          : font.sans;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: family, fontSize: size, color: color ?? t.text }, style]}
    >
      {children}
    </Text>
  );
}

/* ── Mono label ─────────────────────────────────────────────── */
export function Mono({
  children,
  size = 10,
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: font.mono, fontSize: size, letterSpacing: 0.6, color: color ?? t.muted },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ── Button ─────────────────────────────────────────────────── */
type ButtonVariant = 'filled' | 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'filled',
  icon,
  loading = false,
  disabled = false,
  style,
  full = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const t = useTheme();
  const palettes: Record<ButtonVariant, { bg: string; border: string; color: string }> = {
    filled: { bg: t.greenSolid, border: t.greenSolid, color: t.onGreen },
    primary: { bg: t.card, border: t.green, color: t.green },
    secondary: { bg: t.card, border: t.border, color: t.text },
    danger: { bg: t.card, border: t.redBorder, color: t.red },
  };
  const p = palettes[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          width: full ? '100%' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={p.color} />
      ) : (
        <>
          {icon}
          <Text style={{ fontFamily: font.sansSemi, fontSize: 14, color: p.color }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ── Editorial checkbox (square, ticks green) ───────────────── */
export function CheckSquare({ checked, size = 22 }: { checked: boolean; size?: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: checked ? t.green : t.border,
        backgroundColor: checked ? t.green : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && (
        <Text style={{ color: t.onGreen, fontSize: size * 0.6, fontWeight: '900', lineHeight: size }}>
          ✓
        </Text>
      )}
    </View>
  );
}

/* ── Hairline divider ───────────────────────────────────────── */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: 1, backgroundColor: t.border }, style]} />;
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
});
