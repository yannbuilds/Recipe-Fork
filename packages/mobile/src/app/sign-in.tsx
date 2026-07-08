import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  TextInput,
  View,
} from 'react-native';
import { Body, Button, Eyebrow, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

export default function SignInScreen() {
  const t = useTheme();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && session) return <Redirect href="/" />;

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) setError(signInError.message);
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 }}>
        <Eyebrow>Welcome back</Eyebrow>
        <Serif size={40} style={{ lineHeight: 42, marginBottom: 4 }}>
          Pie <Serif size={40} italic color={t.green}>Keeper</Serif>
        </Serif>
        <Body size={15} color={t.muted} style={{ marginBottom: 16 }}>
          Sign in with your existing account.
        </Body>

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
        <TextInput
          style={inputStyle}
          placeholder="Password"
          placeholderTextColor={t.muted}
          autoComplete="current-password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSignIn}
        />

        {error && (
          <Body size={14} color={t.red}>
            {error}
          </Body>
        )}

        <Button
          label="Sign in"
          variant="filled"
          full
          loading={submitting}
          disabled={!email || !password}
          onPress={handleSignIn}
          style={{ marginTop: 8, paddingVertical: 15 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
