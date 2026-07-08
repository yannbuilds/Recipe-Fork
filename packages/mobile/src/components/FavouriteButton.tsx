import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

interface Props {
  recipeId: string;
  isFavourite: boolean;
  onToggle: (next: boolean) => void;
  size?: 'sm' | 'md';
}

export default function FavouriteButton({ recipeId, isFavourite, onToggle, size = 'sm' }: Props) {
  const t = useTheme();
  const dim = size === 'sm' ? 30 : 38;
  const icon = size === 'sm' ? 17 : 21;

  async function handlePress() {
    const next = !isFavourite;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle(next); // optimistic
    const { error } = await supabase.from('recipes').update({ is_favourite: next }).eq('id', recipeId);
    if (error) onToggle(!next); // revert
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        backgroundColor: 'rgba(251,248,241,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={isFavourite ? 'heart' : 'heart-outline'}
        size={icon}
        color={isFavourite ? t.red : t.muted}
      />
    </Pressable>
  );
}
