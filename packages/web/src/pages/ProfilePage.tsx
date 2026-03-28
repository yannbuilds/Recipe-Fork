import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '@recipe-aggregator/shared';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

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

  async function handleRemoveMember(memberId: string) {
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
          <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text)' }}>
            Family sharing
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            Invite someone to share all your recipes. You'll both be able to view, edit, and organise the same collection.
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
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text)' }}>
          Family sharing
        </h3>

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
                    onClick={() => handleRemoveMember(member.id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: 'var(--red)', background: 'rgba(220,38,38,0.08)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Pending invitations (owner only) */}
        {isOwner && familyInvitations.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>
              Pending invites
            </p>
            {familyInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-2 text-xs py-1"
                style={{ color: 'var(--muted)' }}
              >
                <span className="flex-1 truncate">{inv.invited_email}</span>
                <span style={{ color: 'var(--orange, #d97706)' }}>Pending</span>
              </div>
            ))}
          </div>
        )}

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
