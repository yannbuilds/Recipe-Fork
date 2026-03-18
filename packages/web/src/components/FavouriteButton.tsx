import { supabase } from '@recipe-aggregator/shared';

interface FavouriteButtonProps {
  recipeId: string;
  isFavourite: boolean;
  onToggle: (newValue: boolean) => void;
  size?: 'sm' | 'md';
}

export default function FavouriteButton({ recipeId, isFavourite, onToggle, size = 'sm' }: FavouriteButtonProps) {
  const px = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const iconSize = size === 'sm' ? 18 : 24;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !isFavourite;
    onToggle(next); // optimistic
    const { error } = await supabase
      .from('recipes')
      .update({ is_favourite: next })
      .eq('id', recipeId);
    if (error) onToggle(!next); // revert on failure
  }

  return (
    <button
      onClick={handleClick}
      className={`${px} flex items-center justify-center rounded-full bg-white/80 hover:bg-white transition-colors shadow-sm`}
      aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          fill: isFavourite ? 'var(--red)' : 'none',
          stroke: isFavourite ? 'var(--red)' : 'var(--muted)',
        }}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
