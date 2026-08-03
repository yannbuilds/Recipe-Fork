import assert from 'node:assert/strict';
import {
  dedupeRecipesBySource,
  findRecipeWithSameSource,
  normalizeRecipeSourceUrl,
  recipeSourceKey,
} from '../packages/shared/src/recipeSource.ts';

assert.equal(
  recipeSourceKey('https://www.recipetineats.com/chicken-curry/'),
  recipeSourceKey('http://recipetineats.com/chicken-curry'),
  'protocol, www and a trailing slash do not create a second recipe',
);

assert.equal(
  recipeSourceKey('https://example.com/dinner/?utm_source=facebook&fbclid=123#recipe'),
  recipeSourceKey('https://example.com/dinner'),
  'tracking parameters and fragments are ignored',
);

assert.notEqual(
  recipeSourceKey('https://example.com/recipe?id=1'),
  recipeSourceKey('https://example.com/recipe?id=2'),
  'meaningful query parameters still distinguish recipes',
);

assert.equal(
  normalizeRecipeSourceUrl(' https://example.com/dinner/?utm_source=mail#recipe '),
  'https://example.com/dinner',
  'saved URLs are cleaned as well as compared',
);

const records = [
  { id: 'shared', user_id: 'family-member', source_url: 'https://example.com/dinner/' },
  { id: 'mine', user_id: 'me', source_url: 'https://www.example.com/dinner' },
  { id: 'manual-1', user_id: 'me', source_url: '' },
  { id: 'manual-2', user_id: 'me', source_url: '' },
];

assert.deepEqual(
  dedupeRecipesBySource(records, 'me').map((record) => record.id),
  ['mine', 'manual-1', 'manual-2'],
  'the current user copy wins and recipes without a URL remain separate',
);

assert.equal(findRecipeWithSameSource(records, 'https://example.com/dinner')?.id, 'shared');

console.log('Recipe source normalization: all tests passed');
