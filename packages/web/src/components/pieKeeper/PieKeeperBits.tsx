// Small presentational primitives for the Pie Keeper editorial language.
// Ported from the Claude Design handoff (app-screens.jsx). Inline-styled to
// match the existing codebase idiom. Page-scoped — used by the Cookbooks view.
import type { CSSProperties, ReactNode } from 'react';
import { PK, fMono } from '../../styles/pieKeeper';

// Paper-grain noise overlay. Absolutely positioned; parent must be relative.
// `style` lets the caller match a rounded container (e.g. borderRadius) without
// forcing overflow:hidden on the parent.
export function PaperGrain({ style = {} }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.12  0 0 0 0 0.10  0 0 0 0 0.06  0 0 0 0.45 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>")`,
        backgroundSize: '220px 220px',
        mixBlendMode: 'multiply',
        opacity: 0.16,
        ...style,
      }}
    />
  );
}

// Uppercase mono eyebrow with an optional leading rule.
export function Eyebrow({
  children,
  color = PK.inkMute,
  withRule = true,
  style = {},
}: {
  children: ReactNode;
  color?: string;
  withRule?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: fMono,
        fontSize: 9.5,
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
    >
      {withRule && <span style={{ width: 18, height: 1, background: color, opacity: 0.6 }} />}
      <span>{children}</span>
    </div>
  );
}

// Thin editorial hairline.
export function HairlineRule({ color = PK.rule, style = {} }: { color?: string; style?: CSSProperties }) {
  return <div style={{ height: 1, background: color, ...style }} />;
}
