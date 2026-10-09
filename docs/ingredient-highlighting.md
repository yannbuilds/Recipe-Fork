# Ingredient highlighting trial

The web and mobile detail pages bold `steps[].ingredient_mentions` using native
text elements. Instructions remain plain text; no HTML or Markdown is saved.
Recipes without that optional JSON field keep their existing appearance. Both
edit forms refresh the mentions when an opted-in recipe is saved.

Only the Hot Honey Wings recipe is authorised for the initial trial:

```sh
npm run highlight:steps -- --recipe a22afe90-4631-4c7a-9b99-2cb342fffbf4
npm run highlight:steps -- --recipe a22afe90-4631-4c7a-9b99-2cb342fffbf4 --apply
```

After the user approves the layout, preview and apply the owner's whole collection:

```sh
npm run highlight:steps -- --all --user-id aa767476-981d-4c0e-9345-937c83ad31cd
npm run highlight:steps -- --all --user-id aa767476-981d-4c0e-9345-937c83ad31cd --apply
```

These commands use the existing `.env` Supabase service credentials. Default is
read-only. Apply saves a JSON backup before writing, checks each recipe's
`updated_at` to avoid overwriting concurrent edits, and reads each result back.
Use `--backup-dir <path>` for a permanent backup location (default is temporary
storage at `/private/tmp/recipe-fork-highlighting`). Restore a recipe by writing
its original `steps` from the backup to the same recipe ID in Supabase.

Matching is deterministic: ingredient names, common preparation prefixes,
singular/plural forms, and selected shorthand (oil, vinegar, pepper, parsley,
wings). Longest names win and whole-word boundaries prevent matching `salt`
inside `saltwater`. It does not infer pronouns, mixtures such as “the dressing”,
or every possible synonym. Review the preview before a bulk run; extend aliases
if needed. New imports remain unchanged during the trial.

Web deploys from main. Mobile includes the same rendering but needs an updated
native build (the app currently has no EAS Update configuration).
