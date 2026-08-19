import { useLocalSearchParams } from 'expo-router';
import RecipeFormScreen from '@/components/RecipeFormScreen';

export default function EditRecipe() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  return <RecipeFormScreen recipeId={id} forceStructured={mode === 'fields'} />;
}
