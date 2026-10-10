import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCataloguePlan, parseCatalogueImport } from './catalogue-import';
import { emptyLibraryContent, parseAdminContent } from '../../src/domain/admin';
import { parsePreferences } from '../../src/domain/account';
import { libraryFixtures, createFixtureSql } from '../../tests/fixtures/libraries';
import type { ExistingLibrary, ExistingSuburb } from './catalogue-import';

function manifest() {
  const content = structuredClone(libraryFixtures[0].content);
  content.name = "Importer test library's name";
  content.suburbId = 'import-suburb';
  content.photos = [];
  content.sources[0] = { id: content.sources[0].id, kind: 'official', label: 'Synthetic official source for validation tests',
    url: 'https://example.invalid/library', checkedOn: '2026-10-10' };
  return { version: 1, checkedOn: '2026-10-10',
    suburbs: [{ id: 'import-suburb', name: 'Import test suburb', latitude: -31.95, longitude: 115.86,
      sourceUrl: 'https://example.invalid/suburb', checkedOn: '2026-10-10' }],
    libraries: [{ id: 'import-library', slug: 'import-library', institution: 'notre-dame', content,
      facilityEvidence: { quietStudy: { kind: 'confirmed', sourceId: content.sources[0].id },
        groupStudy: { kind: 'assumed', sourceId: null } } }],
  };
}
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(`BEGIN;\n${readFileSync(`migrations/${file}`, 'utf8')}\nCOMMIT;`);
  }
  return db;
}
function existing(db: DatabaseSync) {
  return {
    libraries: db.prepare('SELECT id,slug,institution_id AS institution,is_fixture AS isFixture FROM library').all()
      .map((row) => ({ ...row, isFixture: Boolean(row.isFixture) })) as ExistingLibrary[],
    suburbs: db.prepare('SELECT id,name,latitude,longitude,is_fixture AS isFixture FROM suburb').all()
      .map((row) => ({ ...row, isFixture: Boolean(row.isFixture) })) as ExistingSuburb[],
  };
}
describe('catalogue import groundwork', () => {
  it('preserves unknown facts, removes personal fields and accepts only sourced facility confirmations', () => {
    const input = manifest();
    const output = parseCatalogueImport({ ...input, libraries: [{ ...input.libraries[0], content: {
      ...input.libraries[0].content, privateAdminNote: 'Private research', estimatedSize: 'large' } }] });
    expect(output.libraries[0].content).not.toHaveProperty('privateAdminNote');
    expect(output.libraries[0].content).not.toHaveProperty('estimatedSize');
    expect(output.libraries[0].content.facilities).toEqual({ quietStudy: 'yes', groupStudy: 'unknown', wheelchairAccess: 'unknown' });
    expect(parseCatalogueImport({ ...input, libraries: [{ ...input.libraries[0], facilityEvidence: undefined }] }).libraries[0].content.facilities.quietStudy).toBe('unknown');
    input.libraries[0].content.wifi = { status: 'unknown', networks: [] };
    input.libraries[0].content.schedule.building.overrides.push({ id: 'unknown-sunday', kind: 'date', startDate: '2026-10-11', endDate: '2026-10-11', status: 'unknown', intervals: [], sourceId: null });
    const uncertain = parseCatalogueImport(input).libraries[0].content;
    expect(uncertain.wifi).toEqual({ status: 'unknown', networks: [] });
    expect(uncertain.schedule.building.overrides[0].status).toBe('unknown');
    input.libraries[0].facilityEvidence.quietStudy.sourceId = 'missing';
    expect(() => parseCatalogueImport(input)).toThrow('source reference');
  });
  it('expands shared Wi-Fi into independent, source-backed immutable snapshots', () => {
    const input = manifest();
    const { wifi, ...withoutWifi } = input.libraries[0].content;
    wifi.networks[0].sourceId = 'shared-wifi-source';
    const profile = { id: 'council-wifi', wifi, sources: [{ id: 'shared-wifi-source', kind: 'official', label: 'Wi-Fi profile source', url: 'https://example.invalid/wifi', checkedOn: '2026-10-10' }] };
    const output = parseCatalogueImport({ ...input, wifiProfiles: [profile], libraries: [
      { ...input.libraries[0], wifiProfileId: profile.id, content: withoutWifi },
      { ...input.libraries[0], id: 'import-library-two', slug: 'import-library-two', wifiProfileId: profile.id, content: withoutWifi },
    ] });
    output.libraries[0].content.wifi.networks[0].requirements = 'Changed independently';
    expect(output.libraries[1].content.wifi.networks[0].requirements).toBe(wifi.networks[0].requirements);
    expect(output.libraries[1].content.sources.some((source) => source.id === 'shared-wifi-source')).toBe(true);
    expect(() => parseCatalogueImport({ ...input, libraries: [{ ...input.libraries[0], wifiProfileId: 'missing' }] })).toThrow('profile reference');
  });
  it('imports drafts transactionally and preserves admin edits, archives and repeated imports', () => {
    const db = database();
    try {
      const catalogue = parseCatalogueImport(manifest());
      const plan = createCataloguePlan(catalogue, [], []);
      db.exec(`BEGIN;\n${plan.statements.join('\n')}\nCOMMIT;`);
      expect(db.prepare('SELECT status FROM library_revision').get()?.status).toBe('draft');
      const state = existing(db);
      expect(createCataloguePlan(catalogue, state.libraries, state.suburbs).statements).toEqual([]);
      db.prepare("UPDATE library_revision SET status='archived' WHERE library_id='import-library'").run();
      db.prepare("INSERT INTO library_revision(id,library_id,status,content,created_at) VALUES ('admin-edit','import-library','draft',?,1)").run(JSON.stringify({ ...catalogue.libraries[0].content, description: 'Admin edit to preserve' }));
      expect(createCataloguePlan(catalogue, state.libraries, state.suburbs).skipped).toEqual(['import-library']);
      expect(db.prepare('SELECT count(*) AS count FROM library_revision').get()?.count).toBe(2);
      expect(db.prepare("SELECT content FROM library_revision WHERE id='admin-edit'").get()?.content).toContain('Admin edit to preserve');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });
  it('rejects duplicate identities, conflicting existing rows, missing suburbs and undated sources', () => {
    const input = manifest();
    expect(() => parseCatalogueImport({ ...input, libraries: [...input.libraries, ...input.libraries] })).toThrow('Duplicate');
    const parsed = parseCatalogueImport(input);
    expect(() => createCataloguePlan(parsed, [{ id: 'another-id', slug: 'import-library', institution: 'public', isFixture: false }], [])).toThrow('Conflicting library');
    expect(() => createCataloguePlan({ ...parsed, suburbs: [] }, [], [])).toThrow('Unknown physical suburb');
    input.libraries[0].content.sources[0].checkedOn = null;
    expect(() => parseCatalogueImport(input)).toThrow('dated official sources');
    expect(() => parseCatalogueImport({ ...input, version: 2 })).toThrow('version 1');
  });
  it('migrates a populated database without losing published libraries or saved cards', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys=ON');
      for (const file of ['0001_accounts.sql', '0002_libraries.sql', '0003_usage.sql']) db.exec(readFileSync(`migrations/${file}`, 'utf8'));
      db.exec(createFixtureSql());
      const beforeLibraries = db.prepare('SELECT * FROM library ORDER BY id').all();
      const beforeCards = db.prepare('SELECT * FROM user_card ORDER BY user_id,institution_id').all();
      db.exec(`BEGIN;\n${readFileSync('migrations/0004_notre_dame.sql', 'utf8')}\nCOMMIT;`);
      expect(db.prepare('SELECT * FROM library ORDER BY id').all()).toEqual(beforeLibraries);
      expect(db.prepare('SELECT * FROM user_card ORDER BY user_id,institution_id').all()).toEqual(beforeCards);
      db.prepare("INSERT INTO user_card(user_id,institution_id) VALUES ('fixture-user','notre-dame')").run();
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(() => db.prepare("INSERT INTO institution(id,name) VALUES ('unsupported','Unsupported')").run()).toThrow('CHECK');
    } finally { db.close(); }
    expect(parsePreferences({ suburbId: null, cards: ['uwa', 'curtin', 'ecu', 'murdoch', 'notre-dame'] }).cards).toHaveLength(5);
    const content = emptyLibraryContent();
    content.name = content.address = 'Synthetic Notre Dame validation';
    content.schedule.access = [{ ...content.schedule.building, group: 'notre-dame', requirement: 'Declared Notre Dame card', needsActiveCredentials: true }];
    expect(parseAdminContent(content).schedule.access[0].group).toBe('notre-dame');
  });
});
