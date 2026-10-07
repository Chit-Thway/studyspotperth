import type { EntrySchedule, LibraryContent, SourceRecord, WifiNetwork } from '../../src/domain/library.ts';
import type { CalendarSchedule, WeeklyInterval } from '../../src/domain/schedule.ts';
import type { Institution } from '../../src/domain/search-context.ts';
import { parseLibraryContent } from '../../src/domain/parse-library.ts';
import { launchLocations } from './launch-locations.ts';
import { launchPhotos } from './launch-photos.ts';

const checkedOn = '2026-10-05';
const weekdays = [1, 2, 3, 4, 5];
const weekends = [0, 6];
const participatingCards: WifiNetwork['eligibleCards'] = ['uwa', 'curtin', 'ecu', 'murdoch'];
const ecuWifiUrl = 'https://www.ecu.edu.au/centres/digital-services/wireless-network-access';
const curtinWifiUrl = 'https://www.curtin.edu.au/students/essentials/it/internet-computers-printing/wireless/';
const membershipSources = () => [source('ecu-eduroam', 'ECU eduroam membership and roaming', ecuWifiUrl),
  source('curtin-eduroam', 'Curtin eduroam membership and roaming', curtinWifiUrl),
  source('murdoch-eduroam', 'Murdoch eduroam membership and roaming', murdochWifiUrl)];
const intervals = (days: number[], startMinute: number, endMinute: number): WeeklyInterval[] =>
  days.map((weekday) => ({ weekday, startMinute, endMinute }));
const fullWeek = intervals([0, 1, 2, 3, 4, 5, 6], 0, 1440);
const unknown = (): CalendarSchedule => ({ status: 'unknown', recurring: [], overrides: [], sourceId: null });
const regular = (hours: WeeklyInterval[], sourceId: string): CalendarSchedule =>
  ({ status: 'known', recurring: hours, overrides: [], sourceId });
