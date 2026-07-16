# Pie Keeper — App Store release checklist

This file is the source of truth for the first iOS release. Do not submit until every **Required before review** item is checked on the actual TestFlight build.

## Release identity

- App name: **Pie Keeper**
- Bundle ID: `au.com.pompon.piekeeper`
- SKU suggestion: `au.com.pompon.piekeeper`
- Version: `1.0.0`
- Category: **Food & Drink**
- Secondary category: **Lifestyle**
- Age rating: complete the questionnaire truthfully; the current app has no objectionable content, gambling, unrestricted web browsing, or user-to-user public content.
- Privacy policy: `https://piekeeper.com/privacy`
- Support URL: `https://piekeeper.com/support`
- Marketing URL: `https://piekeeper.com`
- Contact: `hello@pompon.com.au`

The bundle ID becomes difficult to change after the App Store record is created. Confirm that `au.com.pompon.piekeeper` is available in the Apple Developer account before creating the record.

## Suggested metadata

**Subtitle (30 characters max)**

`Save recipes. Cook with ease.`

**Promotional text**

`A calm, practical home for the recipes you actually cook.`

**Description**

> Pie Keeper turns recipes from around the web into a tidy personal cookbook.
>
> Save a recipe from its URL or add your own, then keep the useful parts close: ingredients, steps, timings, notes and the original source. Organise favourites into cookbooks, plan meals for the week and take a combined shopping list to the store.
>
> In the kitchen, scale servings, tick off ingredients and steps, and keep the screen awake while you cook. Optional family sharing lets two cooks work from the same collection.
>
> No advertising. No public feed. Just your recipes, ready when you need them.

**Keywords (100 characters max)**

`recipes,cookbook,meal planner,shopping list,cooking,recipe saver,organiser`

Only mention share-sheet capture after it passes the TestFlight acceptance test below. Do not mention pricing, subscriptions, or Android in the iOS metadata.

## App privacy answers

The binary declares no tracking and the app contains no ad or analytics SDK. App Store Connect should match the app privacy manifest and policy:

- Contact Info → Email Address: collected, linked to identity, App Functionality.
- Contact Info → Name: collected, linked to identity, App Functionality.
- Identifiers → User ID: collected, linked to identity, App Functionality.
- User Content → Other User Content: collected, linked to identity, App Functionality. This covers saved recipes, notes, cookbooks, meal plans, preferences and sharing choices.
- User Content → Photos or Videos: collected, linked to identity, App Functionality. Recipe-scan uploads are private and deleted after processing; a selected dish photo may be retained as the saved recipe cover.
- Do not select tracking or third-party advertising.

Supabase provides authentication/database/storage. Groq processes recipe-page content and user-selected recipe photos for structured extraction. Both services, temporary scan uploads and the short-lived local/offline cache are described in the privacy policy.

## Content rights

Pie Keeper imports content only when the user supplies or shares a public source, preserves the source URL, and stores the result in that user's private collection. In App Store Connect, answer the Content Rights questions truthfully and declare that the app can access third-party content. Before naming a social platform in metadata or screenshots, confirm that the production import method complies with that platform's terms; otherwise keep the first-release claims to public recipe webpages and manual recipe creation.

## Review account and notes

Create a stable production demo account immediately before submission. Store its password in the team password manager, not in Git. Seed it with at least six visually varied recipes, one cookbook, favourites, notes and a populated meal-plan week. Keep the account and backend available for the entire review.

Suggested Notes for Review:

> Pie Keeper is a native recipe manager. The supplied demo account contains sample recipes so every feature can be reviewed immediately.
>
> To import a recipe, open Add, choose “From a URL”, and use a public recipe URL. Manual recipe creation is also available. Open any recipe to scale servings, check ingredients and steps, add notes, keep the screen awake, add it to a cookbook or meal plan, and delete it.
>
> Pie Keeper also installs an iOS Share Extension. From Safari or a supported social app, share a public recipe link to Pie Keeper; the app opens and imports the recipe into the signed-in account.
>
> Account deletion is available in Profile → Delete account and permanently removes the account and associated data. Privacy Policy and Support are also linked from Profile and the sign-in screen.
>
> The app uses email/password authentication only. It has no purchases, subscriptions, advertising or tracking and does not require special hardware.

Add the demo email and password only to App Store Connect's secure Sign-In Information fields.

## Required before review

- [x] SDK 54 package versions are pinned to compatible releases.
- [x] iOS bundle identifier, build number seed and EAS production profile are configured.
- [x] Privacy manifest and export-compliance declaration are configured.
- [x] The 1024×1024 app icon has no alpha channel.
- [x] Privacy and support pages exist and are linked in the app.
- [x] In-app account deletion is implemented and verified against production.
- [x] Password recovery is implemented.
- [ ] Join the Apple Developer Program and accept all current agreements.
- [ ] Log in to Expo (`npx eas-cli@latest login`) and initialise/link the project (`npx eas-cli@latest init`).
- [ ] Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the EAS production environment. They are public client identifiers, but EAS still needs them at build time.
- [ ] Confirm or reserve bundle IDs `au.com.pompon.piekeeper` and `au.com.pompon.piekeeper.share-extension`, plus app group `group.au.com.pompon.piekeeper`, then create the App Store Connect app record.
- [ ] Create and seed the dedicated App Review account.
- [ ] Build with `npx eas-cli@latest build --platform ios --profile production`.
- [ ] Upload to TestFlight and resolve every processing warning, including any required-reason API email from Apple.
- [ ] Test the exact TestFlight build on at least one current iPhone and one older supported iPhone.
- [ ] Capture App Store screenshots from the final build; do not use mock UI or show unshipped features.
- [ ] Complete App Privacy, Age Rating, Content Rights, encryption/export compliance and contact details in App Store Connect.
- [ ] Add the demo credentials and the review notes above.
- [ ] Submit manually first; do not enable automatic release until the first review is approved.

## TestFlight acceptance pass

Run all tests on a release/TestFlight build, not Expo Go:

1. Fresh install → onboarding → create account → sign out → sign in.
2. Forgot password → email link → choose new password → sign in on the phone.
3. Home loads recipes on Wi-Fi and cellular; pull-to-refresh, search, filters and favourites work.
4. Import one public recipe URL, manually create another, edit both and delete one.
5. Share a public recipe URL from Safari to Pie Keeper; repeat from each supported social app and confirm the expected account receives the recipe once only.
6. Recipe cooking flow: servings, ingredients, steps, notes, keep-awake and source/video links.
7. Cookbooks: create, rename, add/remove recipes and delete without deleting recipes.
8. Meal plan: add/remove meals, change weeks, mark cooked and check shopping items.
9. Family sharing with a second account, including leaving/removing a member.
10. Airplane mode after a successful sync: cached recipes remain readable and no action falsely reports success.
11. Light, dark and large Dynamic Type; smallest and largest supported iPhone sizes; VoiceOver labels and 44-point tap targets.
12. Sign out, sign in as a different account and confirm the first account's cached recipes never appear.
13. Delete a disposable account in Profile and confirm it can no longer sign in.

## Known non-code gates

An App Store approval can never be guaranteed. The two hard external gates are an active Apple Developer membership and a successful signed archive/TestFlight pass. EAS is not currently authenticated in this workspace, so those steps require the account holder. Local Expo Doctor passes every project check; its only failure is that CocoaPods is not installed on this Mac. EAS supplies CocoaPods in its cloud build image.
