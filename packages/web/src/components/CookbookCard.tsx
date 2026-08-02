import { Link } from 'react-router-dom';
import { Utensils } from 'lucide-react';
import type { Cookbook } from '@recipe-aggregator/shared';
import { PK, fSerif, fMono } from '../styles/pieKeeper';

interface CookbookCardProps {
  cookbook: Cookbook;
  recipeCount: number;
  coverImages: string[]; // up to 4
  index?: number;
  /**
   * When set the card opens the shelf in place instead of navigating — plan
   * mode browses cookbooks inside its own modal.
   */
  onSelect?: () => void;
}

// Editorial "shelf" row — Pie Keeper design language (Screen 02 · CookbookEntry).
export default function CookbookCard({ cookbook, recipeCount, coverImages, index = 0, onSelect }: CookbookCardProps) {
  const slots = [0, 1, 2, 3].map((i) => coverImages[i] ?? null);

  const shell: React.CSSProperties = {
    color: PK.ink,
    textDecoration: 'none',
    animation: 'fadeUp 0.4s ease both',
    animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
  };

  const body = (
    <>
      {/* Title row: index · name · count */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: fSerif, fontStyle: 'italic', color: PK.green, fontSize: 14 }}>
          {String(index + 1).padStart(2, '0')}.
        </span>
        <h3
          style={{
            margin: 0,
            fontFamily: fSerif,
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: '-0.018em',
            color: PK.ink,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {cookbook.name}
        </h3>
        <span
          style={{
            fontFamily: fMono,
            fontSize: 10,
            color: PK.inkMute,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {recipeCount} {recipeCount === 1 ? 'recipe' : 'recipes'}
        </span>
      </div>

      {/* Photo strip — 4 across, like cookbook plates */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          borderTop: `1px solid ${PK.rule}`,
          paddingTop: 10,
        }}
      >
        {slots.map((src, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1',
              borderRadius: 3,
              overflow: 'hidden',
              background: PK.paper3,
              position: 'relative',
            }}
          >
            {src ? (
              <img
                src={src}
                alt=""
                loading={index < 4 ? 'eager' : 'lazy'}
                decoding="async"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'saturate(0.92) contrast(1.02)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: PK.inkMute,
                  opacity: 0.4,
                }}
              >
                <Utensils size={18} strokeWidth={1.5} />
              </div>
            )}
            <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }} />
          </div>
        ))}
      </div>

      {/* Footer: description meta (if any) · Open → */}
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          color: PK.inkMute,
        }}
      >
        <span
          style={{
            fontStyle: 'italic',
            fontFamily: fSerif,
            fontSize: 13,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {cookbook.description || ' '}
        </span>
        <span
          style={{
            color: PK.ink,
            borderBottom: `1px solid ${PK.ink}`,
            paddingBottom: 1,
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          Open →
        </span>
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        onClick={onSelect}
        style={{ ...shell, display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        {body}
      </button>
    );
  }

  return (
    <Link to={`/cookbook/${cookbook.id}`} className="block" style={shell}>
      {body}
    </Link>
  );
}
