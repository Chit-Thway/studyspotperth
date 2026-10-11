# Catalogue maintenance

Library facts remain in the existing D1 `library` and `library_revision` tables.
Source facts and compressed WebP photos live together in `catalogue/`; D1
stores published snapshots, photo paths, credits and sources. Vite emits the
photos as static Pages assets under `/images/libraries/`. Existing photo URLs
remain valid. The finder shows ten cards per page,
after the full published catalogue has been filtered and ranked. Declared cards
affect ranking; explicit filters still control exclusions.

## Importing additional libraries

The authored catalogue contains 82 libraries, grouped by physical suburb for
public libraries and university for university libraries:

```text
catalogue/
  catalogue.json
  suburbs.json
  wifi-profiles.json
  cloverdale/ruth-faulkner-library/library.json
  cloverdale/ruth-faulkner-library/images/exterior.webp
  uwa/reid-library/library.json
  uwa/reid-library/images/reid-library.webp
```

Every record also has a physical `content.suburbId`, including university
libraries. These IDs support future suburb filtering; choosing a suburb today
sets the search origin. Suburb coordinates are approximate venue reference
points, not geographic centroids or entrance locations.

Preview the checked-in folders with `npm run db:catalogue -- --catalogue`, then
add `--apply` to insert missing records as local drafts. Optional
`--link-suburbs` attaches physical suburb IDs to existing published records
whose address and map point match. This creates new immutable revisions and
keeps all existing facts; newer drafts and archived records are preserved.
Optional `--link-sizes` fills missing estimated sizes in matching published
records using the same guarded revision workflow. Existing size choices are
preserved, including administrator edits. Both metadata options can be combined.

All 82 listings have photos, with 92 source photographs across the catalogue;
78 of those photographs cover the 69 additions. Notre Dame's
image is described as campus context; shared-venue context is retained in photo metadata.
Photo credits, source links, available licences and checked dates are recorded
alongside each library's public facts.
Builds validate the catalogue and copy only its photos into static assets;
library JSON is served through the versioned public D1 catalogue endpoint.

Apply local migrations first with `npm run db:migrate`. Prepare a local JSON
manifest, then preview it:

```powershell
npm run db:catalogue -- --file .runtime-check/catalogue.json
```

The preview validates facts, source dates, identities, suburb references and
local photo paths. It reads the local database and reports new and preserved
records. It does not write database rows. After reviewing it:

```powershell
npm run db:catalogue -- --file .runtime-check/catalogue.json --apply
```

This inserts missing libraries as **drafts**. Review them in Manage libraries
before publishing. Re-running the manifest preserves existing records, admin
edits, published revisions and unpublished/archived records. Conflicting IDs,
slugs or suburb identities stop the import. The database batch is atomic; a
concurrent conflicting edit fails the batch rather than overwriting it.

This command always targets local D1 and accepts no remote option. Production
imports require a separately reviewed deployment process. The private research
catalogue and prepared manifests stay locally excluded from Git. Application
facts selected for publication go through the same canonical parser and
publication validation as admin edits.

## Manifest format

The root contains `version: 1`, `checkedOn` (`YYYY-MM-DD`), `libraries`, and
optional `suburbs` and `wifiProfiles` arrays. Each array accepts at most 100
entries per import file. This is a batch limit, not a cap on the catalogue.

Each library has a stable `id`, unique lowercase hyphenated `slug`, `institution`
(`public`, `uwa`, `curtin`, `ecu`, `murdoch`, or `notre-dame`), and `content` in
the existing `LibraryContent` format in `src/domain/library.ts`. Sources must
be dated official sources or confirmations. Unknown hours, Wi-Fi and access
remain explicitly unknown. Photo candidate links are not imported as photos;
use an empty photo array until a credited usable image is ready.

Known recurring schedules can include `unknownWeekdays` (Sunday = 0) for days
whose hours are unpublished. Such days display Unknown rather than Closed;
dated confirmations or closures take precedence. Lesmurdie's sourced school
holiday variant is dated against WA term calendars. Notre Dame's October
calendar is bounded to its verified dates, like the existing university calendars.

Each physical suburb has `id`, `name`, `latitude`, `longitude`, HTTPS `sourceUrl`
and `checkedOn`. A library's `content.suburbId` must reference an existing real
suburb or one in the manifest. Existing suburb records are preserved. Estimated
size is stored as optional `content.size` (`small`, `medium`, `large`, or null
when unknown). Presentation grouping remains represented by the folders.

Sizes estimate usable study-space scale: Victoria Park anchors Small, City of
Perth anchors Medium, and Reid, TL Robertson and State Library anchor Large.
The 69 additions use the research estimates. The other launch libraries are
estimated against those anchors using their sourced study-space descriptions.
These categories are not seat counts or guaranteed capacity. Cards display a
size line, and the finder supports comma-separated `sizes` selections (OR within
sizes, AND with other filters). No selection includes every size.

### Facility evidence

An optional `facilityEvidence` object on the library distinguishes confirmed
facts from generic assumptions:

```json
{
  "quietStudy": { "kind": "confirmed", "sourceId": "facilities-source" },
  "groupStudy": { "kind": "assumed", "sourceId": null },
  "wheelchairAccess": { "kind": "unknown", "sourceId": null }
}
```

Only `confirmed` evidence referencing a dated source preserves a facility's
`yes` or `no` value. Assumed, unknown or missing evidence produces `unknown`
in the application. Original assumptions can remain in the private research.

### Shared Wi-Fi authoring

A `wifiProfiles` entry has `id`, `wifi` (the existing Wi-Fi document) and
`sources`. A library uses `wifiProfileId` and omits `content.wifi`, or supplies
inline `content.wifi` and omits `wifiProfileId`. Shared source IDs must not
overlap that library's source IDs.

Profiles expand into independent immutable snapshots during import. Updating
a profile later does not silently change existing published library facts.

## Capacity verification

`npm run test:search-performance` benchmarks 82 and 100 synthetic records with
different public hours, university access, overnight periods, exceptions and
unknowns. It reports first-run, median and p95 duration, average process CPU and
ten-card response size. It includes content validation, ranking and JSON
serialization, but excludes D1/network time. These local Node measurements are
not Cloudflare edge CPU measurements and are not a free-tier compliance proof.

`npm run test:runtime` verifies migrations and populated foreign keys, D1 reads,
catalogue imports and pagination in an isolated local Pages/D1 runtime. Its
synthetic scale records never enter the ordinary local database.

The browser downloads the public catalogue, filters and ranks it locally,
and evaluates detailed windows for the ten visible cards. It reuses the
ranking between pages. The public endpoint shapes JSON in D1 and versions it
with ETags; publication changes the version. Before a
production expansion, check real edge CPU/request metrics with the final
catalogue and expected traffic.
