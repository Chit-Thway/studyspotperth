import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCatalogueFiles } from './catalogue-files';
import { createCataloguePlan } from './catalogue-import';
import { createCatalogueMetadataLinks } from './catalogue-metadata';
import type { PublishedCatalogueRow } from './catalogue-metadata';
import { createLaunchSql, launchLibraries } from './launch-libraries';
import { searchLibraries } from '../../src/domain/library-search';
import { parseSearchRequest } from '../../src/domain/search-request';
import { selectScheduleForDate } from '../../src/domain/schedule';
import type { LibraryRecord } from '../../src/domain/library';

describe('authored 82-library catalogue', () => {
  it('includes five confirmed public visitor libraries with 24/7 card access even on Sunday', async () => {
    const { catalogue } = await readCatalogueFiles();
    const records: LibraryRecord[] = catalogue.libraries.map((library) => ({ ...library,
      revisionId: `${library.id}-test`, status: 'published', isFixture: false }));
    const now = Date.parse('2026-10-11T19:00:00+08:00');
    const query = 'publicAccess=true&open24Hours=true&limit=100';
    const result = searchLibraries(records, parseSearchRequest(new URLSearchParams(query), now));
    expect(result.results.map((entry) => entry.library.slug).sort()).toEqual([
      'ecu-city-library', 'geoffrey-bolton-library', 'j-robin-warren-library', 'reid-library', 'tl-robertson-library',
    ]);
    expect(result.results.every((entry) => entry.open24Hours.status === 'qualifies')).toBe(true);
    expect(result.results.every((entry) => entry.open24Hours.groups.some((group) => group.group !== 'public' && group.match === 'not-in-profile'))).toBe(true);
    const open = searchLibraries(records, parseSearchRequest(new URLSearchParams(`${query}&openNow=true`), now));
    expect(open.results.map((entry) => entry.library.id)).toEqual(result.results.map((entry) => entry.library.id));
    expect(open.results.every((entry) => entry.opening.status === 'open')).toBe(true);
  });
  it('keeps all 82 by default and only confirmed open libraries when Open now is enabled', async () => {
    const { catalogue } = await readCatalogueFiles();
    const records: LibraryRecord[] = catalogue.libraries.map((library) => ({ ...library,
      revisionId: `${library.id}-test`, status: 'published', isFixture: false }));
    const now = Date.parse('2026-10-11T18:30:00+08:00');
    const all = searchLibraries(records, parseSearchRequest(new URLSearchParams('limit=100'), now));
    const open = searchLibraries(records, parseSearchRequest(new URLSearchParams('openNow=true&limit=100'), now));
    expect(all.total).toBe(82);
    expect(open.total).toBeGreaterThan(0);
    expect(open.total).toBeLessThan(82);
    expect(open.results.every((result) => result.opening.status === 'open')).toBe(true);
    const slugs = open.results.map((result) => result.library.slug);
    expect(slugs).toEqual(expect.arrayContaining(['reid-library', 'tl-robertson-library', 'ecu-city-library']));
    expect(slugs).not.toContain('kelmscott-library');
    expect(slugs).not.toContain('seville-grove-library');
    expect(slugs).not.toContain('city-of-perth-library');
    for (const library of all.results.filter((result) => result.open24Hours.status === 'qualifies')) {
      expect(slugs).toContain(library.library.slug);
    }
    expect(open.results.map((result) => result.library.id)).toEqual(all.results
      .filter((result) => result.opening.status === 'open').map((result) => result.library.id));
  });
  it('contains sourced, grouped application facts and attributed photo assets', async () => {
    const { catalogue, assets } = await readCatalogueFiles();
    expect(catalogue.libraries).toHaveLength(82);
    expect(catalogue.libraries.filter((library) => library.id.startsWith('catalogue-'))).toHaveLength(69);
    expect(catalogue.libraries.filter((library) => library.id.startsWith('catalogue-') && library.content.photos.length)).toHaveLength(69);
    expect(catalogue.libraries.filter((library) => library.content.photos.length)).toHaveLength(82);
    expect(assets.size).toBe(92);
    for (const library of catalogue.libraries) {
      expect(catalogue.suburbs.some((suburb) => suburb.id === library.content.suburbId)).toBe(true);
      expect(library.content.latitude).not.toBeNull();
      expect(library.content.longitude).not.toBeNull();
      expect(['small', 'medium', 'large']).toContain(library.content.size);
      for (const photo of library.content.photos) {
        const bytes = readFileSync(assets.get(photo.url)!);
        expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
        expect(library.content.sources.find((source) => source.id === photo.sourceId)?.url).toBeTruthy();
        expect(photo.credit.trim().length).toBeGreaterThan(0);
      }
    }
    for (const launch of launchLibraries) {
      const source = catalogue.libraries.find((library) => library.id === launch.id)!;
      const addedPhotoSources = source.content.photos
        .filter((photo) => !launch.content.photos.some((original) => original.url === photo.url))
        .map((photo) => photo.sourceId);
      expect({
        ...source.content,
        suburbId: null,
        size: undefined,
        photos: launch.content.photos,
        sources: source.content.sources.filter((entry) => !addedPhotoSources.includes(entry.id)),
      }).toEqual({ ...launch.content, size: undefined });
    }
  });
  it('retains partial uncertainty, holiday hours and the bounded Notre Dame calendar', async () => {
    const { catalogue } = await readCatalogueFiles();
    const find = (slug: string) => catalogue.libraries.find((library) => library.slug === slug)!.content;
    const uncertain = catalogue.libraries.filter((library) => library.content.schedule.building.unknownWeekdays?.includes(0));
    expect(uncertain).toHaveLength(8);
    for (const library of uncertain) {
      expect(selectScheduleForDate(library.content.schedule.building, '2026-10-11').status).toBe('unknown');
      expect(selectScheduleForDate(library.content.schedule.building, '2026-10-12').status).toBe('known');
    }
    const lesmurdie = find('lesmurdie-library');
    expect(selectScheduleForDate(lesmurdie.schedule.building, '2026-10-09').intervals).toEqual([{ startMinute: 540, endMinute: 780 }]);
    expect(selectScheduleForDate(lesmurdie.schedule.building, '2026-10-16').intervals).toEqual([{ startMinute: 495, endMinute: 1020 }]);
    expect(lesmurdie.wifi).toEqual({ status: 'known', networks: [] });
    expect(find('claremont-library').wifi.status).toBe('unknown');
    const notreDame = find('michael-j-m-wright-library');
    expect(selectScheduleForDate(notreDame.schedule.building, '2026-10-12').status).toBe('known');
    expect(selectScheduleForDate(notreDame.schedule.building, '2026-10-19').status).toBe('unknown');
    expect(notreDame.photos[0].credit).toContain('Campus context');
  });
  it('adds 69 drafts and physical suburbs while preserving existing facts and draft revisions', async () => {
    const { catalogue } = await readCatalogueFiles();
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys=ON');
      for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) db.exec(readFileSync(`migrations/${file}`, 'utf8'));
      db.exec(createLaunchSql());
      const existing = launchLibraries.map((library) => ({ ...library, isFixture: false }));
      const plan = createCataloguePlan(catalogue, existing, []);
      expect(plan.libraries).toHaveLength(69);
      db.exec(`BEGIN;${plan.statements.join('\n')}COMMIT;`);
      const published = db.prepare("SELECT l.id,l.slug,r.id AS revisionId,r.content FROM library l JOIN library_revision r ON r.library_id=l.id WHERE r.status='published'").all() as unknown as PublishedCatalogueRow[];
      // An edited fact survives metadata linkage; a newer draft blocks linkage altogether.
      const edited = { ...JSON.parse(published[0].content) as object, description: 'Admin description to preserve', size: 'small' };
      db.prepare("UPDATE library_revision SET status='archived' WHERE id=?").run(published[0].revisionId);
      db.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at,published_at) VALUES ('admin-published',?,'published',?,1,1)").run(published[0].id, JSON.stringify(edited));
      published[0].revisionId = 'admin-published';
      published[0].content = JSON.stringify(edited);
      db.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at) VALUES ('admin-draft',?,'draft',?,1)").run(published[1].id, published[1].content);
      const links = createCatalogueMetadataLinks(catalogue, published, { suburbs: true, sizes: true });
      db.exec(`BEGIN;${links.statements.join('\n')}COMMIT;`);
      const revised = JSON.parse(db.prepare("SELECT content FROM library_revision WHERE library_id=? AND status='published'").get(published[0].id)!.content as string) as Record<string, unknown>;
      expect({ ...revised, suburbId: null }).toEqual(edited);
      expect(links.linkedSizes).not.toContain(published[0].slug);
      expect(JSON.parse(db.prepare("SELECT content FROM library_revision WHERE library_id=? AND status='published'").get(published[1].id)!.content as string)).toEqual(JSON.parse(published[1].content));
      expect(db.prepare("SELECT COUNT(*) AS count FROM library_revision WHERE status='draft'").get()?.count).toBe(70);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      const all = catalogue.libraries.map((library) => ({ ...library, isFixture: false }));
      expect(createCataloguePlan(catalogue, all, catalogue.suburbs.map((suburb) => ({ ...suburb, isFixture: false }))).statements).toEqual([]);
    } finally { db.close(); }
  });
  it('ranks the real catalogue and reaches all 82 records across nine pages', async () => {
    const { catalogue } = await readCatalogueFiles();
    const records: LibraryRecord[] = catalogue.libraries.map((library) => ({ ...library, isFixture: false, status: 'published', revisionId: 'catalogue-test' }));
    const clock = Date.parse('2026-10-12T06:00:00Z');
    const request = (offset = 0) => parseSearchRequest(new URLSearchParams(`cards=uwa&offset=${offset}`), clock);
    const seen: string[] = [];
    for (let offset = 0; offset < 82; offset += 10) {
      const page = searchLibraries(records, request(offset));
      expect(page.total).toBe(82);
      expect(page.results).toHaveLength(offset === 80 ? 2 : 10);
      seen.push(...page.results.map((result) => result.library.id));
    }
    expect(new Set(seen).size).toBe(82);
    const onlyNotreDame = searchLibraries(records, parseSearchRequest(new URLSearchParams('institutions=notre-dame'), clock));
    expect(onlyNotreDame.results.map((result) => result.library.slug)).toEqual(['michael-j-m-wright-library']);
    const small = searchLibraries(records, parseSearchRequest(new URLSearchParams('sizes=small&limit=100'), clock));
    expect(small.total).toBe(38);
    expect(small.results.every((result) => result.library.content.size === 'small')).toBe(true);
    const combined = searchLibraries(records, parseSearchRequest(new URLSearchParams('sizes=small,medium&limit=100'), clock));
    expect(combined.total).toBe(75);
    expect(combined.results.every((result) => result.library.content.size !== 'large')).toBe(true);
    const largeUwa = searchLibraries(records, parseSearchRequest(new URLSearchParams('sizes=large&institutions=uwa'), clock));
    expect(largeUwa.results.map((result) => result.library.slug).sort()).toEqual(['barry-j-marshall-library', 'reid-library']);
  });
});
