export default function RecipeCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-md)',
        animation: 'fadeUp 0.4s ease both',
        animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
      }}
    >
      <div className="relative" style={{ aspectRatio: '3 / 4' }}>
        {/* Image placeholder */}
        <div
          className="absolute inset-0"
          style={{
            background: 'var(--warm)',
            animation: 'skeleton-pulse 1.5s ease-in-out infinite',
          }}
        />

        {/* Bottom overlay mimicking the glass bar */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            padding: '10px 12px',
            borderRadius: '0 0 var(--radius) var(--radius)',
            background: 'var(--glass-bg)',
          }}
        >
          {/* Title placeholder */}
          <div
            style={{
              height: 14,
              width: '75%',
              borderRadius: 4,
              background: 'var(--border)',
              animation: 'skeleton-pulse 1.5s ease-in-out infinite',
            }}
          />
          {/* Meta placeholder */}
          <div className="flex gap-3 mt-2">
            <div
              style={{
                height: 12,
                width: 48,
                borderRadius: 4,
                background: 'var(--border)',
                animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                animationDelay: '0.2s',
              }}
            />
            <div
              style={{
                height: 12,
                width: 56,
                borderRadius: 4,
                background: 'var(--border)',
                animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                animationDelay: '0.4s',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
