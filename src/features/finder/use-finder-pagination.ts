import { useEffect } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import { locationHeader, type Coordinates } from '../../domain/location';
import { updateFinderParam } from './finder-state';
import { useFinderPaginationMemory } from './finder-pagination-context';

export function useFinderPagination(params: URLSearchParams, setParams: SetURLSearchParams, coordinates: Coordinates | null, ready = true) {
  const origin = locationHeader(coordinates) ?? params.get('suburb') ?? 'perth-cbd';
  const cards = [...new Set((params.get('cards') ?? '').split(',').filter(Boolean))].sort();
  const key = JSON.stringify([origin, cards]);
  const { lastKey, remember } = useFinderPaginationMemory();
  const changed = ready && lastKey !== null && lastKey !== key;
  useEffect(() => {
    if (!ready || lastKey === key) return;
    if (changed && params.has('offset')) {
      setParams((current) => updateFinderParam(current, 'offset', null), { replace: true });
    } else {
      // Keep the old context until its stale URL offset is gone. A brand-new
      // application has no previous context, so its deep-linked page is valid.
      remember(key);
    }
  }, [ready, lastKey, key, changed, params, setParams, remember]);
  // Use the first page immediately, including before effects synchronise the URL.
  return changed ? updateFinderParam(params, 'offset', null) : params;
}
