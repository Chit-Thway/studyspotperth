import type { LibraryRecord } from '../../src/domain/library';
import { libraryFixtures } from './libraries';

/** Synthetic records for isolated checks only; never imported into the normal catalogue. */
export function scaleCatalogue(count: number): LibraryRecord[] {
  return Array.from({ length: count }, (_, index) => {
    // Most additions are daytime public branches; the rest exercise university
    // entry, overnight hours, semester exceptions and unknown information.
    const template = libraryFixtures[index % 10 < 7 ? 0 : 1 + index % (libraryFixtures.length - 1)];
    const record = structuredClone(template);
    record.id = `fixture-scale-${index.toString().padStart(3, '0')}`;
    record.slug = `fictional-scale-${index.toString().padStart(3, '0')}`;
    record.content.name = `Fictional scale library ${index + 1}`;
    record.content.latitude = -31.9 - index * 0.001;
    record.content.longitude = 115.85 + index * 0.001;
    record.content.photos = [];
    // Vary public schedules so benchmarks cannot rely on identical calendars.
    if (index % 10 < 7) for (const calendar of [record.content.schedule.building, ...record.content.schedule.access]) {
      calendar.recurring = calendar.recurring.map((interval) => ({ ...interval,
        startMinute: interval.startMinute + index % 4 * 15, endMinute: interval.endMinute - index % 5 * 15 }));
    }
    return { ...record, isFixture: true, revisionId: `${record.id}-published`, status: 'published' };
  });
}
