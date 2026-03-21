import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user, signOut } = useAuth();

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
        {user?.email?.[0]?.toUpperCase() ?? '?'}
      </div>

      <div className="text-center">
        <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          {user?.email ?? 'Guest'}
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          More settings coming soon.
        </p>
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
