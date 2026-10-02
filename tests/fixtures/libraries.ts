import type { LibraryContent } from '../../src/domain/library.ts';
import type { CalendarSchedule, WeeklyInterval } from '../../src/domain/schedule.ts';
import { parseLibraryContent } from '../../src/domain/parse-library.ts';
import type { Institution } from '../../src/domain/search-context.ts';

const sourceId = 'fictional-source';
const week = (startMinute: number, endMinute: number): WeeklyInterval[] =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute, endMinute }));
function calendar(startMinute: number, endMinute: number): CalendarSchedule {
  return { status: 'known', recurring: week(startMinute, endMinute), overrides: [], sourceId };
}
function content(name: string, building: CalendarSchedule, group: 'public' | 'uwa' | 'curtin' | 'unknown'): LibraryContent {
  return {
    name: `Fictional ${name}`, address: 'Synthetic test address; not a real library', suburbId: 'fixture-cbd',
    latitude: -31.95, longitude: 115.86, description: 'Fictional test record. Not verified library information.', officialUrl: null,
    photos: [], facilities: { quietStudy: 'yes', groupStudy: 'unknown', wheelchairAccess: 'unknown' },
    wifi: { status: 'known', networks: [{ name: `Fictional ${group} Wi-Fi`, kind: group === 'public' ? 'public' : 'institution',
      eligibleCards: group === 'uwa' || group === 'curtin' ? [group] : [], needsActiveCredentials: group !== 'public',
      requirements: group === 'public' ? 'Synthetic public network' : 'Synthetic university credentials required',
      limits: null, helpUrl: null, sourceId }] },
    schedule: { timeZone: 'Australia/Perth', building, access: [{ ...structuredClone(building), group,
      requirement: group === 'public' ? 'Public entry' : group === 'unknown' ? 'Unknown entry requirements' : `${group.toUpperCase()} card required`,
      needsActiveCredentials: false }] },
    sources: [{ id: sourceId, kind: 'fixture', label: 'Synthetic test fixture; no real opening-hours claim', url: null, checkedOn: null }],
  };
}

const publicDay = content('Public Day Library', calendar(540, 1020), 'public');
publicDay.photos = [{ url: 'https://example.invalid/fictional-library.jpg', alt: 'Fictional test image; not a real library photograph', credit: 'Synthetic fixture', sourceId }];
const uwa = content('UWA Round-the-Clock Library', calendar(0, 1440), 'uwa');
uwa.wifi.networks.push({ name: 'Fictional eduroam', kind: 'eduroam', eligibleCards: ['uwa', 'curtin', 'ecu', 'murdoch'],
  needsActiveCredentials: true, requirements: 'Synthetic participating-institution login required', limits: null, helpUrl: 'https://example.invalid/wifi-help', sourceId });
uwa.schedule.access.unshift({ ...calendar(540, 1020), group: 'public', requirement: 'Public entry during daytime hours', needsActiveCredentials: false });
const curtin = content('Curtin Round-the-Clock Library', calendar(0, 1440), 'curtin');
const late = content('Late Study Library', calendar(540, 1380), 'public');
late.wifi.networks.push({ name: 'Fictional restricted guest network', kind: 'restricted-guest', eligibleCards: [], needsActiveCredentials: true,
  requirements: 'Synthetic invitation and guest credentials required', limits: 'Synthetic one-day guest access', helpUrl: null, sourceId });
const overnight = content('Overnight Library', calendar(1200, 1800), 'public');
const exceptions = content('Semester Library', calendar(540, 1020), 'uwa');
for (const schedule of [exceptions.schedule.building, exceptions.schedule.access[0]]) {
  schedule.overrides = [
    { id: 'semester-hours', kind: 'period', startDate: '2026-10-01', endDate: '2026-10-31', status: 'hours', intervals: week(0, 1440), sourceId },
    { id: 'one-day-closure', kind: 'date', startDate: '2026-10-15', endDate: '2026-10-15', status: 'closed', intervals: [], sourceId },
  ];
}
const unknown = content('Unknown Hours Library', { status: 'unknown', recurring: [], overrides: [], sourceId: null }, 'unknown');
unknown.latitude = unknown.longitude = null;
unknown.facilities = { quietStudy: 'unknown', groupStudy: 'unknown', wheelchairAccess: 'unknown' };
unknown.wifi = { status: 'unknown', networks: [] };
const unknownAccess = content('Unknown Entry Library', calendar(540, 1020), 'unknown');
unknownAccess.wifi = { status: 'unknown', networks: [] };

const fixtures: { id: string; slug: string; institution: Institution; content: LibraryContent }[] = [
  { id: 'fixture-public', slug: 'fictional-public-day', institution: 'public', content: publicDay },
  { id: 'fixture-uwa', slug: 'fictional-uwa-24-hours', institution: 'uwa', content: uwa },
  { id: 'fixture-curtin', slug: 'fictional-curtin-24-hours', institution: 'curtin', content: curtin },
  { id: 'fixture-late', slug: 'fictional-late-study', institution: 'public', content: late },
  { id: 'fixture-overnight', slug: 'fictional-overnight', institution: 'public', content: overnight },
  { id: 'fixture-semester', slug: 'fictional-semester', institution: 'uwa', content: exceptions },
  { id: 'fixture-unknown', slug: 'fictional-unknown-hours', institution: 'public', content: unknown },
  { id: 'fixture-unknown-entry', slug: 'fictional-unknown-entry', institution: 'public', content: unknownAccess },
];
export const libraryFixtures = fixtures.map((fixture) => ({ ...fixture, content: parseLibraryContent(fixture.content) }));

/** Deterministic, local-only fixture import. No real users, credentials, or photos. */
export function createFixtureSql(): string {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const fixedTime = 1_790_812_800_000;
  return [
    "INSERT OR IGNORE INTO suburb (id,name,latitude,longitude,is_fixture) VALUES ('fixture-cbd','Fictional CBD origin',-31.95,115.86,1);",
    ...libraryFixtures.flatMap((fixture) => [
      `DELETE FROM library WHERE id = ${quote(fixture.id)} AND is_fixture = 1;`,
      `INSERT INTO library (id,slug,institution_id,is_fixture) VALUES (${quote(fixture.id)},${quote(fixture.slug)},${quote(fixture.institution)},1);`,
      `INSERT INTO library_revision (id,library_id,status,content,created_at,published_at) VALUES (${quote(`${fixture.id}-published`)},${quote(fixture.id)},'published',${quote(JSON.stringify(fixture.content))},${fixedTime},${fixedTime});`,
    ]),
    `INSERT OR IGNORE INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('fixture-user','Fictional Student','fixture-user@example.invalid',0,${fixedTime},${fixedTime});`,
    "INSERT OR IGNORE INTO user_preferences (user_id,suburb_id) VALUES ('fixture-user','fixture-cbd');",
    "INSERT OR IGNORE INTO user_card (user_id,institution_id) VALUES ('fixture-user','uwa');",
    "INSERT OR IGNORE INTO favourite (user_id,library_id) VALUES ('fixture-user','fixture-public');",
    "INSERT OR IGNORE INTO user_role (user_id,role) VALUES ('fixture-user','user');",
  ].join('\n');
}
