/** Defaults to a read-only preview. See docs/ingredient-highlighting.md. */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { annotateStepIngredients, stepTextParts } from '../packages/shared/src/stepIngredients.ts';
import type { Ingredient, Step } from '../packages/shared/src/types.ts';

async function main() {
  const { values } = parseArgs({ options: {
    recipe: { type: 'string' },
    'user-id': { type: 'string' },
    all: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    'backup-dir': { type: 'string', default: '/private/tmp/recipe-fork-highlighting' },
  } });
  if (Boolean(values.recipe) === Boolean(values.all) || (values.all && !values['user-id'])) {
    throw new Error('Choose --recipe <id>, or --all --user-id <owner-id>. Add --apply only to save.');
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase URL or service role key.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  type Row = { id: string; user_id: string; title: string; ingredients: Ingredient[]; steps: Step[]; updated_at: string };
  const recipes: Row[] = [];
  // Explicit owner scope and pagination keep the eventual full rollout bounded.
  for (let offset = 0; ; offset += 500) {
    let query = db.from('recipes').select('id,user_id,title,ingredients,steps,updated_at').order('id').range(offset, offset + 499);
    if (values.recipe) query = query.eq('id', values.recipe);
    if (values['user-id']) query = query.eq('user_id', values['user-id']);
    const { data, error } = await query;
    if (error) throw error;
    recipes.push(...data as Row[]);
    if (data.length < 500) break;
  }
  if (!recipes.length) throw new Error('No recipes matched. Nothing changed.');
  const changes = recipes.map((recipe) => ({ recipe, steps: annotateStepIngredients(recipe.steps, recipe.ingredients) }))
    .filter(({ recipe, steps }) => !isDeepStrictEqual(recipe.steps, steps));
  console.log(`${values.apply ? 'APPLY' : 'PREVIEW'}: ${recipes.length} recipes matched; ${changes.length} need updating.`);
  for (const { recipe, steps } of changes) {
    console.log(`\n${recipe.title} (${recipe.id})`);
    for (const step of steps) {
      console.log(`${step.order}. ${stepTextParts(step).map((part) => part.ingredient ? `**${part.text}**` : part.text).join('')}`);
    }
  }
  if (values.apply && changes.length) {
    const directory = values['backup-dir']!;
    await mkdir(directory, { recursive: true });
    const backup = `${directory}/before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(backup, JSON.stringify(changes.map(({ recipe }) => recipe), null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`\nOriginal steps backed up to ${backup}`);
    let saved = 0;
    for (const { recipe, steps } of changes) {
      // Never overwrite a recipe that was edited while the preview was prepared.
      const { data, error } = await db.from('recipes').update({ steps })
        .eq('id', recipe.id).eq('user_id', recipe.user_id).eq('updated_at', recipe.updated_at).select('id');
      if (error) throw error;
      if (data.length !== 1) throw new Error(`Recipe changed during this run: ${recipe.id}. ${saved} already saved; rerun to continue.`);
      saved++;
      const { data: stored, error: readError } = await db.from('recipes').select('steps').eq('id', recipe.id).single();
      if (readError) throw readError;
      if (!isDeepStrictEqual(stored.steps, steps)) throw new Error(`Read-back verification failed: ${recipe.id}`);
    }
    console.log(`\nSaved and verified ${saved} recipes. Instruction wording unchanged.`);
  } else if (!values.apply) {
    console.log('\nPreview only. Add --apply to save this selection.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
