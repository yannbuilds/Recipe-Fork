import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '@recipe-aggregator/shared';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export default function ProfilePage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { canInstall, promptInstall } = useInstallPrompt();

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [measurementValue, setMeasurementValue] = useState<'metric' | 'imperial'>('metric');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?';

  function enterEditMode() {
    setNameValue(profile?.display_name ?? '');
    setMeasurementValue(profile?.measurement_preference ?? 'metric');
    setError(null);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nameValue.trim()) {
      setError('Name cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('profiles')
      .upsert({
        id: user!.id,
        display_name: nameValue.trim(),
        measurement_preference: measurementValue,
      });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="flex flex-col items-center gap-6 py-12 px-4">
      {/* Avatar */}
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'var(--warm)',
          color: 'var(--green)',
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        {initial}
      </div>

      {editing ? (
        /* ---- Edit mode ---- */
        <form onSubmit={handleSave} className="w-full max-w-sm space-y-4">
          {error && (
            <div
              className="p-3 text-sm rounded-lg"
              style={{ background: '#fef2f0', color: 'var(--red)', border: '1px solid #f5c6c0' }}
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="profileName"
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--muted)' }}
            >
              Name
            </label>
            <input
              id="profileName"
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="rf-input w-full"
              placeholder="Your first name"
              autoFocus
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--muted)' }}
            >
              Email
            </label>
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              {user?.email}
            </p>
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
                onClick={() => setMeasurementValue('metric')}
                className="flex-1 text-xs font-medium transition-colors"
                style={{
                  background: measurementValue === 'metric' ? 'var(--warm)' : 'transparent',
                  color: measurementValue === 'metric' ? 'var(--text)' : 'var(--muted)',
                  borderRight: '1px solid var(--border)',
                }}
              >
                Metric (g, ml)
              </button>
              <button
                type="button"
                onClick={() => setMeasurementValue('imperial')}
                className="flex-1 text-xs font-medium transition-colors"
                style={{
                  background: measurementValue === 'imperial' ? 'var(--warm)' : 'transparent',
                  color: measurementValue === 'imperial' ? 'var(--text)' : 'var(--muted)',
                }}
              >
                Imperial (oz, cups)
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rf-btn rf-btn-filled flex-1"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(false)}
              className="rf-btn rf-btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* ---- View mode ---- */
        <>
          <div className="text-center">
            {profile?.display_name && (
              <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                {profile.display_name}
              </p>
            )}
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {user?.email ?? 'Guest'}
            </p>
            {profile?.measurement_preference && (
              <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                {profile.measurement_preference === 'metric' ? 'Metric (g, ml)' : 'Imperial (oz, cups)'}
              </p>
            )}
          </div>

          {user && (
            <button
              onClick={enterEditMode}
              className="rf-btn rf-btn-secondary"
            >
              Edit profile
            </button>
          )}
        </>
      )}

      {canInstall && (
        <button
          onClick={promptInstall}
          className="rf-btn rf-btn-filled"
        >
          Install Pie Keeper
        </button>
      )}

      {user && (
        <button
          onClick={signOut}
          className="rf-btn rf-btn-secondary"
          style={{ marginTop: 8 }}
        >
          Sign out
        </button>
      )}
    </div>
  );
}
