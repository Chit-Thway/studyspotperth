# StudySpot Perth

StudySpot Perth is a web project for finding study-friendly libraries around Perth, with a focus on 24/7 options and clear entry and Wi-Fi information.

## Current status

The app opens directly to a responsive library finder, with a filter sidebar on desktop and a filter drawer on mobile. The interface uses a quiet sage-and-ivory palette, labelled controls, and keyboard navigation.

Guest search is connected to the backend. Visitors can choose a suburb and study time, filter for 24/7 access and facilities, and declare university cards to personalise results. Library details show opening and entry hours, Wi-Fi requirements, sources, and directions. Selections stay in the URL when moving between the finder and a library.

Google sign-in lets visitors save libraries and keep a starting suburb and declared university cards in their profile. Saved cards personalise results without automatically restricting the finder. Verified library listings and photos have not been added yet, so the public finder currently shows an empty state.

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

For automatic frontend updates while developing, leave the local server running and run `npm run dev` in another terminal. Open **http://localhost:5173**. Use `localhost` consistently when testing sign-in so the session cookie works on both local ports.

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

Runtime checks use a separate local database to verify search and detail APIs, migrations, repeatable fixtures, published/draft separation, account ownership, preferences, favourites, session expiry and sign-out, routing, and file delivery. The Google browser sign-in flow is checked separately with real OAuth credentials.

## Google sign-in

Create a Google OAuth client of type **Web application** and register this local redirect URI:

```text
http://localhost:8788/api/auth/callback/google
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the ignored `.dev.vars` file, keeping the generated `AUTH_SECRET`. Add your Google account as a test user while the Google app is in testing mode. Restart the local server after changing credentials. Browsing works without them; Google sign-in stays unavailable until configured.

For deployment, use the site's HTTPS origin as `AUTH_BASE_URL`, register its matching Google callback, and configure separate production secrets and a D1 database. Local configuration does not deploy the app.

Sessions use server-managed cookies. Profile preferences and favourites belong to the signed-in account; card declarations are self-reported and never verify university membership. An administrator role is stored on the server and cannot be granted through a profile request.

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
- `src/features/libraries/` — library cards, details, and shared presentation
- `src/domain/` — schedules, access, Wi-Fi, filtering and ranking, with unit tests
- `functions/api/` — backend endpoints
- `server/` — database and account infrastructure
- `migrations/` — versioned database changes
- `tests/` — fictional fixtures and database integration checks
- `scripts/` — local setup and runtime checks
