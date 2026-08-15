import RecipeFormScreen from '@/components/RecipeFormScreen';
import { useLocalSearchParams } from 'expo-router';

export default function NewRecipeManual() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <RecipeFormScreen forceStructured={mode === 'fields'} />;
}
