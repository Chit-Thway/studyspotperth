import { describe, expect, it } from 'vitest';
import { parseLibraryContent } from './parse-library';
import { libraryFixtures } from '../../tests/fixtures/libraries';

describe('library snapshots', () => {
  it('accepts bundled photo paths and HTTPS photos while rejecting unsafe paths and protocols', () => {
    const content = structuredClone(libraryFixtures[0].content);
    content.photos = [{ url: '/images/libraries/reid-library.webp', alt: 'Library exterior', credit: 'Photographer', sourceId: null }];
    expect(parseLibraryContent(content).photos[0].url).toBe(content.photos[0].url);
    content.photos[0].url = 'https://example.com/library.jpg';
    expect(parseLibraryContent(content).photos[0].url).toBe(content.photos[0].url);
    for (const unsafe of ['//example.com/photo.webp', '/images/libraries/../private.webp', '/api/account', 'javascript:alert(1)', 'http://example.com/photo.jpg']) {
      content.photos[0].url = unsafe;
      expect(() => parseLibraryContent(content)).toThrow();
    }
  });
  it('round-trips fixtures without losing schedules, requirements, or unknown facts', () => {
    for (const fixture of libraryFixtures) expect(parseLibraryContent(JSON.parse(JSON.stringify(fixture.content)))).toEqual(fixture.content);
  });
  it('keeps building and entry schedules independent', () => {
    const fixture = libraryFixtures.find((item) => item.id === 'fixture-uwa')!;
    const parsed = parseLibraryContent(fixture.content);
    expect(parsed.schedule.building.recurring[0].endMinute).toBe(1440);
    expect(parsed.schedule.access.find((access) => access.group === 'public')?.recurring[0].endMinute).toBe(1020);
    expect(parsed.schedule.access.find((access) => access.group === 'uwa')?.requirement).toBe('UWA card required');
  });
  it('omits unrecognised private fields from canonical public content', () => {
    const parsed = parseLibraryContent({ ...libraryFixtures[0].content, privateAdminNote: 'Do not expose this field' });
    expect(parsed).not.toHaveProperty('privateAdminNote');
  });
  it('rejects bad source references, incomplete coordinates, and unsafe links', () => {
    const content = structuredClone(libraryFixtures[0].content);
    content.schedule.building.sourceId = 'missing';
    expect(() => parseLibraryContent(content)).toThrow('source reference');
    content.schedule.building.sourceId = 'fictional-source';
    content.longitude = null;
    expect(() => parseLibraryContent(content)).toThrow('Coordinates');
    content.longitude = 115.86;
    content.officialUrl = 'javascript:alert(1)';
    expect(() => parseLibraryContent(content)).toThrow('HTTPS');
  });
  it('requires a source for confirmed hours and closures', () => {
    const content = structuredClone(libraryFixtures[0].content);
    content.schedule.building.sourceId = null;
    expect(() => parseLibraryContent(content)).toThrow('source reference');
    const semester = structuredClone(libraryFixtures.find((fixture) => fixture.id === 'fixture-semester')!.content);
    semester.schedule.building.overrides[1].sourceId = null;
    expect(() => parseLibraryContent(semester)).toThrow('source reference');
  });
});
