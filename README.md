# Recipe Fork

A personal recipe management system with a web app for browsing and organising recipes, and a Chrome extension for saving recipes from any website using AI-powered parsing.

## Architecture

```
Chrome Extension  ──→              ←──  Web App (React)
                      Supabase API
Mobile App  ──────→   (future)     ←──  Future clients...
                           │
                      PostgreSQL DB
```

All clients share the same backend (Supabase). No custom API layer needed – each client talks directly to Supabase using the JS client library.

## Tech Stack

| Layer          | Technology            | Why                                                    |
| -------------- | --------------------- | ------------------------------------------------------ |
| Database + API | Supabase (free tier)  | Postgres DB with auto-generated API, auth, and hosting |
| Web App        | React + TypeScript    | Component-based, transfers to React Native later       |
| Chrome Ext     | TypeScript + Supabase | Lightweight popup that saves recipes to the same DB    |
| AI Parsing     | Claude API            | Extracts structured recipe data from any webpage       |
| Monorepo       | npm workspaces        | Keeps everything in one repo with shared code          |
| Styling        | Tailwind CSS          | Utility-first, fast to prototype                       |

## Project Structure

```
recipe-aggregator/
├── packages/
│   ├── web/                ← React web app (Vite + React + TypeScript)
│   │   ├── src/
│   │   │   ├── components/ ← UI components (RecipeList, RecipeCard, RecipeForm, etc.)
│   │   │   ├── pages/      ← Page-level components (Home, RecipeDetail, etc.)
│   │   │   ├── hooks/      ← Custom React hooks (useRecipes, useAuth, etc.)
│   │   │   ├── lib/        ← Utilities and helpers
│   │   │   └── App.tsx     ← Root component with routing
│   │   └── package.json
│   │
│   ├── extension/          ← Chrome extension
│   │   ├── src/
│   │   │   ├── popup/      ← Extension popup UI
│   │   │   ├── content/    ← Content script (reads page data)
│   │   │   └── background/ ← Service worker
│   │   ├── manifest.json   ← Chrome extension manifest (v3)
│   │   └── package.json
│   │
│   └── shared/             ← Shared code used by all packages
│       ├── src/
│       │   ├── supabase.ts ← Supabase client initialisation
│       │   ├── types.ts    ← TypeScript types (Recipe, Tag, etc.)
│       │   └── utils.ts    ← Shared helper functions
│       └── package.json
│
├── supabase/
│   └── migrations/         ← SQL migration files for the database schema
│
├── .env.example            ← Template for environment variables
├── .gitignore
├── package.json            ← Root package.json (npm workspaces config)
├── tsconfig.base.json      ← Shared TypeScript config
└── README.md
```

## Database Schema

### `recipes` table

| Column      | Type        | Notes                                   |
| ----------- | ----------- | --------------------------------------- |
| id          | uuid        | Primary key, auto-generated             |
| title       | text        | Recipe name                             |
| description | text        | Short summary (nullable)                |
| ingredients | jsonb       | Array of { item, quantity, unit }       |
| steps       | jsonb       | Array of { order, instruction }         |
| source_url  | text        | Original URL where the recipe was found |
| image_url   | text        | Recipe image URL (nullable)             |
| servings    | integer     | Number of servings (nullable)           |
| prep_time   | integer     | Prep time in minutes (nullable)         |
| cook_time   | integer     | Cook time in minutes (nullable)         |
| created_at  | timestamptz | Auto-set on insert                      |
| updated_at  | timestamptz | Auto-updated on change                  |

### `tags` table

| Column | Type | Notes                       |
| ------ | ---- | --------------------------- |
| id     | uuid | Primary key, auto-generated |
| name   | text | Tag name (unique)           |

### `recipe_tags` table (join table)

| Column    | Type | Notes           |
| --------- | ---- | --------------- |
| recipe_id | uuid | FK → recipes.id |
| tag_id    | uuid | FK → tags.id    |

## Build Phases

### Phase 1 – Foundation

- [x] Create README
- [x] Initialise monorepo with npm workspaces
- [x] Set up shared package with Supabase client and TypeScript types
- [x] Create Supabase project and database schema (recipes, tags, recipe_tags)
- [x] Seed the database with 2–3 sample recipes for testing

### Phase 2 – Web App (Read)

- [x] Scaffold React app with Vite
- [x] Build RecipeList page – fetch and display all recipes
- [x] Build RecipeDetail page – show full recipe with ingredients and steps
- [x] Add basic routing (home → recipe detail)
- [x] Style with Tailwind CSS

### Phase 3 – Web App (Write)

- [x] Add a form to manually create a recipe
- [x] Add edit functionality for existing recipes
- [x] Add delete with confirmation
- [x] Add tagging (create tags, assign to recipes, filter by tag)
- [x] Add search (by title and ingredients)

### Phase 4 – Chrome Extension

- [x] Scaffold Chrome extension (manifest v3)
- [x] Build popup UI with "Save Recipe" button
- [ ] Content script to grab page HTML
- [ ] Send HTML to Claude API for structured recipe extraction
- [ ] Save parsed recipe to Supabase
- [ ] Show success/error state in popup

### Phase 5 – Polish

- [ ] Replace the browser confirm dialog on recipe delete with a styled modal component that matches the app's design
- [ ] Responsive design for mobile browsers
- [ ] Image handling (save images to Supabase Storage)
- [ ] Favourites / rating system
- [ ] Meal planning view (optional)
- [ ] Auth (if sharing with Dafne later)

### Phase 6 – Mobile App (Future)

- [ ] React Native app using the shared package
- [ ] Same Supabase connection, same data

## Setup

### Prerequisites

- Node.js 18+
- npm 9+
- A Supabase account (free tier – https://supabase.com)
- A Claude API key (for recipe parsing in Phase 4)

### Environment Variables

Create a `.env` file in the root (or in each package) with:

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
CLAUDE_API_KEY=your-claude-api-key  # Only needed for Phase 4
```

## Learning Log

Track what you learn each session here.

### Session 1 – [date]

-
-
-
