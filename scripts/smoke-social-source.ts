import assert from 'node:assert/strict';
import { fetchSocialSource } from '../supabase/functions/import-recipe/social-source.ts';

async function main() {
  const tiktok = await fetchSocialSource(
    'https://www.tiktok.com/@scout2015/video/6718335390845095173',
  );
  assert.equal(tiktok?.platform, 'tiktok');
  assert.match(tiktok?.caption ?? '', /Scramble up ur name/i);
  assert.equal(tiktok?.creatorName, 'Scout, Suki & Stella');
  assert.match(tiktok?.imageUrl ?? '', /^https:\/\//);

  const youtube = await fetchSocialSource('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(youtube?.platform, 'youtube');
  assert.match(youtube?.title ?? '', /Never Gonna Give You Up/i);
  assert.match(youtube?.caption ?? '', /official video/i);
  assert.match(youtube?.imageUrl ?? '', /^https:\/\//);

  console.log('social-source live smoke tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
