import { Link } from 'react-router-dom';
import type { Cookbook } from '@recipe-aggregator/shared';

interface CookbookCardProps {
  cookbook: Cookbook;
  recipeCount: number;
  coverImages: string[]; // up to 4
  index?: number;
}

export default function CookbookCard({ cookbook, recipeCount, coverImages, index = 0 }: CookbookCardProps) {
  const emoji = cookbook.emoji || '📖';
  const slots = [0, 1, 2, 3].map((i) => coverImages[i] ?? null);

  return (
    <Link
      to={`/cookbook/${cookbook.id}`}
      className="block overflow-hidden rf-card-hover relative"
      style={{
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-md)',
        animation: 'fadeUp 0.4s ease both',
        animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
        // Gradient border treatment to make cookbooks stand out
        background:
          'linear-gradient(var(--card), var(--card)) padding-box, linear-gradient(135deg, var(--green) 0%, var(--green-light) 100%) border-box',
        border: '1.5px solid transparent',
      }}
    >
      <div className="relative" style={{ aspectRatio: '3 / 4' }}>
        {/* Cover: 2x2 collage or fallback */}
        {recipeCount === 0 ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--warm) 0%, var(--warm-dark) 100%)',
            }}
          >
            <span style={{ fontSize: 56 }}>{emoji}</span>
            <span className="text-xs mt-2" style={{ color: 'var(--muted)', fontWeight: 600 }}>
              Empty
            </span>
          </div>
        ) : (
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 2 }}
          >
            {slots.map((src, i) =>
              src ? (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="w-full h-full object-cover"
                  loading={index < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              ) : (
                <div
                  key={i}
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, var(--warm) 0%, var(--warm-dark) 100%)',
                    fontSize: 22,
                  }}
                >
                  {emoji}
                </div>
              )
            )}
          </div>
        )}

        {/* Gradient scrim */}
        <div className="rf-scrim absolute inset-0" />

        {/* Cookbook badge: top-left */}
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(4px)',
            fontSize: 11,
            color: 'var(--green)',
            fontWeight: 600,
          }}
        >
          <span>{emoji}</span>
          Cookbook
        </div>

        {/* Title + meta overlay */}
        <div
          className="absolute bottom-0 left-0 right-0 rf-glass flex flex-col justify-start"
          style={{
            padding: '86px 12px 16px',
            height: 170,
            borderRadius: '0 0 var(--radius) var(--radius)',
            ['--glass-bg' as string]: 'rgba(20, 20, 22, 0.92)',
          }}
        >
          <h2
            className="rf-heading leading-snug line-clamp-2"
            style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.95)',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
            }}
          >
            {cookbook.name}
          </h2>
          <div
            className="flex items-center gap-3 mt-auto"
            style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}
          >
            <span>
              {recipeCount} {recipeCount === 1 ? 'recipe' : 'recipes'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
