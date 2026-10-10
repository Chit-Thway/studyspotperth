# StudySpot Perth

StudySpot Perth is a web project for finding study-friendly libraries around Perth, with a focus on 24/7 options and clear entry and Wi-Fi information.

## Current status

The app opens directly to a responsive library finder, with a filter sidebar on desktop and a filter drawer on mobile. The interface uses a quiet sage-and-ivory palette, labelled controls, and keyboard navigation.

Guest search is connected to the backend. Visitors can use their device location and choose a study time, filter for public access, 24/7 access and facilities, and declare university cards to personalise results. Public access includes university libraries with confirmed visitor hours on the selected day. Combining public access with UWA, for example, shows only publicly accessible UWA libraries. Library details show opening and entry hours, Wi-Fi requirements, sources, and directions. Filter selections stay in the URL when moving between the finder and a library.

Google sign-in lets visitors save libraries and keep declared university cards in their profile. Saved cards personalise results without automatically restricting the finder. The authored catalogue contains 82 libraries with dated sources in readable suburb and university folders under `catalogue/`. Forty-four listings have licensed photos; missing photos use a dark placeholder. Credits and licence links appear in each listing and its source JSON.

The local backend stores versioned library records, opening and entry schedules, dated exceptions, and profile preferences. Draft edits remain separate from published records. Automated checks cover these data rules, database connectivity, and page routing.

The finder shows ten cards per page, with an estimated Small, Medium or Large size below each card's facility icons. The size filter uses one-, two- and four-person icons and supports multiple selections. [Catalogue maintenance](docs/catalogue-import.md) describes the additive importer, size metadata, shared Wi-Fi profiles and facility evidence.

Authorised administrators can edit library details, photos, facilities, Wi-Fi and opening hours, add closures or date ranges, and preview changes before publishing. The public version stays unchanged while a draft is edited.

The browser evaluates Perth opening hours, entry rules, 24/7 access, Wi-Fi, and distance using the versioned public D1 catalogue. Declared university cards personalise ranking and requirement labels; only selected filters restrict results. Unconfirmed opening hours remain visible and labelled Unknown.

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
npm run db:launch
npm run db:catalogue -- --catalogue --link-suburbs --apply
npm run dev:pages
```

Open **http://localhost:8788**. The app and database run locally; a Cloudflare account is not required. Restart this command after changing frontend files.

For automatic frontend updates while developing, leave the local server running and run `npm run dev` in another terminal. Open **http://localhost:5173**. Use `localhost` consistently when testing sign-in so the session cookie works on both local ports.

The setup command creates `.dev.vars` with a random local secret and preserves an existing file. `.dev.vars.example` lists the available settings without secret values. Secrets, dependencies, build output, and local database files are excluded from Git. The database configuration in `wrangler.jsonc` is for local use only.

`npm run db:seed` loads clearly labelled fictional examples into the local database for testing. These are not real library listings, and public data reads exclude them by default.

`npm run db:launch` imports the initial 13 published listings locally. `db:catalogue` adds the other 69 as drafts for review and publication in Manage libraries. Repeated imports preserve edits and archived entries. Unconfirmed details remain unknown. UWA public hours, TL Robertson's calendar and Notre Dame's hours are verified for 5–18 October 2026, so their dated hours need refreshing before later dates. Standing 24/7 card policies are recorded separately where confirmed.

## Checks and commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend development with automatic updates |
| `npm run dev:pages` | Build and run the app with its local backend |
| `npm run build` | Create a production build |
| `npm run db:migrate` | Apply database changes locally |
| `npm run db:launch` | Import the initial public library catalogue locally |
| `npm run db:catalogue -- --catalogue` | Preview the authored 82-library catalogue locally |
| `npm run db:seed` | Load fictional local test data |
| `npm run db:admin -- --email "your-email"` | Grant administrator access to an existing local account |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check code quality |
| `npm test` | Run unit tests |
| `npm run check` | Run type checks, linting, tests, and the build |
| `npm run test:runtime` | Verify the built app and local backend; run after building |
| `npm run types:cloudflare` | Update types after changing server settings |

Runtime checks use a separate local database to verify search and detail APIs, migrations, repeatable fixtures, published/draft separation, account ownership, preferences, favourites, session expiry and sign-out, administrator permissions, publishing, closures, routing, and file delivery. The Google browser sign-in flow is checked separately with real OAuth credentials.

## Google sign-in

Create a Google OAuth client of type **Web application** and register this local redirect URI:

```text
http://localhost:8788/api/auth/callback/google
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the ignored `.dev.vars` file, keeping the generated `AUTH_SECRET`. Add your Google account as a test user while the Google app is in testing mode. Restart the local server after changing credentials. Browsing works without them; Google sign-in stays unavailable until configured.

