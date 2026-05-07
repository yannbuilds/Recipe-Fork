interface CookbookEmptyStateProps {
  onCreate: () => void;
}

export default function CookbookEmptyState({ onCreate }: CookbookEmptyStateProps) {
  return (
    <div
      className="text-center py-16 px-4"
      style={{ animation: 'fadeUp 0.4s ease 0.1s both' }}
    >
      <span className="block" style={{ fontSize: 64 }}>
        📖
      </span>
      <h2
        className="rf-heading text-xl font-bold mt-4"
        style={{ color: 'var(--text)' }}
      >
        Build your first cookbook
      </h2>
      <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: 'var(--muted)' }}>
        Group your recipes into collections like “Weeknight dinners” or “Christmas 2026”.
        It’s a faster way to find what you want to cook.
      </p>
      <button onClick={onCreate} className="rf-btn rf-btn-filled mt-6">
        + Create cookbook
      </button>
    </div>
  );
}
