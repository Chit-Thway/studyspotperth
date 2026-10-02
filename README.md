# StudySpot Perth

StudySpot Perth is a web project for finding study-friendly libraries around Perth, with a focus on 24/7 options and clear entry and Wi-Fi information.

## Current status

The app opens directly to a responsive library finder, with a filter sidebar on desktop and expandable filters on mobile. The interface uses a quiet sage-and-ivory palette, labelled controls, and keyboard navigation.

Library listings, search, sign-in, and saved libraries are not active yet. Their controls are disabled, and the results area clearly shows that listings are unavailable.

The local backend connects to a database. Automated checks cover that connection, page routing, and the separation between profile preferences and search filters.

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
npm run dev:pages
```

Open **http://localhost:8788**. The app and database run locally; a Cloudflare account is not required. Restart this command after changing frontend files.

For automatic frontend updates while developing, leave the local server running and run `npm run dev` in another terminal. Open the URL it prints.

The setup command creates `.dev.vars` with a random local secret and preserves an existing file. `.dev.vars.example` lists the available settings without secret values. Secrets, dependencies, build output, and local database files are excluded from Git. The database configuration in `wrangler.jsonc` is for local use only.

## Checks and commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend development with automatic updates |
| `npm run dev:pages` | Build and run the app with its local backend |
| `npm run build` | Create a production build |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check code quality |
| `npm test` | Run unit tests |
| `npm run check` | Run type checks, linting, tests, and the build |
| `npm run test:runtime` | Verify the built app and local backend; run after building |
| `npm run types:cloudflare` | Update types after changing server settings |

Runtime checks verify database connectivity, basic account infrastructure, routing, and file delivery. They do not verify a complete sign-in flow.

## Project structure

- `src/app/` — app routing and shared styles
- `src/features/finder/` — the library finder interface
- `src/domain/` — profile and search-filter logic, with unit tests
- `functions/api/` — backend endpoints
- `server/` — database and account infrastructure
- `scripts/` — local setup and runtime checks
