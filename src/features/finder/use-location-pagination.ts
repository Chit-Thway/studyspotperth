import { useEffect, useState } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import { locationHeader, type Coordinates } from '../../domain/location';
import { updateFinderParam } from './finder-state';

export function useLocationPagination(params: URLSearchParams, setParams: SetURLSearchParams, coordinates: Coordinates | null) {
  const origin = locationHeader(coordinates);
  const [pageOrigin, setPageOrigin] = useState(origin);
  const changed = pageOrigin !== origin;
  useEffect(() => {
    if (!changed) return;
    if (params.has('offset')) {
      setParams((current) => updateFinderParam(current, 'offset', null), { replace: true });
    } else {
      // Acknowledge the origin only after its stale URL offset is gone. Otherwise
      // a render between the state and router updates could request the old page.
      setPageOrigin(origin);
    }
  }, [changed, origin, params, setParams]);
  // Use the first page immediately, including before effects synchronise the URL.
  return changed ? updateFinderParam(params, 'offset', null) : params;
}
