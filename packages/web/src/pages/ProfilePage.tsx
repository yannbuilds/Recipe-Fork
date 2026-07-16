import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '@recipe-aggregator/shared';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useThemePreference, setThemePreference, type ThemePreference } from '../hooks/useTheme';

export default function ProfilePage() {
  const {
    user,
    profile,
    refreshProfile,
    signOut,
    familyGroup,
    familyMembers,
    familyInvitations,
    refreshFamily,
  } = useAuth();
  const { canInstall, promptInstall } = useInstallPrompt();

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [measurementValue, setMeasurementValue] = useState<'metric' | 'imperial'>('metric');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?';
  const avatarUrl = (user?.user_metadata?.avatar_url || user?.user_metadata?.picture) as string | undefined;

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

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'Permanently delete your account, recipes, cookbooks, meal plans and notes? This cannot be undone.',
    );
    if (!confirmed) return;

    setDeletingAccount(true);
    setAccountError(null);
    const { data, error: deleteError } = await supabase.functions.invoke('delete-account');
    if (deleteError || data?.error) {
      setDeletingAccount(false);
      setAccountError(data?.error || deleteError?.message || 'Account deletion failed.');
      return;
    }

    await supabase.auth.signOut({ scope: 'local' });
    window.location.assign('/login');
  }

  return (
    <div className="flex flex-col items-center gap-6 py-12 px-4">
      {/* Avatar */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={initial}
          referrerPolicy="no-referrer"
          className="rounded-full"
          style={{ width: 80, height: 80, objectFit: 'cover' }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 88,
            height: 88,
            background: 'var(--green-light)',
            color: 'var(--green-deep)',
            fontSize: 40,
            fontWeight: 500,
            fontFamily: '"Newsreader", Georgia, serif',
            fontStyle: 'italic',
            border: '1px solid var(--border)',
          }}
        >
          {initial}
        </div>
      )}

      {editing ? (
        /* ---- Edit mode ---- */
        <form onSubmit={handleSave} className="w-full max-w-sm space-y-4">
          {error && (
            <div
              className="p-3 text-sm rounded-lg"
              style={{ background: 'var(--red-light)', color: 'var(--red)', border: '1px solid var(--red-border)' }}
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
              {saving ? 'Saving\u2026' : 'Save'}
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
            <div className="rf-eyebrow flex justify-center" style={{ marginBottom: 10 }}>
              The cook
            </div>
            {profile?.display_name && (
              <p className="rf-heading" style={{ color: 'var(--text)', fontSize: 28, lineHeight: 1.05 }}>
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

      {/* ---- Appearance ---- */}
      {!editing && <ThemeSection />}

      {/* ---- Family Sharing ---- */}
      {user && !editing && (
        <FamilySection
          familyGroup={familyGroup}
          familyMembers={familyMembers}
          familyInvitations={familyInvitations}
          currentUserId={user.id}
          refreshFamily={refreshFamily}
        />
      )}

      {/* ---- Friend Invite ---- */}
      {user && !editing && <FriendInviteSection />}

      {canInstall && (
        <button
          onClick={promptInstall}
          className="rf-btn rf-btn-filled"
        >
          Install Pie Keeper
        </button>
      )}

      {user && !editing && (
        <div className="w-full max-w-sm">
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--warm)', border: '1px solid var(--border)' }}
          >
            <h3 className="rf-heading mb-1" style={{ color: 'var(--text)', fontSize: 18 }}>
              Help & privacy
            </h3>
            <div className="flex gap-4 text-sm mt-3">
              <a href="/support" style={{ color: 'var(--green)' }}>Support</a>
              <a href="/privacy" style={{ color: 'var(--green)' }}>Privacy policy</a>
            </div>
          </div>
        </div>
      )}

      {user && (
        <div className="w-full max-w-sm flex flex-col gap-3" style={{ marginTop: 8 }}>
          <button onClick={signOut} className="rf-btn rf-btn-secondary w-full">
            Sign out
          </button>
          <button
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
            className="rf-btn w-full"
            style={{
              color: 'var(--red)',
              background: 'var(--card)',
              border: '1px solid var(--red-border)',
            }}
          >
            {deletingAccount ? 'Deleting account…' : 'Delete account'}
          </button>
          {accountError && (
            <p className="text-xs text-center" style={{ color: 'var(--red)' }}>
              {accountError}
            </p>
          )}
          <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
            Permanently removes your Pie Keeper account and its data.
          </p>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Appearance / Theme Section
   ================================================================ */

function ThemeSection() {
  const pref = useThemePreference();

  const options: { value: ThemePreference; label: string }[] = [
    { value: 'auto', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--warm)', border: '1px solid var(--border)' }}
      >
        <h3 className="rf-heading mb-1" style={{ color: 'var(--text)', fontSize: 18 }}>
          Appearance
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          System follows the time of day. Pick Light or Dark to keep one look.
        </p>
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border)', height: 36 }}
        >
          {options.map((opt, i) => {
            const active = pref === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setThemePreference(opt.value)}
                className="flex-1 text-xs font-medium transition-colors"
                style={{
                  background: active ? 'var(--card)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--muted)',
                  fontWeight: active ? 600 : 500,
                  borderRight: i < options.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Family Sharing Section
   ================================================================ */

import type { FamilyGroup, FamilyMember, FamilyInvitation } from '@recipe-aggregator/shared';

function FamilySection({
  familyGroup,
  familyMembers,
  familyInvitations,
  currentUserId,
  refreshFamily,
}: {
  familyGroup: FamilyGroup | null;
  familyMembers: FamilyMember[];
  familyInvitations: FamilyInvitation[];
  currentUserId: string;
  refreshFamily: () => Promise<void>;
}) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const isOwner = familyMembers.find((m) => m.user_id === currentUserId)?.role === 'owner';

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setSending(true);
    setError(null);
    setMessage(null);

    const { data: { session: currentSession } } = await supabase.auth.getSession();
    console.log('[invite] session exists:', !!currentSession, 'token prefix:', currentSession?.access_token?.substring(0, 20));

    const { data, error: fnError } = await supabase.functions.invoke('send-family-invite', {
      body: { email: inviteEmail.trim() },
    });

    setSending(false);

    if (fnError) {
      // supabase-js wraps non-2xx responses – try to extract the JSON body
      let msg = 'Failed to send invite';
      try {
        if (fnError.context instanceof Response) {
          const body = await fnError.context.clone().json();
          msg = body?.error || msg;
        } else if (fnError.message) {
          msg = fnError.message;
        }
      } catch {
        msg = fnError.message || msg;
      }
      console.error('[invite] function error:', fnError, 'extracted msg:', msg);
      setError(msg);
      return;
    }

    if (data?.error) {
      setError(data.error);
      return;
    }

    setMessage(data?.message || 'Invite sent!');
    setInviteEmail('');
    await refreshFamily();
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!confirm(`Remove ${memberName} from the family group?`)) return;
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', memberId);

    if (!error) await refreshFamily();
  }

  async function handleLeaveGroup() {
    if (!confirm('Leave this family group? You will no longer see shared recipes.')) return;
    setLeaving(true);

    const myMembership = familyMembers.find((m) => m.user_id === currentUserId);
    if (myMembership) {
      await supabase.from('family_members').delete().eq('id', myMembership.id);
    }

    setLeaving(false);
    await refreshFamily();
  }

  // No group yet – show invite CTA
  if (!familyGroup) {
    return (
      <div className="w-full max-w-sm">
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--warm)', border: '1px solid var(--border)' }}
        >
          <h3 className="rf-heading mb-1" style={{ color: 'var(--text)', fontSize: 18 }}>
            Family sharing
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            Share your recipe collection with a partner or family member. You'll both see and edit the same recipes.
          </p>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              className="rf-input flex-1 text-sm"
              required
            />
            <button
              type="submit"
              disabled={sending}
              className="rf-btn rf-btn-filled text-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              {sending ? 'Sending\u2026' : 'Invite'}
            </button>
          </form>
          {error && (
            <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>{error}</p>
          )}
          {message && (
            <p className="text-xs mt-2" style={{ color: 'var(--green)' }}>{message}</p>
          )}
        </div>
      </div>
    );
  }

  // Has a group – show members
  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--warm)', border: '1px solid var(--border)' }}
      >
        <h3 className="rf-heading mb-1" style={{ color: 'var(--text)', fontSize: 18 }}>
          Family sharing
        </h3>
        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
          Share your recipe collection with a partner or family member. You'll both see and edit the same recipes.
        </p>

        {/* Member list */}
        <div className="space-y-2 mb-4">
          {familyMembers.map((member) => {
            const name = member.profile?.display_name || 'Unknown';
            const memberInitial = name[0]?.toUpperCase() ?? '?';
            const isMe = member.user_id === currentUserId;

            return (
              <div
                key={member.id}
                className="flex items-center gap-3"
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 32,
                    height: 32,
                    background: isMe ? 'var(--green)' : 'var(--border)',
                    color: isMe ? 'white' : 'var(--text)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {memberInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                    {name}{isMe ? ' (you)' : ''}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {member.role === 'owner' ? 'Owner' : 'Member'}
                  </p>
                </div>
                {isOwner && !isMe && (
                  <button
                    onClick={() => handleRemoveMember(member.id, name)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
          {familyInvitations.map((inv) => {
            const emailInitial = inv.invited_email[0]?.toUpperCase() ?? '?';
            return (
              <div key={inv.id} className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 32,
                    height: 32,
                    background: 'var(--border)',
                    color: 'var(--muted)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {emailInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--muted)' }}>
                    {inv.invited_email}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--orange)' }}>
                    Pending
                  </p>
                </div>
                {isOwner && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Cancel invitation to ${inv.invited_email}?`)) return;
                      const { error } = await supabase.from('family_invitations').delete().eq('id', inv.id);
                      if (error) {
                        alert('Failed to cancel invitation');
                        return;
                      }
                      await refreshFamily();
                    }}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            );
          })}
        </div>


        {/* Invite form (owner only) */}
        {isOwner && (
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invite by email"
              className="rf-input flex-1 text-sm"
              required
            />
            <button
              type="submit"
              disabled={sending}
              className="rf-btn rf-btn-filled text-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              {sending ? 'Sending\u2026' : 'Invite'}
            </button>
          </form>
        )}

        {error && (
          <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>{error}</p>
        )}
        {message && (
          <p className="text-xs mt-2" style={{ color: 'var(--green)' }}>{message}</p>
        )}

        {/* Leave group (member only) */}
        {!isOwner && (
          <button
            onClick={handleLeaveGroup}
            disabled={leaving}
            className="rf-btn rf-btn-secondary text-sm w-full mt-3"
          >
            {leaving ? 'Leaving\u2026' : 'Leave family group'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Friend Invite Section
   ================================================================ */

function FriendInviteSection() {
  const [friendEmail, setFriendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!friendEmail.trim()) return;

    setSending(true);
    setError(null);
    setMessage(null);

    const { data, error: fnError } = await supabase.functions.invoke('send-friend-invite', {
      body: { email: friendEmail.trim() },
    });

    setSending(false);

    if (fnError) {
      let msg = 'Failed to send invite';
      try {
        if (fnError.context instanceof Response) {
          const body = await fnError.context.clone().json();
          msg = body?.error || msg;
        } else if (fnError.message) {
          msg = fnError.message;
        }
      } catch {
        msg = fnError.message || msg;
      }
      setError(msg);
      return;
    }

    if (data?.error) {
      setError(data.error);
      return;
    }

    setMessage(data?.message || 'Invite sent!');
    setFriendEmail('');
  }

  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--warm)', border: '1px solid var(--border)' }}
      >
        <h3 className="rf-heading mb-1" style={{ color: 'var(--text)', fontSize: 18 }}>
          Invite a friend
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          Know someone who'd love Pie Keeper? Send them an invite to create an account.
        </p>
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="email"
            value={friendEmail}
            onChange={(e) => setFriendEmail(e.target.value)}
            placeholder="Email address"
            className="rf-input flex-1 text-sm"
            required
          />
          <button
            type="submit"
            disabled={sending}
            className="rf-btn rf-btn-filled text-sm"
            style={{ whiteSpace: 'nowrap' }}
          >
            {sending ? 'Sending\u2026' : 'Send'}
          </button>
        </form>
        {error && (
          <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>{error}</p>
        )}
        {message && (
          <p className="text-xs mt-2" style={{ color: 'var(--green)' }}>{message}</p>
        )}
      </div>
    </div>
  );
}
