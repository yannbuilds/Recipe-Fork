import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Eyebrow, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useAuth();
  const { ready: onboardingReady, seen: onboardingSeen } = useOnboarding();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Shown only if email confirmation is still enabled in Supabase.
  const [checkEmail, setCheckEmail] = useState(false);

  if (!authLoading && session) return <Redirect href="/" />;
  // First launch: show the onboarding carousel before the sign-in form.
  if (!authLoading && !session && onboardingReady && !onboardingSeen) {
    return <Redirect href="/onboarding" />;
  }

  const isSignUp = mode === 'signup';
  const canSubmit =
    !!email && password.length >= 6 && (!isSignUp || name.trim().length > 0);

  function switchMode(next: Mode) {
    haptics.select();
    setMode(next);
    setError(null);
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);

    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // The handle_new_user DB trigger reads these to build the profile row.
          data: { display_name: name.trim(), measurement_preference: 'metric' },
        },
      });
      setSubmitting(false);
      if (signUpError) {
        haptics.error();
        setError(signUpError.message);
        return;
      }
      // With email confirmation off, signUp returns a session and the
      // AuthContext listener routes into the app. If it's still on, there's no
      // session yet — fall back to a "check your email" prompt.
      if (!data.session) {
        setCheckEmail(true);
        return;
      }
      haptics.success();
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setSubmitting(false);
      if (signInError) {
        haptics.error();
        setError(signInError.message);
        return;
      }
      haptics.success();
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: t.text,
    fontFamily: font.sans,
  } as const;

  // ── Post-signup confirmation fallback ──────────────────────────
  if (checkEmail) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: t.bg,
          justifyContent: 'center',
          paddingHorizontal: 32,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              backgroundColor: t.greenLight,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
            }}
          >
            <Ionicons name="mail-outline" size={34} color={t.green} />
          </View>
          <Serif size={26} style={{ textAlign: 'center' }}>
            Check your email
          </Serif>
          <Body
            size={15}
            color={t.textSoft}
            style={{ marginTop: 12, textAlign: 'center', lineHeight: 22 }}
          >
            We sent a confirmation link to{' '}
            <Body size={15} weight="semi" color={t.text}>
              {email.trim()}
            </Body>
            . Tap it to activate your account, then come back to sign in.
          </Body>
          <Button
            label="Back to sign in"
            variant="secondary"
            onPress={() => {
              setCheckEmail(false);
              setMode('signin');
              setPassword('');
            }}
            style={{ marginTop: 28 }}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 28,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Eyebrow>{isSignUp ? 'Join the kitchen' : 'Welcome back'}</Eyebrow>
        <Serif size={40} style={{ lineHeight: 42, marginBottom: 4 }}>
          Pie{' '}
          <Serif size={40} italic color={t.green}>
            Keeper
          </Serif>
        </Serif>
        <Body size={15} color={t.muted} style={{ marginBottom: 16 }}>
          {isSignUp
            ? 'Create an account to start saving recipes.'
            : 'Sign in with your existing account.'}
        </Body>

        {isSignUp && (
          <TextInput
            style={inputStyle}
            placeholder="Your name"
            placeholderTextColor={t.muted}
            autoCapitalize="words"
            autoComplete="name"
            value={name}
            onChangeText={setName}
          />
        )}

        <TextInput
          style={inputStyle}
          placeholder="Email"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {/* Password with show/hide toggle */}
        <View style={{ position: 'relative', justifyContent: 'center' }}>
          <TextInput
            style={[inputStyle, { paddingRight: 48 }]}
            placeholder={isSignUp ? 'Password (min 6 characters)' : 'Password'}
            placeholderTextColor={t.muted}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleSubmit}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={10}
            style={{ position: 'absolute', right: 14, padding: 4 }}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={t.muted}
            />
          </Pressable>
        </View>

        {error && (
          <Body size={14} color={t.red}>
            {error}
          </Body>
        )}

        <Button
          label={isSignUp ? 'Create account' : 'Sign in'}
          variant="filled"
          full
          loading={submitting}
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={{ marginTop: 8, paddingVertical: 15 }}
        />

        {/* Mode toggle */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
            marginTop: 14,
          }}
        >
          <Body size={14} color={t.muted}>
            {isSignUp ? 'Already have an account?' : 'New to Pie Keeper?'}
          </Body>
          <Pressable hitSlop={8} onPress={() => switchMode(isSignUp ? 'signin' : 'signup')}>
            <Body size={14} weight="semi" color={t.green}>
              {isSignUp ? 'Sign in' : 'Create an account'}
            </Body>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
