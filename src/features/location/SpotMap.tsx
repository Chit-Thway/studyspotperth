import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinates } from '../../domain/location';
import type { LibrarySearchResult } from '../../domain/library-search';
import { DEFAULT_ORIGIN } from '../../domain/search-request';
import styles from './Map.module.css';

interface Props {
  origin?: Coordinates | null;
  customOrigin?: boolean;
  results?: LibrarySearchResult[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onPick?: (point: Coordinates) => void;
}
const personMarker = '<svg viewBox="0 0 24 32" aria-hidden="true"><circle cx="12" cy="5" r="3.5"/><path d="M8 10h8a2 2 0 0 1 2 1.5l2 7-3 1-2-5v14h-3v-8 8H9V14.5l-2 5-3-1 2-7A2 2 0 0 1 8 10Z"/></svg>';

export default function SpotMap({ origin, customOrigin, results, selectedId, onSelect, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [tileError, setTileError] = useState(false);
  const callbacks = useRef({ onSelect, onPick });
  useEffect(() => { callbacks.current = { onSelect, onPick }; }, [onSelect, onPick]);
  const picking = Boolean(onPick);
  const showPerson = picking || customOrigin;
  const latitude = origin?.latitude;
  const longitude = origin?.longitude;
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: false, scrollWheelZoom: true }).setView([DEFAULT_ORIGIN.latitude, DEFAULT_ORIGIN.longitude], 11);
    map.current = instance;
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => setTileError(true)).on('tileload', () => setTileError(false)).addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => callbacks.current.onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance || latitude === undefined || longitude === undefined) return;
    instance.setView([latitude, longitude], 12);
    const marker = L.marker([latitude, longitude], {
      icon: L.divIcon(showPerson
        ? { className: styles.personMarker, html: personMarker, iconSize: [24, 32], iconAnchor: [12, 29] }
        : { className: styles.originMarker, html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
      title: 'Search location', draggable: picking,
    }).addTo(instance);
    marker.on('dragend', () => { const point = marker.getLatLng(); callbacks.current.onPick?.({ latitude: point.lat, longitude: point.lng }); });
    return () => { marker.remove(); };
  }, [latitude, longitude, picking, showPerson]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !results) return;
    const markers = L.layerGroup().addTo(instance);
    for (const result of results) {
      const { latitude, longitude, name } = result.library.content;
      if (latitude === null || longitude === null) continue;
      const status = result.opening.status;
      const marker = L.marker([latitude, longitude], {
        icon: L.divIcon({ className: `${styles.libraryMarker} ${styles[status]} ${selectedId === result.library.id ? styles.selected : ''}`, html: '<span aria-hidden="true"></span>', iconSize: [34, 38], iconAnchor: [17, 38] }),
        title: `${name} · ${status === 'unknown' ? 'Hours unknown' : status}`, riseOnHover: true,
        zIndexOffset: selectedId === result.library.id ? 1000 : 0,
      });
      const label = document.createElement('span');
      label.textContent = name;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -35] });
      marker.on('click', () => callbacks.current.onSelect?.(result.library.id));
      marker.addTo(markers);
      marker.getElement()?.setAttribute('aria-label', `${name} · ${status === 'unknown' ? 'Hours unknown' : status}`);
    }
    return () => { markers.remove(); };
  }, [results, selectedId]);
  const fit = () => {
    const points: L.LatLngTuple[] = (results ?? []).flatMap(({ library }) => library.content.latitude !== null && library.content.longitude !== null ? [[library.content.latitude, library.content.longitude] as L.LatLngTuple] : []);
    if (origin) points.push([origin.latitude, origin.longitude]);
    if (points.length) map.current?.fitBounds(points, { padding: [45, 45], maxZoom: 14 });
  };
  return <div className={styles.mapFrame}>
    <div ref={container} className={styles.mapCanvas} aria-label={picking ? 'Choose a location on the map' : 'Library map'} />
    {results && <button className={styles.fitButton} type="button" onClick={fit}>Show all libraries</button>}
    {picking && <div className={styles.mapHint}>Click to place your pin · drag to explore</div>}
    {picking && <button type="button" className={styles.centreButton} onClick={() => { const point = map.current?.getCenter(); if (point) onPick?.({ latitude: point.lat, longitude: point.lng }); }}>Use map centre</button>}
    {tileError && <p className={styles.mapError} role="status">Map tiles couldn’t load. Check your connection.</p>}
  </div>;
}
