import { PK, fSerif, fSans } from '../styles/pieKeeper';
import { Eyebrow } from './pieKeeper/PieKeeperBits';

interface CookbookEmptyStateProps {
  onCreate: () => void;
}

export default function CookbookEmptyState({ onCreate }: CookbookEmptyStateProps) {
  return (
    <div
      className="text-center"
      style={{ padding: '56px 16px 0', animation: 'fadeUp 0.4s ease 0.1s both' }}
    >
      <span className="block" style={{ fontSize: 64 }}>
        📖
      </span>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        <Eyebrow>Your shelf</Eyebrow>
      </div>
      <h2
        style={{
          margin: '14px 0 10px',
          fontFamily: fSerif,
          fontWeight: 400,
          fontSize: 28,
          letterSpacing: '-0.022em',
          lineHeight: 1.1,
          color: PK.ink,
        }}
      >
        Build your first <em style={{ fontStyle: 'italic', color: PK.green }}>cookbook.</em>
      </h2>
      <p
        style={{
          margin: '0 auto',
          maxWidth: '32ch',
          fontFamily: fSans,
          fontSize: 14,
          lineHeight: 1.5,
          color: PK.inkSoft,
        }}
      >
        Group your recipes into collections like “Weeknight dinners” or “Christmas 2026”. It’s a
        faster way to find what you want to cook.
      </p>
      <button
        onClick={onCreate}
        style={{
          marginTop: 28,
          padding: '13px 22px',
          background: PK.green,
          color: PK.cream,
          border: 'none',
          borderRadius: 999,
          fontFamily: fSans,
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        + Create cookbook
      </button>
    </div>
  );
}
