export const UNIVERSITY_CARDS = ['uwa', 'curtin', 'ecu', 'murdoch', 'notre-dame'] as const;
export const INSTITUTION_CODES = ['public', ...UNIVERSITY_CARDS] as const;
export type UniversityCard = typeof UNIVERSITY_CARDS[number];
export type Institution = UniversityCard | 'public';

export interface AccessProfile {
  suburb: string;
  universityCards: readonly UniversityCard[];
}

export interface SearchFilters {
  institutions: readonly UniversityCard[];
  publicAccess: boolean;
  open24Hours: boolean;
  usableWifi: boolean;
  quietStudy: boolean;
  groupStudy: boolean;
  wheelchairAccess: boolean;
}

export interface SearchContext {
  profile: AccessProfile;
  filters: SearchFilters;
}

export function createSearchContext(profile: AccessProfile): SearchContext {
  return {
    profile,
    filters: {
      institutions: [], publicAccess: false, open24Hours: false, usableWifi: false,
      quietStudy: false, groupStudy: false, wheelchairAccess: false,
    },
  };
}

export function updateAccessProfile(context: SearchContext, profile: AccessProfile): SearchContext {
  return { ...context, profile };
}
