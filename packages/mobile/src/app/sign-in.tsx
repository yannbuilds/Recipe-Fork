import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function SignInScreen() {
  const theme = useTheme();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && session) {
    return <Redirect href="/" />;
  }

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
    }
    // Success: AuthContext picks up the session and <Redirect> above fires.
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={[styles.title, { color: theme.text }]}>Pie Keeper</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Sign in with your existing account
        </Text>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.text },
          ]}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.text },
          ]}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          autoComplete="current-password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSignIn}
        />

        {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.accent, opacity: pressed || submitting ? 0.7 : 1 },
          ]}
          onPress={handleSignIn}
          disabled={submitting || !email || !password}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 16, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  error: { fontSize: 14 },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
