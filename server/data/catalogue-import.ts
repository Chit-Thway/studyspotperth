import { emptyLibraryContent, parseAdminContent, validateAdminPublication } from '../../src/domain/admin.ts';
import type { LibraryContent, SourceRecord } from '../../src/domain/library.ts';
import { INSTITUTION_CODES } from '../../src/domain/search-context.ts';
import type { Institution } from '../../src/domain/search-context.ts';
import { assertLocalDate } from '../../src/domain/schedule.ts';

export interface CatalogueLibrary { id: string; slug: string; institution: Institution; content: LibraryContent }
export interface CatalogueSuburb {
  id: string; name: string; latitude: number; longitude: number; sourceUrl: string; checkedOn: string;
}
export interface CatalogueImport { checkedOn: string; suburbs: CatalogueSuburb[]; libraries: CatalogueLibrary[] }
export interface ExistingLibrary { id: string; slug: string; institution: string; isFixture: boolean }
export interface ExistingSuburb { id: string; name: string; latitude: number; longitude: number; isFixture: boolean }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an import object.');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Import arrays must contain at most 100 entries.');
  return value as unknown[];
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw new Error('Invalid import text.');
  return value;
}
function id(value: unknown, slug = false): string {
  const result = text(value);
  if (result.length > 120 || !(slug ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/ : /^[a-zA-Z0-9_-]+$/).test(result)) {
    throw new Error('Invalid stable import ID or slug.');
  }
  return result;
}
function date(value: unknown): string { const result = text(value); assertLocalDate(result); return result; }
function https(value: unknown): string {
  const result = text(value);
  if (new URL(result).protocol !== 'https:') throw new Error('Import sources must use HTTPS.');
  return result;
}
function coordinates(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > maximum) throw new Error('Invalid suburb coordinates.');
  return value;
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} in import.`);
}

/** Read application fields only. Personal notes and unsupported research metadata are not imported. */
export function parseCatalogueImport(value: unknown): CatalogueImport {
  const input = object(value);
  if (input.version !== 1) throw new Error('Use catalogue import version 1.');
  if (Object.keys(input).some((key) => !['version', 'checkedOn', 'suburbs', 'wifiProfiles', 'libraries'].includes(key))) {
    throw new Error('Unsupported catalogue import field.');
  }
  const checkedOn = date(input.checkedOn);
  const suburbs = array(input.suburbs ?? []).map((value): CatalogueSuburb => {
    const row = object(value);
    return { id: id(row.id, true), name: text(row.name), latitude: coordinates(row.latitude, 90),
      longitude: coordinates(row.longitude, 180), sourceUrl: https(row.sourceUrl), checkedOn: date(row.checkedOn) };
  });
  unique(suburbs.map((suburb) => suburb.id), 'suburb ID');
  const profiles = new Map<string, { wifi: LibraryContent['wifi']; sources: SourceRecord[] }>();
  for (const value of array(input.wifiProfiles ?? [])) {
    const profile = object(value);
    const profileId = id(profile.id);
    if (profiles.has(profileId)) throw new Error('Duplicate Wi-Fi profile ID.');
    const canonical = parseAdminContent({ ...emptyLibraryContent(), name: 'Shared Wi-Fi profile', address: 'Shared profile',
      wifi: profile.wifi, sources: profile.sources });
    validateAdminPublication(canonical);
    profiles.set(profileId, { wifi: canonical.wifi, sources: canonical.sources });
  }
  const libraries = array(input.libraries).map((value): CatalogueLibrary => {
    const row = object(value);
    const institution = INSTITUTION_CODES.find((code) => code === row.institution);
    if (!institution) throw new Error('Unsupported import institution.');
    const contentInput = { ...object(row.content) };
    if (row.wifiProfileId !== undefined) {
      const profile = profiles.get(id(row.wifiProfileId));
      if (!profile) throw new Error('Unknown Wi-Fi profile reference.');
      if (contentInput.wifi !== undefined) throw new Error('Choose a shared Wi-Fi profile or inline Wi-Fi, not both.');
      const sources = array(contentInput.sources).map(object);
      for (const source of profile.sources) {
        const existing = sources.find((item) => item.id === source.id);
        if (existing) throw new Error('Shared Wi-Fi source IDs must not overlap library source IDs.');
        sources.push({ ...source });
      }
      contentInput.sources = sources;
      contentInput.wifi = structuredClone(profile.wifi);
    }
    const content = parseAdminContent(contentInput);
    validateAdminPublication(content);
    // The research may contain generic library assumptions. Only explicit,
    // sourced confirmations can become yes/no facility claims in the app.
    const evidence = row.facilityEvidence === undefined ? {} : object(row.facilityEvidence);
    for (const facility of ['quietStudy', 'groupStudy', 'wheelchairAccess'] as const) {
      const fact = evidence[facility] === undefined ? null : object(evidence[facility]);
      if (fact && !['confirmed', 'assumed', 'unknown'].includes(text(fact.kind))) throw new Error('Invalid facility evidence.');
      if (fact?.kind === 'confirmed') {
        if (!content.sources.some((source) => source.id === fact.sourceId)) throw new Error('Confirmed facilities require a source reference.');
      } else content.facilities[facility] = 'unknown';
    }
    return { id: id(row.id), slug: id(row.slug, true), institution, content };
  });
  unique(libraries.map((library) => library.id), 'library ID');
  unique(libraries.map((library) => library.slug), 'library slug');
  return { checkedOn, suburbs, libraries };
}

/** Add missing records as drafts. Re-imports preserve every existing revision, including archives. */
export function createCataloguePlan(catalogue: CatalogueImport, existingLibraries: ExistingLibrary[], existingSuburbs: ExistingSuburb[]) {
  const libraryIds = new Map(existingLibraries.map((library) => [library.id, library]));
  const librarySlugs = new Map(existingLibraries.map((library) => [library.slug, library]));
  const suburbIds = new Map(existingSuburbs.map((suburb) => [suburb.id, suburb]));
  const skipped: string[] = [];
  const libraries = catalogue.libraries.filter((library) => {
    const existing = libraryIds.get(library.id) ?? librarySlugs.get(library.slug);
    if (!existing) return true;
    if (existing.id !== library.id || existing.slug !== library.slug || existing.institution !== library.institution || existing.isFixture) {
      throw new Error(`Conflicting library identity: ${library.slug}.`);
    }
    skipped.push(library.slug);
    return false;
  });
  const suburbs = catalogue.suburbs.filter((suburb) => {
    const existing = suburbIds.get(suburb.id);
    if (!existing) return true;
    if (existing.isFixture || existing.name !== suburb.name || existing.latitude !== suburb.latitude || existing.longitude !== suburb.longitude) {
      throw new Error(`Conflicting suburb identity: ${suburb.id}.`);
    }
    return false;
  });
  const availableSuburbs = new Set([...existingSuburbs.filter((suburb) => !suburb.isFixture).map((suburb) => suburb.id),
    ...catalogue.suburbs.map((suburb) => suburb.id)]);
  for (const library of libraries) if (library.content.suburbId && !availableSuburbs.has(library.content.suburbId)) {
    throw new Error(`Unknown physical suburb for ${library.slug}: ${library.content.suburbId}.`);
  }
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const timestamp = Date.parse(`${catalogue.checkedOn}T00:00:00+08:00`);
  const statements = [
    ...suburbs.map((suburb) => `INSERT INTO suburb(id,name,latitude,longitude,source_url,checked_on,is_fixture) VALUES (${quote(suburb.id)},${quote(suburb.name)},${suburb.latitude},${suburb.longitude},${quote(suburb.sourceUrl)},${quote(suburb.checkedOn)},0);`),
    ...libraries.flatMap((library) => [
      `INSERT INTO library(id,slug,institution_id,is_fixture) VALUES (${quote(library.id)},${quote(library.slug)},${quote(library.institution)},0);`,
      `INSERT INTO library_revision(id,library_id,status,content,created_at) VALUES (${quote(`${library.id}-catalogue-${catalogue.checkedOn}`)},${quote(library.id)},'draft',${quote(JSON.stringify(library.content))},${timestamp});`,
    ]),
  ];
  if (statements.some((statement) => new TextEncoder().encode(statement).length > 90_000)) throw new Error('Import statement exceeds the D1 statement budget. Split oversized content.');
  return { statements, libraries, suburbs, skipped };
}