// Dynamic university calendars confirm these dates, not year-round opening hours.
const verifiedDates = (hours: WeeklyInterval[], sourceId: string): CalendarSchedule => ({ ...unknown(), overrides: [{
  id: 'verified-october-dates', kind: 'period', startDate: '2026-10-05', endDate: '2026-10-18',
  status: 'hours', intervals: hours, sourceId,
}] });
const source = (id: string, label: string, url: string): SourceRecord => ({ id, kind: 'official', label, url, checkedOn });
const entry = (group: EntrySchedule['group'], calendar: CalendarSchedule): EntrySchedule => ({
  ...structuredClone(calendar), group, requirement: group === 'public' ? 'Public access' : `${group.toUpperCase()} card required`,
  needsActiveCredentials: false,
});
const network = (name: string, kind: WifiNetwork['kind'], eligibleCards: WifiNetwork['eligibleCards'],
  requirements: string, sourceId: string, helpUrl: string, limits: string | null = null): WifiNetwork => ({
  name, kind, eligibleCards, requirements, sourceId, helpUrl, limits, needsActiveCredentials: kind !== 'public',
});
const uwaHoursUrl = 'https://www.uwa.edu.au/library/visit-our-libraries/opening-hours';
const uwaWifiUrl = 'https://ipoint.uwa.edu.au/app/answers/detail/a_id/683/~/wireless-access-at-uwa';
const uwaPublicHours = [
  [...intervals(weekdays, 450, 1200), ...intervals(weekends, 540, 1020)],
  [...intervals(weekdays, 450, 1200), ...intervals(weekends, 540, 1020)],
  [...intervals(weekdays, 540, 1320), ...intervals(weekends, 780, 1020)],
  [...intervals([1, 2, 3, 4], 480, 1200), ...intervals([5], 480, 960), ...intervals(weekends, 780, 1020)],
  [...intervals([1, 2, 3, 4], 480, 1200), ...intervals([5], 480, 960)],
];
interface LaunchLibrary { id: string; slug: string; institution: Institution; content: LibraryContent }
function library(slug: string, institution: Institution, name: string, address: string, officialUrl: string,
  description: string, building: CalendarSchedule, access: EntrySchedule[], sources: SourceRecord[]): LaunchLibrary {
  const photo = launchPhotos[slug];
  return { id: `launch-${slug}`, slug, institution, content: {
    name, address, officialUrl, description, suburbId: null, latitude: null, longitude: null,
    photos: photo ? [{ url: photo.url, alt: photo.alt, credit: photo.credit, sourceId: 'photo' }] : [],
    facilities: { quietStudy: 'unknown', groupStudy: 'unknown', wheelchairAccess: 'unknown' },
    wifi: { status: 'unknown', networks: [] }, schedule: { timeZone: 'Australia/Perth', building, access }, sources: [...sources,
      ...(photo ? [
        { id: 'photo', kind: 'confirmation' as const, label: `Photo: ${photo.credit}`, url: photo.sourceUrl, checkedOn: '2026-10-07' },
        { id: 'photo-license', kind: 'confirmation' as const, label: photo.licence, url: photo.licenceUrl, checkedOn: '2026-10-07' },
      ] : []),
    ],
  } };
}
const uwaLibraries = [
  ['reid-library', 'Reid Library', 'UWA Crawley campus, 35 Stirling Highway, Crawley',
    '24/7 UWA CampusCard entry to ground and first floors via the main entrance. Other floors follow public hours.'],
  ['barry-j-marshall-library', 'Barry J Marshall Library', 'UWA Crawley campus, 35 Stirling Highway, Crawley',
    'Silent study areas and bookable group rooms on the Crawley campus.'],
  ['beasley-law-library', 'Beasley Law Library', 'UWA Crawley campus, 35 Stirling Highway, Crawley',
    'Silent and group study spaces. No longer 24/7; UWA CampusCard holders have earlier semester entry.'],
  ['edfaa-library', 'EDFAA Library', 'UWA Nedlands campus, Nedlands',
    'Education, Fine Arts and Architecture Library. Reopened with building works continuing on the south side.'],
  ['j-robin-warren-library', 'J. Robin Warren Library', 'UWA Health campus, Nedlands',
    '24/7 UWA CampusCard entry to ground and first floors; use the side entrance after hours.'],
].map(([slug, name, address, description], index) => {
  const officialUrl = `https://www.uwa.edu.au/facilities/${slug}`;
  const publicHours = verifiedDates(uwaPublicHours[index], 'hours');
  const is24 = index === 0 || index === 4;
  const building = is24 ? regular(fullWeek, 'hours') : structuredClone(publicHours);
  const access = [entry('public', publicHours)];
  if (is24) access.push(entry('uwa', building));
  if (index === 2) {
    const early = verifiedDates([...intervals(weekdays, 420, 1320), ...intervals(weekends, 540, 1020)], 'hours');
    building.overrides = structuredClone(early.overrides);
    access.push(entry('uwa', early));
  }
  const record = library(slug, 'uwa', name, address, officialUrl, description, building, access,
    [source('venue', name, officialUrl), source('hours', 'Public hours 5–18 October 2026 and CampusCard policy', uwaHoursUrl)]);
  if (index !== 3) record.content.facilities = { quietStudy: 'yes', groupStudy: 'yes', wheelchairAccess: index === 4 ? 'unknown' : 'yes' };
  if ([0, 1, 4].includes(index)) {
    record.content.sources.push(source('wifi', 'UWA wireless eligibility', uwaWifiUrl));
    record.content.wifi = { status: 'known', networks: [network('Unifi', 'institution', ['uwa'],
      'Active UWA UniID and acceptance of internet terms required.', 'wifi', uwaWifiUrl, 'Up to three devices.')] };
  }
  return record;
});

