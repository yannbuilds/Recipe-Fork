# Ingredient highlighting

The web and mobile detail pages calculate ingredient mentions from the current
ingredients and steps, then bold them using native text elements. Instructions
remain plain text; no HTML or Markdown is saved. Since 10 October 2026,
highlighting applies automatically to all new recipes, including extension,
URL, photo, pasted-text and manual imports. No backfill is needed after saving
or editing a recipe; saved `steps[].ingredient_mentions` are optional metadata.

The initial Hot Honey Wings trial can be previewed or refreshed individually:

```sh
npm run highlight:steps -- --recipe a22afe90-4631-4c7a-9b99-2cb342fffbf4
npm run highlight:steps -- --recipe a22afe90-4631-4c7a-9b99-2cb342fffbf4 --apply
```

The user approved the collection rollout on 9 October 2026. All 446 recipes
(440 owned and 6 family-shared) were updated and verified against backups in
`.backups/ingredient-highlighting`. Preview and refresh the owner's collection:

```sh
npm run highlight:steps -- --all --user-id aa767476-981d-4c0e-9345-937c83ad31cd
npm run highlight:steps -- --all --user-id aa767476-981d-4c0e-9345-937c83ad31cd --apply
```

The six family-shared recipes use owner ID
`ef04ae43-c854-4702-9cd4-6114343b685f`. Repeat the same commands with that ID
when refreshing the whole visible collection. Repeated runs skip recipes
whose annotations are already current.

These commands use the existing `.env` Supabase service credentials. Default is
read-only. Apply saves a JSON backup before writing, checks each recipe's
`updated_at` to avoid overwriting concurrent edits, and reads each result back.
Use `--backup-dir <path>` for a permanent backup location (default is temporary
storage at `/private/tmp/recipe-fork-highlighting`). Restore a recipe by writing
its original `steps` from the backup to the same recipe ID in Supabase.

Matching is deterministic: ingredient names, common preparation prefixes,
singular/plural forms, alternatives, and food nouns such as eggs, garlic, oil,
vinegar, pasta and wings. Nested source notes are ignored. Longest names win
and whole-word boundaries prevent matching `salt`
inside `saltwater`. It does not infer pronouns, mixtures such as “the dressing”,
or every possible synonym. Review the preview before a bulk run; extend aliases
if needed. The command remains available to refresh stored metadata, but the
detail pages do not depend on it.

Web deploys from main. Mobile includes the same rendering but needs an updated
native build (the app currently has no EAS Update configuration).
