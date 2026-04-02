import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Provider } from '@supabase/supabase-js';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [measurement, setMeasurement] = useState<'metric' | 'imperial'>('metric');
  const [isSignUp, setIsSignUp] = useState(new URLSearchParams(window.location.search).get('signup') === 'true');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect if already logged in
  if (user) {
    const pendingToken = sessionStorage.getItem('pending_invite_token');
    if (pendingToken) {
      sessionStorage.removeItem('pending_invite_token');
      navigate(`/invite?token=${pendingToken}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignUp) {
      if (!displayName.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    if (isSignUp) {
      const pendingToken = sessionStorage.getItem('pending_invite_token');

      if (pendingToken) {
        // Invited user: auto-confirm via edge function (no confirmation email needed)
        const { data, error: fnError } = await supabase.functions.invoke(
          'auto-confirm-invited-signup',
          {
            body: {
              email,
              password,
              display_name: displayName.trim(),
              measurement_preference: measurement,
              invite_token: pendingToken,
            },
          },
        );

        if (fnError || data?.error) {
          setLoading(false);
          setError(data?.error || fnError?.message || 'Failed to create account');
          return;
        }

        // Sign in immediately — user is already confirmed
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        setLoading(false);

        if (signInError) {
          setError(signInError.message);
        }
        // AuthContext + existing redirect logic (lines 22–29) handles navigation to /invite
      } else {
        // Direct sign-up: standard flow with confirmation email
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: displayName.trim(),
              measurement_preference: measurement,
            },
          },
        });

        setLoading(false);

        if (error) {
          setError(error.message);
        } else {
          setSignUpSuccess(true);
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      setLoading(false);

      if (error) {
        setError(error.message);
      } else {
        const pendingToken = sessionStorage.getItem('pending_invite_token');
        if (pendingToken) {
          sessionStorage.removeItem('pending_invite_token');
          navigate(`/invite?token=${pendingToken}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    }
  }

  async function handleOAuth(provider: Provider) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1
          className="rf-heading text-2xl font-bold text-center mb-8"
          style={{ color: 'var(--text)' }}
        >
          Pie Keeper
        </h1>

        {signUpSuccess ? (
          <div className="rf-card text-center" style={{ padding: 24 }}>
            <div className="text-3xl mb-3">✉️</div>
            <h2 className="rf-heading text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              Check your email
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
              We've sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account, then come back here to sign in.
            </p>
            <button
              onClick={() => { setSignUpSuccess(false); setIsSignUp(false); setError(null); }}
              className="text-sm font-medium"
              style={{ color: 'var(--green)' }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
        <div className="rf-card" style={{ padding: 24 }}>
          <h2 className="rf-heading text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
            {isSignUp ? 'Create an account' : 'Sign in'}
          </h2>

          {error && (
            <div
              className="mb-4 p-3 text-sm rounded-lg"
              style={{ background: '#fef2f0', color: 'var(--red)', border: '1px solid #f5c6c0' }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label
                  htmlFor="displayName"
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'var(--muted)' }}
                >
                  Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="rf-input w-full"
                  placeholder="Your first name"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1"
                style={{ color: 'var(--muted)' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rf-input w-full"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1"
                style={{ color: 'var(--muted)' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rf-input w-full"
                placeholder="At least 6 characters"
              />
            </div>

            {isSignUp && (
              <>
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium mb-1"
                    style={{ color: 'var(--muted)' }}
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="rf-input w-full"
                    placeholder="Re-enter your password"
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: 'var(--muted)' }}
                  >
                    Measurement preference
                  </label>
                  <div
                    className="flex rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--border)', height: 36 }}
                  >
                    <button
                      type="button"
                      onClick={() => setMeasurement('metric')}
                      className="flex-1 text-xs font-medium transition-colors"
                      style={{
                        background: measurement === 'metric' ? 'var(--warm)' : 'transparent',
                        color: measurement === 'metric' ? 'var(--text)' : 'var(--muted)',
                        borderRight: '1px solid var(--border)',
                      }}
                    >
                      Metric (g, ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMeasurement('imperial')}
                      className="flex-1 text-xs font-medium transition-colors"
                      style={{
                        background: measurement === 'imperial' ? 'var(--warm)' : 'transparent',
                        color: measurement === 'imperial' ? 'var(--text)' : 'var(--muted)',
                      }}
                    >
                      Imperial (oz, cups)
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rf-btn rf-btn-filled w-full"
            >
              {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>or continue with</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleOAuth('google')}
              className="rf-btn rf-btn-secondary w-full"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>
          </div>

          <p className="mt-5 text-center text-sm" style={{ color: 'var(--muted)' }}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="font-medium"
              style={{ color: 'var(--green)' }}
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