const curtinUrl = 'https://www.curtin.edu.au/library/using-the-library/tl-robertson-library/';
const curtinBuilding = verifiedDates(fullWeek, 'venue');
const curtinPublic = verifiedDates(intervals([0, 1, 2, 3, 4, 5, 6], 480, 1200), 'venue');
const curtin = library('tl-robertson-library', 'curtin', 'TL Robertson Library', 'Building 105, Curtin Bentley campus, Bentley',
  curtinUrl, 'Levels 2–3 offer 24-hour study. Curtin card required before 8 am and after 8 pm; upper floors have shorter hours.',
  curtinBuilding, [entry('public', curtinPublic), entry('curtin', curtinBuilding)],
  [source('venue', 'TL Robertson hours 5–18 October 2026, entry and study spaces', curtinUrl)]);
curtin.content.facilities.quietStudy = curtin.content.facilities.groupStudy = 'yes';
const cgsbUrl = 'https://www.curtin.edu.au/library/using-the-library/cgsb/';
const cgsb = library('curtin-graduate-school-of-business-library', 'curtin', 'Curtin Graduate School of Business Library',
  '78 Murray Street, Perth', cgsbUrl, 'Curtin staff and student swipe-card access. Opening hours await confirmation from CGSB.',
  unknown(), [entry('curtin', unknown())], [source('venue', 'CGSB location and swipe-card access; hours not published', cgsbUrl)]);

const ecuHoursUrl = 'https://www.ecu.edu.au/centres/library-services/opening-hours';
const ecuLocationUrl = 'https://www.ecu.edu.au/centres/library-services/contact';
const ecuLibraries = [
  ['ecu-joondalup-library', 'ECU Joondalup Campus Library', 'Building 31, 270 Joondalup Drive, Joondalup',
    'Lower level 1 and level 2 offer 24/7 ECU card access. Other levels follow staffed hours. Public entry hours await confirmation.'],
  ['ecu-city-library', 'ECU City Campus Library (Kaarlak)', 'Levels 4–5, 500 Wellington Street, Perth',
    'Kaarlak levels 4–5 offer 24/7 ECU card access. Public entry is Monday–Friday, 8 am–6 pm during semester.'],
].map(([slug, name, address, description], index) => {
  const building = regular(fullWeek, 'hours');
  const access = [entry('ecu', building)];
  // City explicitly publishes public access. Do not assume Joondalup's staffed hours establish visitor eligibility.
  if (index === 1) access.unshift(entry('public', verifiedDates(intervals(weekdays, 480, 1080), 'hours')));
  else access.unshift({ ...entry('public', unknown()), requirement: 'Public entry hours unconfirmed' });
  return library(slug, 'ecu', name, address, ecuHoursUrl, description, building, access,
    [source('hours', 'ECU 24-hour card policy and semester public hours', ecuHoursUrl), source('location', 'ECU library locations', ecuLocationUrl)]);
});

const murdochUrl = 'https://www.murdoch.edu.au/library/visit-us';
const murdochVisitorUrl = 'https://www.murdoch.edu.au/library/borrow/join-the-library';
const murdochStudyUrl = 'https://www.murdoch.edu.au/library/visit-us/study-spaces';
const murdochWifiUrl = 'https://www.murdoch.edu.au/mymurdoch/support-advice/learning-study/student-it/internet-and-wifi';
const boltonBuilding = regular(fullWeek, 'hours');
const boltonPublic = regular([...intervals(weekdays, 480, 1380), ...intervals(weekends, 600, 1020)], 'hours');
const bolton = library('geoffrey-bolton-library', 'murdoch', 'Geoffrey Bolton Library', 'Building 350, 90 South Street, Murdoch',
  murdochUrl, 'The level 2 Learning Common offers 24/7 Murdoch card access via the entrance near the ECL courtyard. Other floors follow regular hours.',
  boltonBuilding, [entry('public', boltonPublic), entry('murdoch', boltonBuilding)],
  [source('hours', 'Murdoch locations, opening hours and after-hours entry', murdochUrl),
    source('visitors', 'Visitor study-space eligibility', murdochVisitorUrl), source('spaces', 'Study zones and Learning Common', murdochStudyUrl),
    source('wifi', 'Murdoch eduroam requirements', murdochWifiUrl)]);
