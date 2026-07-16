import assert from 'node:assert/strict';
import {
  extractNumberedRecipeSteps,
  extractSharedUrl,
  getSocialPlatform,
  looksLikeRecipeText,
  socialSourceToHtml,
} from '../supabase/functions/import-recipe/social-source.ts';

assert.equal(getSocialPlatform('https://www.instagram.com/reel/ABC123/'), 'instagram');
assert.equal(getSocialPlatform('https://vm.tiktok.com/ZM123/'), 'tiktok');
assert.equal(getSocialPlatform('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
assert.equal(getSocialPlatform('https://www.facebook.com/reel/123'), 'facebook');
assert.equal(getSocialPlatform('https://pin.it/abc123'), 'pinterest');
assert.equal(getSocialPlatform('https://www.recipetineats.com/chicken-curry'), null);

assert.equal(
  extractSharedUrl('Try this recipe! https://www.instagram.com/reel/ABC123/?igsh=xyz'),
  'https://www.instagram.com/reel/ABC123/?igsh=xyz',
);
assert.equal(extractSharedUrl('No URL in this share payload'), null);

const completeCaption = `
Creamy tomato pasta
Ingredients:
250 g pasta
2 tbsp olive oil
3 cloves garlic
400 g tomatoes
Instructions:
1. Cook the pasta until al dente.
2. Fry the garlic in oil, add tomatoes and simmer for 15 minutes.
3. Stir through the pasta and serve.
`;
assert.equal(looksLikeRecipeText(completeCaption), true);
assert.equal(looksLikeRecipeText('The best dinner ever! Full recipe in my bio #food'), false);
assert.deepEqual(
  extractNumberedRecipeSteps(
    '1 cup flour 1/2 tsp salt 1. Mix the flour and salt. 2. Bake for 20 minutes. 3. Cool, then serve.',
  ),
  ['Mix the flour and salt.', 'Bake for 20 minutes.', 'Cool, then serve.'],
);

const html = socialSourceToHtml({
  platform: 'instagram',
  canonicalUrl: 'https://www.instagram.com/reel/ABC123/',
  title: 'Creamy tomato pasta',
  creatorName: 'Example Cook',
  caption: completeCaption,
  transcript: null,
  imageUrl: 'https://images.example.com/pasta.jpg?a=1&b=2',
  mediaUrl: null,
  externalUrls: [],
});
assert.match(html, /\[Social platform\]: instagram/);
assert.match(html, /\[Creator\]: Example Cook/);
assert.match(html, /property="og:image"/);
assert.match(html, /a=1&amp;b=2/);

console.log('social-source tests passed');
