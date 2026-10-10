import { useEffect, useMemo, useState } from 'react';
import { catalogueSearchRequest } from '../../domain/public-catalogue';
import { evaluateLibrary, rankLibraryCandidates, pageLibraryCandidates } from '../../domain/library-search';
import { createCalendarTimelineReader } from '../../domain/availability';
import { formatPerthTime } from '../../domain/perth-time';
import { SearchValidationError } from '../../domain/search-request';
import { locationHeader, locationOrigin, type Coordinates } from '../../domain/location';
import { LibraryApiError, type SearchResponse, type DetailResponse } from './api';
import { usePublicCatalogue } from './catalogue-context';

function useCatalogueRequest(query: string, coordinates?: Coordinates | null, enabled = true) {
  const source = usePublicCatalogue();
  const [clock, setClock] = useState(Date.now);
  const refreshNow = !new URLSearchParams(query).has('start');
  useEffect(() => {
    if (!refreshNow || !enabled) return;
    const visible = () => { if (!document.hidden) setClock(Date.now()); };
    visible();
    const timer = window.setInterval(visible, 60_000);
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refreshNow, enabled]);
  const location = locationHeader(coordinates);
  const rankingParams = new URLSearchParams(query);
  rankingParams.delete('offset'); rankingParams.delete('limit');
  const rankingQuery = rankingParams.toString();
  const selection = useMemo(() => {
    if (!enabled || !source.data) return { request: null, error: null };
    try {
      const point = locationOrigin(location);
      return { request: catalogueSearchRequest(source.data, new URLSearchParams(query), clock, point), error: null };
    } catch (failure) {
      return { request: null, error: failure instanceof SearchValidationError ? new LibraryApiError(400, failure.message, failure.field)
        : new Error('Library information couldn’t load.') };
    }
  }, [enabled, source.data, query, clock, location]);
  const rankingRequest = useMemo(() => {
    if (!enabled || !source.data) return null;
    try { return catalogueSearchRequest(source.data, new URLSearchParams(rankingQuery), clock, locationOrigin(location)); }
    catch { return null; }
  }, [enabled, source.data, rankingQuery, clock, location]);
  return { ...source, request: selection.request, rankingRequest, error: selection.error ?? source.error, loading: !enabled || source.loading };
}

export function useLibrarySearch(query: string, coordinates?: Coordinates | null, enabled = true) {
  const source = useCatalogueRequest(query, coordinates, enabled);
  const ranked = useMemo(() => source.data && source.rankingRequest ? rankLibraryCandidates(source.data.libraries, source.rankingRequest) : [],
    [source.data, source.rankingRequest]);
  const data = useMemo((): SearchResponse | null => {
    if (!source.data || !source.request) return null;
    const request = source.request;
    const page = pageLibraryCandidates(ranked, request);
    const timeline = page.results.length ? createCalendarTimelineReader(formatPerthTime(request.start).slice(0, 10)) : undefined;
    return { ...page, results: page.results.map((library) => evaluateLibrary(library, request, timeline)), request, timeZone: 'Australia/Perth' };
  }, [source.data, source.request, ranked]);
  return { ...source, data };
}

export function useLibraryDetail(slug: string, query: string, coordinates?: Coordinates | null, enabled = true) {
  const source = useCatalogueRequest(query, coordinates, enabled);
  const selection = useMemo((): { data: DetailResponse | null; error: Error | null } => {
    if (!source.data || !source.request) return { data: null, error: null };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return { data: null, error: new LibraryApiError(400, 'Invalid library address.', 'slug') };
    const library = source.data.libraries.find((record) => record.slug === slug);
    return library ? { data: { result: evaluateLibrary(library, source.request), request: source.request, timeZone: 'Australia/Perth' }, error: null }
      : { data: null, error: new LibraryApiError(404, 'This library is not available.') };
  }, [source.data, source.request, slug]);
  return { ...source, ...selection, error: selection.error ?? source.error };
}

export function useSavedLibraries(ids: readonly string[], query: string, coordinates?: Coordinates | null, enabled = true) {
  const source = useCatalogueRequest(query, coordinates, enabled);
  const key = ids.join(',');
  const data = useMemo(() => {
    if (!source.data || !source.request) return null;
    const selected = new Set(key.split(','));
    const timeline = createCalendarTimelineReader(formatPerthTime(source.request.start).slice(0, 10));
    return { results: source.data.libraries.filter((library) => selected.has(library.id)).map((library) => evaluateLibrary(library, source.request!, timeline)) };
  }, [source.data, source.request, key]);
  return { ...source, data };
}