bolton.content.facilities.quietStudy = bolton.content.facilities.groupStudy = 'yes';
bolton.content.wifi = { status: 'known', networks: [network('eduroam', 'eduroam', participatingCards,
  'Active participating-institution credentials required.', 'wifi', murdochWifiUrl)] };
bolton.content.sources.push(source('uwa-eduroam', 'UWA eduroam use at participating institutions',
  'https://ipoint.uwa.edu.au/app/answers/detail/a_id/1045/~/accessing-wifi-at-other-universities-%28eduroam%29'));
const lawHours = regular([...intervals(weekdays, 480, 1140), ...intervals([6], 780, 1020)], 'hours');
const murdochLaw = library('honourable-michael-murray-law-library', 'murdoch', 'Honourable Michael Murray Law Library',
  'Level 3, South Wing, Building 354, 90 South Street, Murdoch', murdochUrl, 'Law collection and study space; closed on Sundays.',
  lawHours, [entry('public', lawHours)], [source('hours', 'Murdoch library locations and hours', murdochUrl),
    source('visitors', 'Visitor study-space eligibility', murdochVisitorUrl)]);

const cityUrl = 'https://perth.wa.gov.au/Library';
const cityWifiUrl = 'https://www.perth.wa.gov.au/community/community-services-and-facilities/city-of-perth-library/computers-wifi-print-and-copy';
const holidayUrl = 'https://www.wa.gov.au/service/employment/workplace-arrangements/public-holidays-western-australia';
const cityHours = regular([...intervals(weekdays, 480, 1080), ...intervals([6], 600, 960), ...intervals([0], 720, 960)], 'venue');
const holidays = ['2026-01-01', '2026-01-26', '2026-03-02', '2026-04-03', '2026-04-05', '2026-04-06', '2026-04-25', '2026-04-27',
  '2026-06-01', '2026-09-28', '2026-12-25', '2026-12-26', '2026-12-28', '2027-01-01', '2027-01-26', '2027-03-01',
  '2027-03-26', '2027-03-28', '2027-03-29', '2027-04-25', '2027-04-26', '2027-06-07', '2027-09-27', '2027-12-25',
  '2027-12-26', '2027-12-27', '2027-12-28'];
cityHours.overrides = holidays.map((date) => ({ id: `holiday-${date}`, kind: 'date', startDate: date, endDate: date,
  status: 'closed', intervals: [], sourceId: 'holidays' }));
const city = library('city-of-perth-library', 'public', 'City of Perth Library', '573 Hay Street, Perth', cityUrl,
  'Public library in the city centre. Closed on public holidays.', cityHours, [entry('public', cityHours)],
  [source('venue', 'City library hours and accessibility', cityUrl), source('wifi', 'Library Perth WiFi', cityWifiUrl),
    source('holidays', 'Perth public holiday dates 2026–2027', holidayUrl)]);
city.content.facilities.wheelchairAccess = 'yes';
city.content.wifi = { status: 'known', networks: [network('Perth WiFi', 'public', [],
  'Accept the wireless conditions to connect.', 'wifi', cityWifiUrl, '2 GB per day, reset at midnight.')] };

const stateUrl = 'https://slwa.wa.gov.au/plan-my-visit/hours-transport-access/opening-hours';
const stateWifiUrl = 'https://slwa.wa.gov.au/plan-my-visit/services/computers-internet';
const stateHours = regular([...intervals([1, 2, 3, 4], 540, 1200), ...intervals([5], 540, 1050), ...intervals(weekends, 600, 1050)], 'hours');
for (const date of ['2026-12-25', '2026-12-26']) stateHours.overrides.push({ id: `closure-${date}`, kind: 'date', startDate: date,
  endDate: date, status: 'closed', intervals: [], sourceId: 'hours' });
for (const date of ['2026-09-28', '2026-12-24', '2026-12-28']) stateHours.overrides.push({ id: `holiday-${date}`, kind: 'date',
  startDate: date, endDate: date, status: 'hours', intervals: intervals([new Date(`${date}T00:00:00Z`).getUTCDay()], 600, 1050), sourceId: 'hours' });
