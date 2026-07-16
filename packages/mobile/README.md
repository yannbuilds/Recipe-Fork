# Pie Keeper Mobile

Expo (React Native) app for iOS and Android. Phase 0–1 scope: sign in, browse recipes, cook from the recipe screen (keeps the phone awake).

## Run it on your phone (Expo Go)

1. Install **Expo Go** from the App Store / Play Store.
2. From the repo root: `npm run dev:mobile`
3. Scan the QR code in the terminal with your phone camera (iOS) or the Expo Go app (Android). Phone and Mac must be on the same wifi.
4. Sign in with your existing Pie Keeper account (same as the web app).

## Config

Supabase credentials live in `.env` (gitignored). See `.env.example` — values are the same as the repo root `.env`.

## Notes

- Types come from `@recipe-aggregator/shared` (types only — the shared Supabase client is web-specific, mobile has its own in `src/lib/supabase.ts`).
- The share-sheet save flow (Phase 2) requires a dev build via EAS, not Expo Go, and an Apple Developer account for iOS.

## Production iOS release

The release configuration lives in `app.json` and `eas.json`. Follow
[`APP_STORE_SUBMISSION.md`](./APP_STORE_SUBMISSION.md) for App Store metadata,
privacy answers, reviewer notes, TestFlight acceptance tests, and the remaining
Apple/Expo account steps.
