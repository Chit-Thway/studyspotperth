export type UniversityCard = 'uwa' | 'curtin' | 'ecu' | 'murdoch';
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