const state = library('state-library-of-western-australia', 'public', 'State Library of Western Australia',
  'Perth Cultural Centre, 25 Francis Street, Perth', stateUrl, 'Public study space in the Perth Cultural Centre with free guest Wi-Fi.',
  stateHours, [entry('public', stateHours)], [source('hours', 'State Library regular and 2026 holiday hours', stateUrl),
    source('wifi', 'State Library guest Wi-Fi', stateWifiUrl)]);
state.content.wifi = { status: 'known', networks: [network('WIFI-Guest', 'public', [],
  'Accept the terms to connect; no password required.', 'wifi', stateWifiUrl)] };

// Roaming membership is sourced separately from coverage at each library.
for (const record of [...uwaLibraries.filter((_, index) => [0, 1, 4].includes(index)), curtin, ...ecuLibraries, bolton]) {
  record.content.sources.push(...membershipSources(), source('uwa-roaming', 'UWA eduroam roaming',
    'https://ipoint.uwa.edu.au/app/answers/detail/a_id/1045/~/accessing-wifi-at-other-universities-%28eduroam%29'));
}
for (const record of uwaLibraries.filter((_, index) => [0, 1, 4].includes(index))) {
  record.content.wifi.networks.push(network('eduroam', 'eduroam', participatingCards.filter((card) => card !== 'uwa'),
    'Visiting participating-institution users need active home-institution credentials.', 'wifi', uwaWifiUrl));
}
const curtinLibraryWifiUrl = 'https://students.connect.curtin.edu.au/app/faq/a_id/1974';
curtin.content.sources.push(source('wifi', 'Curtin Library Wi-Fi for WA university visitors', curtinLibraryWifiUrl));
curtin.content.wifi = { status: 'known', networks: [network('eduroam', 'eduroam', participatingCards,
  'Active participating-institution credentials required.', 'wifi', curtinWifiUrl)] };
for (const record of ecuLibraries) {
  record.content.sources.push(source('wifi', 'ECU campus wireless networks and guest access', ecuWifiUrl));
  record.content.wifi = { status: 'known', networks: [
    network('eduroam', 'eduroam', participatingCards, 'Active participating-institution credentials required.', 'wifi', ecuWifiUrl),
    network('ECU Guest', 'public', [], 'Accept the on-screen wireless conditions to connect.', 'wifi', ecuWifiUrl),
  ] };
}

/** Public facts and licensed photographs only. Unsupported facts remain unconfirmed. */
export const launchLibraries = [...uwaLibraries, curtin, cgsb, ...ecuLibraries, bolton, murdochLaw, city, state]
  .map((record) => {
    const point = launchLocations[record.slug];
    if (!point) throw new Error('Launch library is missing a sourced map point.');
    const content = { ...record.content, latitude: point.latitude, longitude: point.longitude, sources: [...record.content.sources,
      { id: 'map-location', kind: point.kind, label: point.label, url: point.url, checkedOn: '2026-10-06' },
      ...(point.osm ? [{ id: 'map-license', kind: 'confirmation' as const, label: 'OpenStreetMap location data © contributors, Open Database License', url: 'https://www.openstreetmap.org/copyright', checkedOn: '2026-10-06' }] : []),
    ] };
    return { ...record, content: parseLibraryContent(content) };
  });

