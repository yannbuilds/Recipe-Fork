import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, Plus, X } from 'lucide-react';
import { COOK_BAR_VISIBLE, cookProgress } from '@recipe-aggregator/shared';
import type { ActiveCook } from '@recipe-aggregator/shared';
import { useCookSession } from '../context/CookSessionContext';
import { useCookBarVisible, useViewingRecipeId } from '../hooks/useCookBar';
import AddToCookSheet from './AddToCookSheet';
import { fMono, fSans, fSerif } from '../styles/pieKeeper';

/*
 * "On the stove" — the persistent switcher, modelled on the iOS in-call bar.
 *
 * Lives directly above the bottom nav, so a cook is never something you can
 * navigate away from by accident. One pill per recipe: tap one to jump to it,
 * exactly where you left off. The pill you're currently looking at is filled in;
 * the others are outlined, which makes the bar read as "tap here to go back to
 * the other thing" at a glance.
 *
 * It renders nothing when nothing is cooking — and nothing when a single cook is
 * already the recipe on screen, where it would only be repeating what you can
 * see. `shouldShowCookBar` in shared holds that rule.
 */

/** Thin ring showing steps done. Reads as progress without needing the number. */
function ProgressRing({ fraction, size = 20 }: { fraction: number; size?: number }) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} opacity={0.28} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.35s ease' }}
      />
    </svg>
  );
}

function CookPill({
  cook,
  current,
  solo,
  onClick,
}: {
  cook: ActiveCook;
  current: boolean;
  solo: boolean;
  onClick: () => void;
}) {
  const { done, total, fraction } = cookProgress(cook);
  return (
    <button
      onClick={onClick}
      title={cook.title}
      aria-current={current ? 'true' : undefined}
      style={{
        flex: solo ? '1 1 auto' : '1 1 0',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px 6px 10px',
        borderRadius: 999,
        // Filled = the one on screen. Outlined = somewhere else, tap to go.
        background: current ? 'rgba(255,255,255,0.20)' : 'transparent',
        border: `1px solid ${current ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.24)'}`,
        color: '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.2s ease, border-color 0.2s ease',
      }}
    >
      <span style={{ color: '#fff', display: 'flex' }}>
        <ProgressRing fraction={fraction} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontFamily: fSerif,
            fontSize: 14,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            opacity: current ? 1 : 0.92,
          }}
        >
          {cook.title}
        </span>
        {total > 0 && (
          <span
            style={{
              display: 'block',
              fontFamily: fMono,
              fontSize: 9.5,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.72,
              marginTop: 1,
            }}
          >
            {solo ? `Step ${Math.min(done + 1, total)} of ${total}` : `${done}/${total}`}
          </span>
        )}
      </span>
    </button>
  );
}

export default function CookingBar() {
  const { cooks, session, switchCook, endCook, clearSession } = useCookSession();
  const navigate = useNavigate();
  // Which recipe is actually on screen right now — not the same thing as the
  // session's active cook, since you can be on the plan or browsing.
  const viewingId = useViewingRecipeId();
  const visible = useCookBarVisible();
  const [showAdd, setShowAdd] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  if (!visible) return null;

  function goTo(recipeId: string) {
    switchCook(recipeId);
    navigate(`/recipe/${recipeId}`);
    setShowMenu(false);
  }

  function stop(recipeId: string) {
    endCook(recipeId);
    if (cooks.length <= 1) setShowMenu(false);
  }

  const solo = cooks.length === 1;

  return (
    <>
      <div
        className="relative shrink-0 z-40"
        style={{
          background: 'var(--cook-bar)',
          color: '#fff',
          fontFamily: fSans,
          animation: 'fadeUp 0.28s ease both',
        }}
      >
        <div
          className="mx-auto flex items-center gap-2"
          style={{ maxWidth: 1100, padding: '8px 12px' }}
        >
          <div
            className="flex items-center gap-2 min-w-0 flex-1"
            style={{
              // Four or more cooks is unusual but shouldn't clip. Scroll rather
              // than shrink the pills into unreadable slivers.
              overflowX: cooks.length > COOK_BAR_VISIBLE ? 'auto' : 'visible',
              scrollbarWidth: 'none',
            }}
          >
            {cooks.map((cook) => (
              <CookPill
                key={cook.recipeId}
                cook={cook}
                current={cook.recipeId === viewingId}
                solo={solo}
                onClick={() => goTo(cook.recipeId)}
              />
            ))}
          </div>

          <button
            onClick={() => setShowAdd(true)}
            aria-label="Cook another recipe"
            title="Cook another recipe"
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.26)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <Plus size={17} strokeWidth={2.2} />
          </button>
          <button
            onClick={() => setShowMenu(true)}
            aria-label="Cooking options"
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 30,
              height: 34,
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
            }}
          >
            <ChevronUp size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Options sheet — the only place a cook can be stopped without finishing
          it, which is the escape hatch the old URL-param cook mode never had. */}
      {showMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setShowMenu(false)}
          style={{ animation: 'fadeIn 0.15s ease both' }}
        >
          <div
            className="rf-card max-w-md w-full sm:mx-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-5"
            style={{
              paddingTop: 20,
              paddingLeft: 20,
              paddingRight: 20,
              borderRadius: '20px 20px 0 0',
              animation: 'slideUp 0.2s ease both',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="rf-heading text-base font-semibold" style={{ color: 'var(--text)' }}>
                On the stove
              </h2>
              <button onClick={() => setShowMenu(false)} style={{ color: 'var(--muted)', fontSize: 20, lineHeight: 1 }} aria-label="Close">
                ×
              </button>
            </div>

            <div className="space-y-1">
              {cooks.map((cook) => {
                const { done, total } = cookProgress(cook);
                return (
                  <div key={cook.recipeId} className="flex items-center gap-2">
                    <button
                      onClick={() => goTo(cook.recipeId)}
                      className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left min-w-0"
                      style={{
                        background:
                          cook.recipeId === session.activeRecipeId ? 'var(--green-light)' : 'transparent',
                        border: '1px solid',
                        borderColor:
                          cook.recipeId === session.activeRecipeId ? 'var(--green)' : 'transparent',
                      }}
                    >
                      <span className="flex-1 min-w-0">
                        <span
                          className="block text-sm font-semibold truncate"
                          style={{ color: 'var(--text)' }}
                        >
                          {cook.title}
                        </span>
                        {total > 0 && (
                          <span style={{ display: 'block', fontFamily: fMono, fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                            {done} of {total} steps
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      onClick={() => stop(cook.recipeId)}
                      aria-label={`Stop cooking ${cook.title}`}
                      className="shrink-0 flex items-center justify-center rounded-lg"
                      style={{
                        width: 34,
                        height: 34,
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={15} strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                setShowAdd(true);
                setShowMenu(false);
              }}
              className="rf-btn rf-btn-primary w-full mt-3"
            >
              + Cook another recipe
            </button>
            {cooks.length > 1 && (
              <button
                onClick={() => {
                  clearSession();
                  setShowMenu(false);
                }}
                className="w-full mt-2 py-2 text-sm"
                style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Stop all cooking
              </button>
            )}
          </div>
        </div>
      )}

      <AddToCookSheet open={showAdd} onClose={() => setShowAdd(false)} />
    </>
  );
}
