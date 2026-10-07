import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLaunchSql, launchLibraries } from './launch-libraries';
import { parseAdminContent, validateAdminPublication } from '../../src/domain/admin';
import { evaluateLibrary, searchLibraries } from '../../src/domain/library-search';
import { parseSearchRequest } from '../../src/domain/search-request';
import { parsePerthTime } from '../../src/domain/perth-time';
import type { LibraryRecord } from '../../src/domain/library';
import { launchPhotos } from './launch-photos';

const records: LibraryRecord[] = launchLibraries.map((record) => ({ ...record, isFixture: false,
  status: 'published', revisionId: `${record.id}-initial` }));
const request = (query = '') => parseSearchRequest(new URLSearchParams(query), parsePerthTime('2026-10-05T14:00'));
const find = (slug: string) => records.find((record) => record.slug === slug)!;
function database() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  return db;
}

describe('initial public catalogue', () => {
  it('contains exactly the 13 selected, source-backed entries and reusable bundled photos', () => {
    expect(records).toHaveLength(13);
    expect(new Set(records.map((record) => record.slug)).size).toBe(13);
    expect(records.filter((record) => record.institution === 'uwa')).toHaveLength(5);
    expect(records.some((record) => /veterinary|prime ministerial/i.test(record.content.name))).toBe(false);
    for (const record of records) {
      expect(parseAdminContent(record.content)).toEqual(record.content);
      expect(() => validateAdminPublication(record.content)).not.toThrow();
      expect(record.content.sources.filter((source) => !source.id.startsWith('map-') && !source.id.startsWith('photo')).every((source) => source.kind === 'official' && source.checkedOn === '2026-10-05')).toBe(true);
      for (const photo of record.content.photos) {
        const asset = readFileSync(`public${photo.url}`);
        expect(asset.subarray(0, 4).toString()).toBe('RIFF');
        expect(asset.subarray(8, 12).toString()).toBe('WEBP');
        expect(asset.length).toBeLessThan(500_000);
        expect(record.content.sources.find((source) => source.id === photo.sourceId)?.url).toMatch(/^https:\/\/commons.wikimedia.org\/wiki\/File:/);
        expect(record.content.sources.find((source) => source.id === `${photo.sourceId}-license`)?.url).toMatch(/^https:\/\/creativecommons.org\//);
        expect(launchPhotos[record.slug].licence).toMatch(/^CC (BY|BY-SA)|^CC0/);
      }
      expect(record.content.sources.find((source) => source.id === 'map-location')).toMatchObject({ checkedOn: '2026-10-06' });
      expect(record.content.latitude).not.toBeNull();
      expect(record.content.longitude).not.toBeNull();
    }
    expect(records.filter((record) => record.content.photos.length)).toHaveLength(11);
    expect(records.filter((record) => !record.content.photos.length).map((record) => record.slug)).toEqual(['edfaa-library', 'j-robin-warren-library']);
  });
  it('keeps all six confirmed 24/7 options and ranks UWA matches first', () => {
    const result = searchLibraries(records, request('cards=uwa&open24Hours=true'));
    expect(result.total).toBe(6);
    expect(result.results.slice(0, 2).map((item) => item.library.slug)).toEqual(['j-robin-warren-library', 'reid-library']);
    expect(new Set(result.results.map((item) => item.library.institution))).toEqual(new Set(['uwa', 'curtin', 'ecu', 'murdoch']));
    expect(result.results.find((item) => item.library.institution === 'curtin')?.access.status).toBe('matches-rules');
    const night = searchLibraries(records, request('start=2026-10-05T23:00&cards=uwa&open24Hours=true'));
    expect(night.results.find((item) => item.library.institution === 'curtin')?.access.status).toBe('unmatched');
  });
  it('applies institution filtering only when explicitly selected', () => {
    const result = searchLibraries(records, request('cards=uwa&open24Hours=true&institutions=uwa'));
    expect(result.results.map((item) => item.library.slug)).toEqual(['j-robin-warren-library', 'reid-library']);
    expect(searchLibraries(records, request('cards=uwa')).results.some((item) => item.library.institution === 'public')).toBe(true);
  });
  it('does not turn Beasley early card access into a 24/7 claim', () => {
    const early = evaluateLibrary(find('beasley-law-library'), request('start=2026-10-05T07:00&cards=uwa'));
    expect(early.opening.status).toBe('open');
    expect(early.access.status).toBe('matches-rules');
    expect(early.open24Hours.status).toBe('does-not-qualify');
    expect(evaluateLibrary(find('beasley-law-library'), request('start=2026-10-05T23:00')).opening.status).toBe('closed');
  });
  it('keeps unconfirmed hours unknown and limits dated calendar claims to their verified dates', () => {
    expect(evaluateLibrary(find('curtin-graduate-school-of-business-library'), request()).opening.status).toBe('unknown');
    expect(evaluateLibrary(find('barry-j-marshall-library'), request('start=2026-10-19T14:00')).opening.status).toBe('unknown');
    expect(evaluateLibrary(find('tl-robertson-library'), request('start=2026-10-13T14:00')).open24Hours.status).toBe('unknown');
    expect(evaluateLibrary(find('reid-library'), request('start=2026-10-12T23:00&cards=uwa')).open24Hours.status).toBe('qualifies');
  });
  it('separates ECU city public hours from 24/7 card entry and applies public holiday closures', () => {
    const evening = evaluateLibrary(find('ecu-city-library'), request('start=2026-10-05T19:00'));
    expect(evening.opening.status).toBe('open');
    expect(evening.access.status).toBe('unmatched');
    expect(evaluateLibrary(find('city-of-perth-library'), request('start=2026-12-28T14:00')).opening.status).toBe('closed');
    expect(evaluateLibrary(find('state-library-of-western-australia'), request('start=2026-12-28T14:00')).opening.status).toBe('open');
  });
  it('uses sourced guest/eduroam eligibility and preserves unconfirmed public entry', () => {
    const result = searchLibraries(records, request('usableWifi=true'));
    expect(result.results.map((item) => item.library.slug)).toEqual(['city-of-perth-library', 'state-library-of-western-australia', 'ecu-city-library', 'ecu-joondalup-library']);
    for (const card of ['uwa', 'curtin', 'ecu', 'murdoch']) {
      expect(evaluateLibrary(find('geoffrey-bolton-library'), request(`cards=${card}`)).wifi.status).toBe('eligible');
    }
    expect(evaluateLibrary(find('ecu-joondalup-library'), request()).access.status).toBe('unknown');
  });
  it('sorts real launch records from the supplied location while keeping university priority', () => {
    const origin = { id: 'device-location', name: 'Your location', latitude: -32.005425, longitude: 115.893881 };
    const located = (params: string) => parseSearchRequest(new URLSearchParams(params), parsePerthTime('2026-10-05T14:00'), origin);
    const guest = searchLibraries(records, located(''));
    expect(guest.results[0].library.slug).toBe('tl-robertson-library');
    expect(guest.results[0].distanceKm).toBe(0);
    const uwa = searchLibraries(records, located('cards=uwa&open24Hours=true'));
    expect(uwa.total).toBe(6);
    expect(uwa.results.slice(0, 2).every((item) => item.library.institution === 'uwa')).toBe(true);
    expect(uwa.results.some((item) => item.library.institution === 'curtin')).toBe(true);
  });
});

describe('safe first import', () => {
  it.each(['original', 'initial', 'located'])('adds photos to the untouched %s catalogue without losing its history', (version) => {
    const db = database();
    try {
      const record = records[0];
      const base = { ...record.content, photos: [], sources: record.content.sources.filter((source) => !source.id.startsWith('photo')) };
      const original = { ...base, latitude: null, longitude: null, sources: base.sources.filter((source) => !source.id.startsWith('map-')) };
      db.prepare('INSERT INTO library (id,slug,institution_id,is_fixture) VALUES (?,?,?,0)').run(record.id, record.slug, record.institution);
      const insert = db.prepare('INSERT INTO library_revision (id,library_id,status,content,created_at,published_at) VALUES (?,?,?,?,0,0)');
      insert.run(`${record.id}-initial`, record.id, version === 'located' ? 'archived' : 'published', JSON.stringify(version === 'original' || version === 'located' ? original : base));
      if (version === 'located') insert.run(`${record.id}-location-v1`, record.id, 'published', JSON.stringify(base));
      db.exec(createLaunchSql());
      const published = db.prepare("SELECT id,content FROM library_revision WHERE library_id=? AND status='published'").get(record.id);
      expect(published?.id).toBe(`${record.id}-photos-v1`);
      expect(JSON.parse(published?.content as string)).toEqual(record.content);
      expect(db.prepare('SELECT status FROM library_revision WHERE id=?').get(`${record.id}-initial`)?.status).toBe('archived');
      const count = db.prepare('SELECT count(*) AS count FROM library_revision').get()?.count;
      db.exec(createLaunchSql());
      expect(db.prepare('SELECT count(*) AS count FROM library_revision').get()?.count).toBe(count);
    } finally { db.close(); }
  });
  it.each(['edited', 'draft'])('preserves an %s catalogue when adding launch photos', (version) => {
    const db = database();
    try {
      const record = records[0];
      const content = { ...record.content, photos: [], sources: record.content.sources.filter((source) => !source.id.startsWith('photo')) };
      if (version === 'edited') content.name = 'Administrator title';
      db.prepare('INSERT INTO library (id,slug,institution_id,is_fixture) VALUES (?,?,?,0)').run(record.id, record.slug, record.institution);
      db.prepare("INSERT INTO library_revision (id,library_id,status,content,created_at,published_at) VALUES (?,?,'published',?,0,0)").run(`${record.id}-initial`, record.id, JSON.stringify(content));
      if (version === 'draft') db.prepare("INSERT INTO library_revision (id,library_id,status,content,created_at) VALUES ('admin-draft',?,'draft',?,1)").run(record.id, JSON.stringify(content));
      db.exec(createLaunchSql());
      expect(db.prepare("SELECT content FROM library_revision WHERE library_id=? AND status='published'").get(record.id)?.content).toBe(JSON.stringify(content));
      expect(db.prepare('SELECT count(*) AS count FROM library_revision WHERE id=?').get(`${record.id}-photos-v1`)?.count).toBe(0);
    } finally { db.close(); }
  });
  it('replays without duplicates and never replaces later drafts or republishes archived records', () => {
    const db = database();
    try {
      db.exec(createLaunchSql());
      db.exec(createLaunchSql());
      expect(db.prepare('SELECT count(*) AS count FROM library').get()?.count).toBe(13);
      expect(db.prepare('SELECT count(*) AS count FROM library_revision').get()?.count).toBe(13);
      const record = records[0];
      const edited = { ...record.content, name: 'An administrator edit' };
      db.prepare("UPDATE library_revision SET status='archived' WHERE library_id=?").run(record.id);
      db.prepare("INSERT INTO library_revision (id,library_id,status,content,created_at) VALUES ('admin-edit',?,'draft',?,?)")
        .run(record.id, JSON.stringify(edited), Date.now());
      db.exec(createLaunchSql());
      expect(db.prepare("SELECT count(*) AS count FROM library_revision WHERE library_id=? AND status='published'").get(record.id)?.count).toBe(0);
      expect(db.prepare("SELECT json_extract(content,'$.name') AS name FROM library_revision WHERE id='admin-edit'").get()?.name).toBe('An administrator edit');
      expect(db.prepare('SELECT count(*) AS count FROM library_revision').get()?.count).toBe(14);
    } finally { db.close(); }
  });
  it('preserves an unrelated library with a conflicting slug', () => {
    const db = database();
    try {
      db.prepare("INSERT INTO library (id,slug,institution_id,is_fixture) VALUES ('existing',?,'uwa',0)").run(records[0].slug);
      db.exec(createLaunchSql());
      expect(db.prepare('SELECT id FROM library WHERE slug=?').get(records[0].slug)?.id).toBe('existing');
      expect(db.prepare("SELECT count(*) AS count FROM library_revision WHERE library_id='existing'").get()?.count).toBe(0);
    } finally { db.close(); }
  });
});
