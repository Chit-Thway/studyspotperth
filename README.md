# StudySpot Perth

StudySpot Perth is a web project for finding study-friendly libraries around Perth, with a focus on 24/7 options and clear entry and Wi-Fi information.

## Current status

The app opens directly to a responsive library finder, with a filter sidebar on desktop and expandable filters on mobile. The interface uses a quiet sage-and-ivory palette, labelled controls, and keyboard navigation.

Library listings and search are not connected to the interface yet. Sign-in and saved libraries are also inactive. Their controls are disabled, and the results area clearly shows that listings are unavailable.

The local backend stores versioned library records, opening and entry schedules, dated exceptions, and profile preferences. Draft edits remain separate from published records. Automated checks cover these data rules, database connectivity, and page routing.

The search backend evaluates Perth opening hours, entry rules, 24/7 access, Wi-Fi, and distance. Declared university cards personalise ranking and requirement labels; only selected filters restrict results. An optional end time shows session shortfalls without hiding libraries.

## Built with

- React and TypeScript for the interface
- Vite and CSS Modules for development and styling
- Cloudflare Pages and Functions for serving the app and backend
- Cloudflare D1 and Drizzle for database access
- Better Auth for the account infrastructure

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev:setup
npm run types:cloudflare
npm run db:migrate
npm run dev:pages
```

Open **http://localhost:8788**. The app and database run locally; a Cloudflare account is not required. Restart this command after changing frontend files.

For automatic frontend updates while developing, leave the local server running and run `npm run dev` in another terminal. Open the URL it prints.

The setup command creates `.dev.vars` with a random local secret and preserves an existing file. `.dev.vars.example` lists the available settings without secret values. Secrets, dependencies, build output, and local database files are excluded from Git. The database configuration in `wrangler.jsonc` is for local use only.

`npm run db:seed` loads clearly labelled fictional examples into the local database for testing. These are not real library listings, and public data reads exclude them by default.

## Checks and commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend development with automatic updates |
| `npm run dev:pages` | Build and run the app with its local backend |
| `npm run build` | Create a production build |
| `npm run db:migrate` | Apply database changes locally |
| `npm run db:seed` | Load fictional local test data |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check code quality |
| `npm test` | Run unit tests |
| `npm run check` | Run type checks, linting, tests, and the build |
| `npm run test:runtime` | Verify the built app and local backend; run after building |
| `npm run types:cloudflare` | Update types after changing server settings |

Runtime checks use a separate local database to verify search and detail APIs, migrations, repeatable fixtures, published/draft separation, data relationships, basic account infrastructure, routing, and file delivery. They do not verify a complete sign-in flow.

## Library API

- `GET /api/libraries` searches published libraries. No account is needed.
- `GET /api/libraries/:slug` returns a published library and its opening/access explanations, including when closed.
- `GET /api/suburbs` lists available search origins; Perth CBD is the default.

Search and detail accept `start` and optional `end` in Perth local time (`YYYY-MM-DDTHH:mm`), `suburb`, and comma-separated `cards` and `institutions`. Supported university codes are `uwa`, `curtin`, `ecu`, and `murdoch`; institutions also allow `public`. Omitting `start` uses the current time. Sessions can span up to 31 days.

Search switches are `open24Hours`, `usableWifi`, `quietStudy`, `groupStudy`, and `wheelchairAccess`; each accepts `true` or `false` and defaults to off. `limit` (1–100, default 50) and `offset` paginate the ranked results. For example: `/api/libraries?cards=uwa&open24Hours=true&start=2026-10-02T14:00`.

Responses keep building hours, personal access, and Wi-Fi separate. A 24/7 explanation covers seven consecutive local dates starting on the search date; closures or restricted periods can prevent qualification. Continuous windows are bounded to 32 local dates and identify a closure, unknown hours, or the evaluation limit. Profile matches remain self-reported and do not guarantee entry or working credentials. Invalid searches return a clear validation error; empty searches keep the selected filters.

## Project structure

- `src/app/` — app routing and shared styles
- `src/features/finder/` — the library finder interface
- `src/domain/` — schedules, access, Wi-Fi, filtering and ranking, with unit tests
- `functions/api/` — backend endpoints
- `server/` — database and account infrastructure
- `migrations/` — versioned database changes
- `tests/` — fictional fixtures and database integration checks
- `scripts/` — local setup and runtime checks
