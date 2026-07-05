// Loading placeholder matching the editorial RecipeCard (photo + caption below).
export default function RecipeCardSkeleton({ index = 0 }: { index?: number }) {
  const pulse = 'skeleton-pulse 1.5s ease-in-out infinite';
  return (
    <div
      style={{
        animation: 'fadeUp 0.4s ease both',
        animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
      }}
    >
      {/* Image placeholder */}
      <div
        style={{
          aspectRatio: '4 / 5',
          borderRadius: 4,
          background: 'var(--paper3)',
          animation: pulse,
        }}
      />
      {/* Caption placeholders */}
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 16, width: '80%', borderRadius: 4, background: 'var(--border)', animation: pulse }} />
        <div
          style={{
            height: 10,
            width: '50%',
            borderRadius: 4,
            marginTop: 8,
            background: 'var(--border)',
            animation: pulse,
            animationDelay: '0.2s',
          }}
        />
      </div>
    </div>
  );
}
