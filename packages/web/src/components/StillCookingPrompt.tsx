import { Moon, Sun } from 'lucide-react';
import { SCREEN_ON_PROMPT_SECONDS } from '@recipe-aggregator/shared';
import { GUARD_ATTR } from '../hooks/useIdleScreenOff';

interface Props {
  /** Countdown is running — ask whether anyone's still there. */
  asking: boolean;
  secondsLeft: number;
  /** Nobody answered — explain why the screen is about to sleep again. */
  turnedOff: boolean;
  onConfirm: () => void;
  onTurnOff: () => void;
  onTurnBackOn: () => void;
  /** Extra lift, for pages with their own floating footer button. */
  bottomOffset?: number;
}

/*
 * The keep-awake dead-man's switch, made visible.
 *
 * Deliberately a banner, not a modal: if you *are* at the counter you should
 * be able to carry on reading the recipe (and any tap answers the prompt on
 * its own), and if you're not, a backdrop over the page helps nobody.
 * Pinned above the bottom nav, at the thumb end of the screen.
 */
export default function StillCookingPrompt({
  asking,
  secondsLeft,
  turnedOff,
  onConfirm,
  onTurnOff,
  onTurnBackOn,
  bottomOffset = 0,
}: Props) {
  if (!asking && !turnedOff) return null;

  const bottom = `calc(env(safe-area-inset-bottom, 0px) + ${88 + bottomOffset}px)`;

  const shell: React.CSSProperties = {
    position: 'fixed',
    // Centred with auto margins, not `left:50% + translateX(-50%)`: the fadeUp
    // keyframes animate `transform`, and with `fill-mode: both` that would win
    // and leave the card sitting half a width off to the right.
    left: 0,
    right: 0,
    marginInline: 'auto',
    bottom,
    // Above the page and the cook-mode footer, below the screen-on halo
    // (which is pointer-events:none anyway).
    zIndex: 90,
    width: 'min(92vw, 420px)',
    fontFamily: '"DM Sans", system-ui, sans-serif',
    animation: 'fadeUp 0.3s ease both',
  };

  if (turnedOff) {
    return (
      <div style={shell} role="status" aria-live="polite" {...{ [GUARD_ATTR]: '' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 12px 11px 16px',
            borderRadius: 999,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <Moon size={16} strokeWidth={2} aria-hidden style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-soft)' }}>
            Screen-on switched off to save battery
          </span>
          <button
            onClick={onTurnBackOn}
            style={{
              flexShrink: 0,
              padding: '6px 13px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--green-solid)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Turn back on
          </button>
        </div>
      </div>
    );
  }

  const progress = Math.max(0, Math.min(1, secondsLeft / SCREEN_ON_PROMPT_SECONDS));

  return (
    <div style={shell} role="alert" aria-label="Still cooking?" {...{ [GUARD_ATTR]: '' }}>
      <div
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ padding: '15px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <Sun size={16} strokeWidth={2} aria-hidden style={{ color: 'var(--green)', flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Still cooking?</span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--muted)',
              }}
            >
              {secondsLeft}s
            </span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--muted)', margin: 0 }}>
            No activity for a while — the screen will stop staying on so you don't come back to a
            flat battery.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={onConfirm}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 999,
                border: 'none',
                background: 'var(--green-solid)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Yes, keep it on
            </button>
            <button
              onClick={onTurnOff}
              style={{
                padding: '10px 14px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-soft)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Turn off
            </button>
          </div>
        </div>
        {/* Countdown rail — the time left, without needing to read the number. */}
        <div style={{ height: 3, background: 'var(--rule-soft)' }}>
          <div
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: 'var(--terracotta)',
              transition: 'width 0.25s linear',
            }}
          />
        </div>
      </div>
    </div>
  );
}