For deployment, use the site's HTTPS origin as `AUTH_BASE_URL`, register its matching Google callback, and configure separate production secrets and a D1 database. Local configuration does not deploy the app.

Sessions use server-managed cookies. Profile preferences and favourites belong to the signed-in account; card declarations are self-reported and never verify university membership. An administrator role is stored on the server and cannot be granted through a profile request.

## Cookies and usage statistics

Visitors can accept optional cookies or choose **Essential only**, then change their choice using **Cookie settings** in the footer. Browsing and Google sign-in work with essential cookies alone. Location permission is separate from cookie consent.

**Use my location** requests browser permission for approximate distances and sorting. The last approximate position is kept in this browser for up to 24 hours and refreshed on navigation, reload and return to the site. It is sent to search/detail/saved requests through a header, never through page URLs, cookies, profiles or usage statistics. **Turn off location** persists across reloads and clears the saved position; permission revocation also clears it. Location permission is independent of optional analytics cookies. Location failures leave browsing available. Library points are approximate map/building references, not walking distances or entrance guidance. The three OpenStreetMap-derived building points in `server/data/launch-locations.ts` are © OpenStreetMap contributors and available under the [Open Database License](https://www.openstreetmap.org/copyright); other location sources are credited in each library’s details.

Optional cookies enable visit and directions counts. The administrator dashboard shows active accounts and estimated guest browsers for the last 30 days separately. Returning visitors have activity on at least two different days in the last 90 days. Browser estimates change when cookies are cleared or devices are changed; guest and account counts should not be added together as a count of people.

The visitor identifier lasts 90 days and the cookie preference lasts 180 days. Statistics store hashed identifiers and dates, with no email, IP address or coordinates. Records older than 90 days are removed when statistics are recorded or read. Current favourites are counted from the saved-library records. Statistics failures never block browsing or directions.

## Managing libraries locally

Sign in once, then grant your local account administrator access:

```sh
npm run db:admin -- --email "your-signed-in-email"
```

Reload the app and choose **Profile → Manage libraries**, or open `/admin`. This command changes only the local database. Production access must be assigned separately by the database owner.

Add a library, enter its sources and details, and save a draft. The URL slug and institution are fixed when created; the library name, address, photos and other details remain editable. Opening hours use Perth time. **Full day** means midnight to midnight; **Next day** supports overnight closing times. Copy hours to selected weekdays, or add exact-date closures and date-range replacement hours. Exact dates take priority over date ranges.

Use **Preview draft** to check guest or university-card access at a selected time. Preview includes unsaved changes and calculates 24/7 eligibility from the schedules. Save before publishing; dated sources are required. **Unpublish** removes the library from public results without deleting its records. If another tab saves first, reload the record before saving again.

## Library API

- `GET /api/libraries` searches published libraries. No account is needed.
- `GET /api/catalogue` returns the versioned public catalogue and supports ETag revalidation; browser search uses this endpoint.
- `GET /api/libraries/:slug` returns a published library and its opening/access explanations, including when closed.
- `GET /api/suburbs` lists available search origins; Perth CBD is the default.

Search and detail accept `start` in Perth local time (`YYYY-MM-DDTHH:mm`), `suburb`, comma-separated `cards` and university `institutions`, plus `publicAccess=true` for confirmed public hours on the selected day. Supported university codes are `uwa`, `curtin`, `ecu`, `murdoch`, and `notre-dame`. Public access and university selections combine with AND; multiple universities combine with OR. Public-access results sort nearest first, while other searches retain declared-card priority. Omitting `start` uses the current time. Older links containing `end` still work; that parameter is ignored. Legacy `institutions=public` selections migrate to the public-access filter.

Search switches are `open24Hours`, `usableWifi`, `quietStudy`, `groupStudy`, and `wheelchairAccess`; each accepts `true` or `false` and defaults to off. `limit` (1–100, default 10) and `offset` paginate the ranked results. For example: `/api/libraries?cards=uwa&open24Hours=true&start=2026-10-02T14:00`.

Responses keep building hours, personal access, and Wi-Fi separate. A 24/7 explanation covers seven consecutive local dates starting on the search date; closures or restricted periods can prevent qualification. Continuous windows are bounded to 32 local dates and identify a closure, unknown hours, or the evaluation limit. Profile matches remain self-reported and do not guarantee entry or working credentials. Invalid searches return a clear validation error; empty searches keep the selected filters.

## Project structure

- `src/app/` — app routing and shared styles
- `src/features/finder/` — the library finder interface
- `src/features/libraries/` — library cards, details, and shared presentation
- `src/features/admin/` — protected library editing and preview
- `src/domain/` — schedules, access, Wi-Fi, filtering and ranking, with unit tests
- `functions/api/` — backend endpoints
- `server/` — database and account infrastructure
- `migrations/` — versioned database changes
- `tests/` — fictional fixtures and database integration checks
- `scripts/` — local setup and runtime checks
