import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user, profile, signOut } = useAuth();

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex flex-col items-center gap-6 py-12">
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
