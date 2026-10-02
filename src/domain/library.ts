import type { CalendarSchedule } from './schedule';
import type { Institution, UniversityCard } from './search-context';

export type FactStatus = 'yes' | 'no' | 'unknown';
export interface SourceRecord {
  id: string;
  kind: 'official' | 'confirmation' | 'fixture';
  label: string;
  url: string | null;
  checkedOn: string | null;
}
export interface LibraryPhoto { url: string; alt: string; credit: string; sourceId: string | null }
export interface WifiNetwork {
  name: string;
  kind: 'public' | 'institution' | 'eduroam' | 'restricted-guest' | 'unknown';
  eligibleCards: UniversityCard[];
  needsActiveCredentials: boolean;
  requirements: string;
  limits: string | null;
  helpUrl: string | null;
  sourceId: string | null;
}
export interface EntrySchedule extends CalendarSchedule {
  group: 'public' | 'unknown' | UniversityCard;
  requirement: string;
  needsActiveCredentials: boolean;
}
/** A complete, immutable snapshot. No unchecked 24/7 flag is stored. */
export interface LibraryContent {
  name: string;
  address: string;
  suburbId: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string;
  officialUrl: string | null;
  photos: LibraryPhoto[];
  facilities: { quietStudy: FactStatus; groupStudy: FactStatus; wheelchairAccess: FactStatus };
  wifi: { status: 'known' | 'unknown'; networks: WifiNetwork[] };
  schedule: { timeZone: 'Australia/Perth'; building: CalendarSchedule; access: EntrySchedule[] };
  sources: SourceRecord[];
}
export interface LibraryRecord {
  id: string;
  slug: string;
  institution: Institution;
  isFixture: boolean;
  revisionId: string;
  status: 'draft' | 'published' | 'archived';
  content: LibraryContent;
}
