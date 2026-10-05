import { describe, expect, it } from 'vitest';
import { emptyLibraryContent, parseAdminContent, validateAdminIntervals, validateAdminPublication } from './admin';
import { libraryFixtures } from '../../tests/fixtures/libraries';

describe('administrator schedule/data validation', () => {
  it('starts with unknown facts and no 24/7 flag', () => {
    expect(emptyLibraryContent().schedule.building.status).toBe('unknown');
    expect(emptyLibraryContent().schedule.access).toEqual([]);
    expect(emptyLibraryContent()).not.toHaveProperty('open24Hours');
  });
  it('rejects overlapping hours including overnight carry into the next week', () => {
    expect(() => validateAdminIntervals([{ weekday: 6, startMinute: 1380, endMinute: 1500 }, { weekday: 0, startMinute: 0, endMinute: 120 }])).toThrow(/overlap/);
    expect(() => validateAdminIntervals([{ weekday: 1, startMinute: 540, endMinute: 720 }, { weekday: 1, startMinute: 660, endMinute: 780 }])).toThrow(/overlap/);
    expect(() => validateAdminIntervals([{ weekday: 1, startMinute: 0, endMinute: 1440 }, { weekday: 2, startMinute: 0, endMinute: 1440 }])).not.toThrow();
  });
  it('rejects conflicting exceptions while allowing exact-date precedence over a period', () => {
    const content = structuredClone(libraryFixtures[0].content);
    const exception = { id: 'period', kind: 'period' as const, startDate: '2026-10-01', endDate: '2026-10-31', status: 'closed' as const, intervals: [], sourceId: content.sources[0].id };
    content.schedule.building.overrides = [exception, { ...exception, id: 'overlap' }];
    expect(() => parseAdminContent(content)).toThrow(/Conflicting/);
    content.schedule.building.overrides[1] = { ...exception, id: 'exact', kind: 'date', startDate: '2026-10-05', endDate: '2026-10-05' };
    expect(() => parseAdminContent(content)).not.toThrow();
  });
  it('rejects incomplete university Wi-Fi and a confirmed unknown entry group', () => {
    const content = structuredClone(libraryFixtures[0].content);
    content.wifi = { status: 'known', networks: [{ name: 'University', kind: 'institution', eligibleCards: [], needsActiveCredentials: true, requirements: 'Active student credentials', limits: null, helpUrl: null, sourceId: content.sources[0].id }] };
    expect(() => parseAdminContent(content)).toThrow(/eligible cards/);
    content.wifi.status = 'unknown'; content.wifi.networks = [];
    content.schedule.access[0].group = 'unknown';
    expect(() => parseAdminContent(content)).toThrow(/confirmed entry group/);
  });
  it('requires dated non-fixture sources before publication', () => {
    const content = structuredClone(libraryFixtures[0].content);
    expect(() => validateAdminPublication(content)).toThrow(/dated/);
    content.sources = [{ ...content.sources[0], kind: 'official', url: 'https://example.invalid/library', checkedOn: null }];
    expect(() => validateAdminPublication(content)).toThrow(/dated/);
    content.sources[0].checkedOn = '2026-10-05';
    expect(() => validateAdminPublication(content)).not.toThrow();
  });
});
