import type { Recipe } from '@recipe-aggregator/shared';

function App() {
  const sampleRecipe: Recipe = {
    id: 'demo',
    title: 'Hello World Recipe',
    description: 'A placeholder to prove the shared package works.',
    ingredients: [{ item: 'React', quantity: '1', unit: 'framework' }],
    steps: [{ order: 1, instruction: 'Build something great.' }],
    source_url: '',
    image_url: null,
    servings: null,
    prep_time: null,
    cook_time: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Recipe Aggregator
        </h1>
        <p className="text-lg text-gray-600">
          Shared package works — loaded recipe: <strong>{sampleRecipe.title}</strong>
        </p>
      </div>
    </div>
  );
}

export default App;
