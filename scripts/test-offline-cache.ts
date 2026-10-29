import assert from 'node:assert/strict';
import { accountScopedStorage } from '../packages/shared/src/accountCache';
import { QueryClient, QueryObserver, dehydrate, hydrate } from '@tanstack/react-query';

async function main() {
const values = new Map<string, string>();
let owner: string | null = 'yann';
const storage = accountScopedStorage({
  getItem: async key => values.get(key) ?? null,
  setItem: async (key, value) => { values.set(key, value); },
  removeItem: async key => { values.delete(key); },
}, async () => owner);

await storage.setItem('cache', 'saved recipes');
assert.equal(await storage.getItem('cache'), 'saved recipes');
owner = 'dafne';
assert.equal(await storage.getItem('cache'), null, 'another account cannot restore private data');
owner = null;
assert.equal(await storage.getItem('cache'), null, 'signed-out restore is empty');
await storage.setItem('signed-out', 'must not save');
assert.equal(values.has('signed-out'), false);
owner = 'yann';
values.set('legacy', JSON.stringify({ clientState: { queries: ['unowned recipes'] } }));
assert.equal(await storage.getItem('legacy'), null, 'legacy unowned data is rejected');
values.set('corrupt', '{');
assert.equal(await storage.getItem('corrupt'), null, 'corrupt disk data cannot break boot');
await storage.removeItem('cache');
assert.equal(await storage.getItem('cache'), null);

let reads = 0;
const switchingStorage = accountScopedStorage({
  getItem: async () => JSON.stringify({ owner: 'yann', value: 'private' }),
  setItem: async () => {}, removeItem: async () => {},
}, async () => ++reads === 1 ? 'yann' : 'dafne');
assert.equal(await switchingStorage.getItem('cache'), null, 'account switch during hydration discards the snapshot');

// Exercise the real query cache used by native screens: restore must beat the
// empty fallback mounted while AsyncStorage is still hydrating.
const options = { defaultOptions: { queries: { retry: false, gcTime: Infinity } } } as const;
const previous = new QueryClient(options);
const queryKey = ['offline-state', 'yann', 'plan:2026-10-25'];
previous.setQueryData(queryKey, { id: 'saved-plan' }, { updatedAt: 1000 });
const snapshot = JSON.parse(JSON.stringify(dehydrate(previous)));
const current = new QueryClient(options);
const observer = new QueryObserver(current, { queryKey, enabled: false, initialData: null, initialDataUpdatedAt: 0 });
hydrate(current, snapshot);
assert.deepEqual(current.getQueryData(queryKey), { id: 'saved-plan' });
const recipeKey = ['recipe', 'soup'];
current.setQueryData(recipeKey, { title: 'Saved soup', steps: ['Cook'] });
await current.fetchQuery({ queryKey: recipeKey, queryFn: async () => { throw new Error('Offline'); } }).catch(() => {});
assert.deepEqual(current.getQueryData(recipeKey), { title: 'Saved soup', steps: ['Cook'] }, 'failed refresh preserves the full recipe');
current.clear();
assert.equal(current.getQueryData(recipeKey), undefined, 'sign-out clears memory');
observer.destroy();
previous.clear();
console.log('Offline cache checks passed: account isolation, corrupt/legacy storage, auth race, native hydration, failed refresh, and sign-out.');

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
