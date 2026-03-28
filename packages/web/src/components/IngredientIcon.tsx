import { useState } from 'react';
import { getIngredientImageUrl, FALLBACK_EMOJI } from '../utils/ingredientImages';

export default function IngredientIcon({ item }: { item: string }) {
  const imgUrl = getIngredientImageUrl(item);
  const [failed, setFailed] = useState(false);

  if (!imgUrl || failed) {
    return (
      <span
        className="flex items-center justify-center shrink-0 rounded-md text-sm"
        style={{ width: 36, height: 36 }}
      >
        {FALLBACK_EMOJI}
      </span>
    );
  }

  return (
    <img
      src={imgUrl}
      alt=""
      className="shrink-0 rounded-md"
      style={{ width: 36, height: 36, objectFit: 'contain' }}
      onError={() => setFailed(true)}
    />
  );
}