/** Import and upgrade untouched launch snapshots; preserve edits, archives and conflicting slugs. */
export function createLaunchStatements(): string[] {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const timestamp = Date.parse(`${checkedOn}T00:00:00+08:00`);
  return launchLibraries.flatMap((record) => {
    const initial = `${record.id}-initial`;
    const located = `${record.id}-location-v1`;
    const photographed = `${record.id}-photos-v1`;
    const content = quote(JSON.stringify(record.content));
    const beforePhotos = { ...record.content, photos: [], sources: record.content.sources.filter((item) => !['photo', 'photo-license'].includes(item.id)) };
    const locatedContent = quote(JSON.stringify(beforePhotos));
    const legacy = quote(JSON.stringify({ ...beforePhotos, latitude: null, longitude: null, sources: beforePhotos.sources.filter((item) => !['map-location', 'map-license'].includes(item.id)) }));
    const updatedAt = Date.parse('2026-10-06T00:00:00+08:00');
    const photoUpdatedAt = Date.parse('2026-10-07T00:00:00+08:00');
    return [
    `INSERT OR IGNORE INTO library (id,slug,institution_id,is_fixture) VALUES (${quote(record.id)},${quote(record.slug)},${quote(record.institution)},0);`,
    `INSERT INTO library_revision (id,library_id,status,content,created_at,published_at) SELECT ${quote(`${record.id}-initial`)},id,'published',${quote(JSON.stringify(record.content))},${timestamp},${timestamp} FROM library WHERE id=${quote(record.id)} AND slug=${quote(record.slug)} AND institution_id=${quote(record.institution)} AND is_fixture=0 AND NOT EXISTS (SELECT 1 FROM library_revision WHERE library_id=${quote(record.id)});`,
      // Upgrade only the exact untouched original snapshot. Preserve every admin revision/edit.
      `INSERT INTO library_revision(id,library_id,status,content,created_at) SELECT ${quote(located)},l.id,'draft',${locatedContent},${updatedAt} FROM library l INNER JOIN library_revision r ON r.library_id=l.id WHERE l.id=${quote(record.id)} AND l.slug=${quote(record.slug)} AND l.institution_id=${quote(record.institution)} AND l.is_fixture=0 AND r.id=${quote(initial)} AND r.status='published' AND r.content=${legacy} AND NOT EXISTS(SELECT 1 FROM library_revision other WHERE other.library_id=l.id AND other.id<>r.id);`,
      `UPDATE library_revision SET status='archived' WHERE id=${quote(initial)} AND status='published' AND EXISTS(SELECT 1 FROM library_revision r WHERE r.id=${quote(located)} AND r.status='draft' AND r.content=${locatedContent});`,
      `UPDATE library_revision SET status='published',published_at=${updatedAt} WHERE id=${quote(located)} AND status='draft' AND EXISTS(SELECT 1 FROM library_revision r WHERE r.id=${quote(initial)} AND r.status='archived');`,
      ...(record.content.photos.length ? [
        // Only exact, untouched launch snapshots qualify. Admin photos, drafts and archived listings are preserved.
        `INSERT INTO library_revision(id,library_id,status,content,created_at) SELECT ${quote(photographed)},l.id,'draft',${content},${photoUpdatedAt} FROM library l INNER JOIN library_revision r ON r.library_id=l.id WHERE l.id=${quote(record.id)} AND l.slug=${quote(record.slug)} AND l.institution_id=${quote(record.institution)} AND l.is_fixture=0 AND r.id IN(${quote(initial)},${quote(located)}) AND r.status='published' AND r.content=${locatedContent} AND NOT EXISTS(SELECT 1 FROM library_revision other WHERE other.library_id=l.id AND other.id NOT IN(${quote(initial)},${quote(located)}));`,
        `UPDATE library_revision SET status='archived' WHERE id IN(${quote(initial)},${quote(located)}) AND status='published' AND EXISTS(SELECT 1 FROM library_revision r WHERE r.id=${quote(photographed)} AND r.status='draft' AND r.content=${content});`,
        `UPDATE library_revision SET status='published',published_at=${photoUpdatedAt} WHERE id=${quote(photographed)} AND status='draft' AND NOT EXISTS(SELECT 1 FROM library_revision r WHERE r.library_id=${quote(record.id)} AND r.status='published');`,
      ] : []),
    ];
  });
}
/** Local Wrangler executes this file as one D1 batch; runtime callers also use batch(). */
export function createLaunchSql(): string { return createLaunchStatements().join('\n'); }
