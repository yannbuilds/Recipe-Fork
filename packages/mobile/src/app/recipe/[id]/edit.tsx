import { useLocalSearchParams } from 'expo-router';
import RecipeFormScreen from '@/components/RecipeFormScreen';

export default function EditRecipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeFormScreen recipeId={id} />;
}
