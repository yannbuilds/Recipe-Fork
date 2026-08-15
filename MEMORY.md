# Memory

_Last updated: 2026-07-04_

## Project State
<!-- High-level status of the project. Update when phases complete or scope changes. -->

- **Phase 1 – Monorepo + Supabase schema:** ✅ Done
- **Phase 2 – Web app (list, detail, create/edit/delete, tags, search):** ✅ Done
- **Phase 3 – Extension scaffold + popup UI:** ✅ Done
- **Phase 4 – Extension save flow (content script → Claude API → Supabase):** 🔲 In progress — stub in place, not yet wired
- **Phase 5 – Polish (delete modal, responsive, image storage, favourites, auth):** 🔲 In progress — email/password auth done, RLS policies written
- **Phase 6 – Deploy + OAuth:** 🔲 Not started
  1. 🔲 Choose hosting provider and deploy the web app (e.g. Vercel, Netlify, or VPS)
  2. 🔲 Set up a custom domain and point DNS
  3. 🔲 Update Supabase site URL and redirect URLs to use the new domain
  4. 🔲 Configure Google OAuth (Google Cloud Console + Supabase dashboard)
  5. 🔲 Configure Facebook OAuth (Meta Developer Console + Supabase dashboard)
  6. 🔲 Configure Apple OAuth (Apple Developer Console + Supabase dashboard)
  7. 🔲 Test all auth flows (email/password + 3 OAuth providers) on production

## Memory
<!-- Things Yann has asked to remember. Persistent — only remove or change if asked. -->

- **Git workflow:** Push directly to main. No PRs — this is Yann's own project. Always merge feature branches to main when done. This is also codified in CLAUDE.md's Git Workflow section ("Push live directly"). `main` is the Vercel production branch, so pushing it deploys straight to production.
  - **Watch for conflicting session setup:** Sessions launched from the web UI / a template may inject a session-level instruction to develop on a designated `claude/...` branch. That contradicts the push-to-main rule above. When it happens, honour the push-to-main intent (CLAUDE.md wins for defaults) unless Yann says otherwise. Ideally remove the branch requirement from wherever these sessions are launched so the two don't fight.
- **Deployment autonomy:** Handle deployment commands and authentication setup directly whenever possible instead of asking Yann to run commands. Only involve him when an external account presents an unavoidable approval, credential, or verification prompt.
