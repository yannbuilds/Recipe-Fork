import { useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordPage() {
  const { user, loading: authLoading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await supabase.auth.signOut({ scope: 'local' });
    setComplete(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="rf-card w-full max-w-sm" style={{ padding: 24 }}>
        <div className="rf-eyebrow" style={{ marginBottom: 10 }}>Your account</div>
        <h1 className="rf-heading" style={{ fontSize: 26, marginBottom: 10 }}>
          Choose a new password
        </h1>

        {authLoading ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Checking your reset link…</p>
        ) : complete ? (
          <div>
            <p style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.6 }}>
              Your password has been updated. You can now return to Pie Keeper and sign in.
            </p>
            <a href="/login" className="rf-btn rf-btn-filled w-full mt-5" style={{ textDecoration: 'none' }}>
              Return to sign in
            </a>
          </div>
        ) : !user ? (
          <div>
            <p style={{ color: 'var(--red)', fontSize: 14, lineHeight: 1.6 }}>
              This reset link is invalid or has expired.
            </p>
            <a href="/login" style={{ color: 'var(--green)', fontSize: 14 }}>
              Request another link
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p style={{ color: 'var(--red)', fontSize: 14 }}>{error}</p>}
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rf-input w-full"
              placeholder="New password (8+ characters)"
            />
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="rf-input w-full"
              placeholder="Confirm new password"
            />
            <button type="submit" disabled={saving} className="rf-btn rf-btn-filled w-full">
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
