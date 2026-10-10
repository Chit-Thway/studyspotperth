# Catalogue maintenance

Library facts remain in the existing D1 `library` and `library_revision` tables.
Photos remain compressed static WebP files in `public/images/libraries/`; D1
stores their paths, credits and sources. The finder requests ten cards per page,
after the full published catalogue has been filtered and ranked. Declared cards
affect ranking; explicit filters still control exclusions.

## Importing additional libraries

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

Each physical suburb has `id`, `name`, `latitude`, `longitude`, HTTPS `sourceUrl`
and `checkedOn`. A library's `content.suburbId` must reference an existing real
suburb or one in the manifest. Existing suburb records are preserved. Estimated
size and presentation grouping remain research fields, outside this import.

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

Search shares date boundaries only within a request. Personal rankings and
opening status are recomputed; public API responses remain `no-store`. There
is no new shared result cache requiring publication invalidation. Before a
production expansion, check real edge CPU/request metrics with the final
catalogue and expected traffic.
