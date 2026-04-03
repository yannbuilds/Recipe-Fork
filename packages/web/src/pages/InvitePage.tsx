import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '@recipe-aggregator/shared';

export default function InvitePage() {
  const { user, loading: authLoading, refreshFamily } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'ready' | 'accepting' | 'success' | 'error'>('loading');
  const [inviterName, setInviterName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid invite link – no token found.');
      return;
    }

    // If not logged in, store token and redirect to login
    if (!authLoading && !user) {
      sessionStorage.setItem('pending_invite_token', token);
      const emailParam = searchParams.get('email');
      if (emailParam) {
        sessionStorage.setItem('pending_invite_email', emailParam);
      }
      const loginUrl = emailParam
        ? `/login?signup=true&email=${encodeURIComponent(emailParam)}`
        : '/login?signup=true';
      navigate(loginUrl, { replace: true });
      return;
    }

    if (!user) return; // still loading auth

    // Fetch invite details via edge function (bypasses RLS)
    async function fetchInvite() {
      const { data, error } = await supabase.functions.invoke('accept-family-invite', {
        body: { token: token!, action: 'preview' },
      });

      if (error || !data || data.error) {
        let msg = data?.error || 'This invite is no longer valid. It may have expired or already been used.';
        if (!data?.error && error) {
          try {
            const resp = (error as any).context;
            if (resp && typeof resp.json === 'function') {
              const cloned = resp.clone();
              try {
                const body = await cloned.json();
                if (body?.error) msg = body.error;
              } catch {
                const text = await resp.text();
                if (text) msg = text;
              }
            }
          } catch { /* fall back to default message */ }
        }
        setStatus('error');
        setErrorMessage(msg);
        return;
      }

      setInviterName(data.inviter_name || 'Someone');
      setStatus('ready');
    }

    fetchInvite();
  }, [token, user, authLoading, navigate]);

  // Check for pending invite after login
  useEffect(() => {
    if (user && !token) {
      const pendingToken = sessionStorage.getItem('pending_invite_token');
      if (pendingToken) {
        sessionStorage.removeItem('pending_invite_token');
        navigate(`/invite?token=${pendingToken}`, { replace: true });
      }
    }
  }, [user, token, navigate]);

  async function handleAccept() {
    setStatus('accepting');

    const { data, error } = await supabase.functions.invoke('accept-family-invite', {
      body: { token },
    });

    if (error || data?.error) {
      let msg = data?.error || 'Failed to accept invite';
      if (!data?.error && error) {
        try {
          const resp = (error as any).context;
          if (resp && typeof resp.json === 'function') {
            const cloned = resp.clone();
            try {
              const body = await cloned.json();
              if (body?.error) msg = body.error;
            } catch {
              const text = await resp.text();
              if (text) msg = text;
            }
          }
        } catch { /* fall back to default message */ }
      }
      setStatus('error');
      setErrorMessage(msg);
      return;
    }

    setGroupName(data?.group_name || 'My Family');
    setStatus('success');
    await refreshFamily();
  }

  function handleDecline() {
    navigate('/', { replace: true });
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-xl p-6 text-center"
        style={{ background: 'var(--warm)', border: '1px solid var(--border)' }}
      >
        {status === 'loading' && (
          <p style={{ color: 'var(--muted)' }}>Loading invite…</p>
        )}

        {status === 'ready' && (
          <>
            <div
              className="mx-auto flex items-center justify-center rounded-full mb-4"
              style={{
                width: 56,
                height: 56,
                background: 'var(--green)',
                color: 'white',
                fontSize: 24,
              }}
            >
              {inviterName[0]?.toUpperCase() ?? '?'}
            </div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>
              You're invited!
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{inviterName}</strong> wants to share their recipes with you on Pie Keeper.
              You'll both be able to see, edit, and organise the same collection.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleAccept}
                className="rf-btn rf-btn-filled flex-1"
              >
                Accept
              </button>
              <button
                onClick={handleDecline}
                className="rf-btn rf-btn-secondary flex-1"
              >
                Decline
              </button>
            </div>
          </>
        )}

        {status === 'accepting' && (
          <p style={{ color: 'var(--muted)' }}>Joining family group…</p>
        )}

        {status === 'success' && (
          <>
            <div
              className="mx-auto flex items-center justify-center rounded-full mb-4"
              style={{
                width: 56,
                height: 56,
                background: 'var(--green)',
                color: 'white',
                fontSize: 24,
              }}
            >
              ✓
            </div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>
              You're in!
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              You've joined <strong style={{ color: 'var(--text)' }}>{groupName}</strong>. Shared recipes are now in your collection.
            </p>
            <Link to="/" className="rf-btn rf-btn-filled inline-block">
              Go to recipes
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              Invite issue
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--red)' }}>
              {errorMessage}
            </p>
            <Link to="/" className="rf-btn rf-btn-secondary inline-block">
              Go to recipes
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
