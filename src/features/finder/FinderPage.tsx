import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isInstitution } from '../../domain/search-request';
import { preserveProfileDefaults, profileFinderParams } from '../../domain/account';
import { useAccount } from '../account/use-account';
import { Icon } from '../libraries/Icon';
import { LibraryCard } from '../libraries/LibraryCard';
import { INSTITUTION_LABELS, UNIVERSITY_CARDS, readableDate } from '../libraries/presentation';
import { LibraryApiError, type SearchResponse } from '../libraries/api';
import { useLibrarySearch } from '../libraries/use-catalogue-search';
import { FilterPanel } from './FilterPanel';
import { finderRequestParams, resetFinderFilters, toggleFinderSelection, updateFinderParam } from './finder-state';
import styles from './FinderPage.module.css';
import { useUserLocation } from '../location/use-location';
import { useFinderPagination } from './use-finder-pagination';
import { isLibrarySize, LIBRARY_SIZE_LABELS } from '../../domain/library-size';

export function FinderPage() {
  const [rawParams, setParams] = useSearchParams();
  const { account, loading: accountLoading } = useAccount();
  const location = useUserLocation();
  const effective = profileFinderParams(rawParams, account?.preferences);
  const params = useFinderPagination(effective, setParams, location.coordinates,
    location.ready && (!accountLoading || Boolean(account) || rawParams.has('cards')));
  const resource = useLibrarySearch(finderRequestParams(params).toString(), location.coordinates, location.ready);
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cards = (params.get('cards') ?? '').split(',').filter(Boolean);
  const result = resource.data;
  const change = (next: URLSearchParams) => setParams(preserveProfileDefaults(rawParams, params, next));
  const closeDrawer = () => { dialog.current?.close(); setDrawerOpen(false); filterButton.current?.focus(); };
  useEffect(() => { document.title = 'Find a library · StudySpot Perth'; }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 48.001rem)');
    const closeOnDesktop = () => { if (media.matches) { dialog.current?.close(); setDrawerOpen(false); } };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);
  const chips: { key: string; label: string; remove: () => void }[] = [];
  (params.get('institutions') ?? '').split(',').filter(isInstitution).forEach((institution) => chips.push({ key: institution, label: INSTITUTION_LABELS[institution], remove: () => change(toggleFinderSelection(params, 'institutions', institution)) }));
  (params.get('sizes') ?? '').split(',').filter(isLibrarySize).forEach((size) => chips.push({ key: `size-${size}`, label: `${LIBRARY_SIZE_LABELS[size]} libraries`, remove: () => change(toggleFinderSelection(params, 'sizes', size)) }));
  ([['publicAccess', 'Public access'], ['openNow', 'Open now'], ['open24Hours', 'Open 24/7'], ['usableWifi', 'Wi-Fi I can use'], ['quietStudy', 'Quiet areas'], ['groupStudy', 'Group spaces'], ['wheelchairAccess', 'Step-free access']] as const).forEach(([field, label]) => {
    if (params.get(field) === 'true') chips.push({ key: field, label, remove: () => change(updateFinderParam(params, field, null)) });
  });
  if (params.get('start') && !Number.isNaN(Date.parse(`${params.get('start')}:00+08:00`))) chips.push({ key: 'start', label: `${readableDate(params.get('start')!.slice(0, 10))} · ${params.get('start')!.slice(11)}`, remove: () => change(updateFinderParam(params, 'start', null)) });
  return <>
    <section className={styles.heading} aria-labelledby="page-title"><h1 id="page-title">Find your next study spot</h1><p>Libraries near you, with the access details that matter.</p></section>
    <section className={styles.guestCards} aria-labelledby="guest-cards-title">
      <div className={styles.guestSummary}><div><h2 id="guest-cards-title">My university cards</h2><p>{cards.length ? cards.filter(isInstitution).map((card) => INSTITUTION_LABELS[card]).join(', ') : 'Optional'}</p></div>
        <button type="button" aria-expanded={cardsExpanded} aria-controls="guest-card-options" onClick={() => setCardsExpanded(!cardsExpanded)}>{cardsExpanded ? 'Done' : cards.length ? 'Change cards' : 'Add cards'} <span aria-hidden="true">{cardsExpanded ? '−' : '+'}</span></button>
      </div>
      {cardsExpanded && <fieldset id="guest-card-options" className={styles.cardOptions}><legend>Cards I have</legend>
        {UNIVERSITY_CARDS.map((card) => <label key={card}><input type="checkbox" checked={cards.includes(card)} onChange={() => change(toggleFinderSelection(params, 'cards', card))} />{INSTITUTION_LABELS[card]}</label>)}
      </fieldset>}
    </section>
    {chips.length > 0 && <div className={styles.activeFilters} aria-label="Active filters">{chips.map((chip) => <button type="button" key={chip.key} onClick={chip.remove} aria-label={`Remove ${chip.label} filter`}>{chip.label}<Icon name="close" /></button>)}<button type="button" className={styles.clearFilters} onClick={() => change(resetFinderFilters(params))}>Clear filters</button></div>}
    <div className={styles.finderLayout}>
      <button ref={filterButton} className={styles.filterToggle} type="button" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => { dialog.current?.showModal(); setDrawerOpen(true); }}><Icon name="filter" />Filters{chips.length > 0 && <span>{chips.length} active</span>}</button>
      <aside className={styles.filters} aria-label="Library filters"><FilterPanel params={params} change={change} prefix="desktop" /></aside>
      <dialog ref={dialog} className={styles.filterDialog} aria-labelledby="drawer-title" onCancel={closeDrawer} onClose={() => setDrawerOpen(false)} onClick={(event) => { if (event.target === dialog.current) closeDrawer(); }}>
        <div className={styles.drawerBody}><div className={styles.drawerHeading}><h2 id="drawer-title">Find your study spot</h2><button type="button" autoFocus onClick={closeDrawer} aria-label="Close filters"><Icon name="close" /></button></div>
          <FilterPanel params={params} change={change} prefix="mobile" />
          <div className={styles.drawerFooter}><button className={styles.applyButton} type="button" onClick={closeDrawer}>Show results</button></div>
        </div>
      </dialog>
      <section className={styles.results} aria-labelledby="results-title" aria-busy={resource.loading}>
        <div className={styles.resultsHeader}><h2 id="results-title">{result ? `${result.total} ${result.total === 1 ? 'library' : 'libraries'}` : 'Libraries'}</h2><p><Icon name="pin" />{params.get('publicAccess') === 'true' ? 'Nearest first' : 'Recommended · nearest first'}</p></div>
        <p className={styles.resultsContext}>{location.coordinates ? 'Near your location · ' : ''}Perth time</p>
        {resource.loading && <div className={styles.statePanel} role="status"><Icon name="book" /><h3>Finding your study spots…</h3><p>Checking opening hours and entry information.</p></div>}
        {resource.error && result && <p className={styles.originNotice} role="alert">Couldn’t refresh these libraries. Showing the last checked information; current hours may have changed. <button className={styles.textButton} type="button" onClick={resource.retry}>Try again</button></p>}
        {resource.error && !result && <div className={styles.statePanel} role="alert"><Icon name="book" /><h3>{resource.error instanceof LibraryApiError && resource.error.status === 400 ? 'Check your search' : 'Libraries couldn’t load'}</h3><p>{resource.error.message}</p>
          {resource.error instanceof LibraryApiError && resource.error.status === 400 ? <button type="button" className={styles.applyButton} onClick={() => change(resource.error instanceof LibraryApiError && resource.error.field === 'query' ? new URLSearchParams() : resource.error instanceof LibraryApiError && resource.error.field ? updateFinderParam(params, resource.error.field, null) : resetFinderFilters(params))}>Remove invalid selection</button> : <button type="button" className={styles.applyButton} onClick={resource.retry}>Try again</button>}</div>}
        {result && result.results.length === 0 && <div className={styles.statePanel} role="status"><div className={styles.bookMark}><Icon name="book" /></div><span className={styles.pendingLabel}>No matching libraries</span><h3>Let’s find another study window.</h3><p>{result.emptyReason}</p><button type="button" className={styles.applyButton} onClick={() => change(resetFinderFilters(params))}>Clear filters</button><p className={styles.emptyNote}>Only published library information appears here.</p></div>}
        {result && result.results.length > 0 && <>
          <ResultsPagination result={result} changePage={(offset) => change(updateFinderParam(params, 'offset', offset.toString()))} position="top" />
          <div className={styles.cardGrid}>{result.results.map((item) => <LibraryCard key={item.library.id} result={item} params={rawParams} />)}</div>
          <ResultsPagination result={result} changePage={(offset) => change(updateFinderParam(params, 'offset', offset.toString()))} position="bottom" />
        </>}
      </section>
    </div>
  </>;
}

function ResultsPagination({ result, changePage, position }: { result: SearchResponse; changePage: (offset: number) => void; position: 'top' | 'bottom' }) {
  return <nav className={`${styles.pagination} ${position === 'top' ? styles.paginationTop : ''}`} aria-label={`Results pages (${position})`}>
    {result.offset > 0 && <button type="button" onClick={() => changePage(Math.max(0, result.offset - result.limit))}>Previous</button>}
    <p role={position === 'bottom' ? 'status' : undefined}>Showing {result.offset + 1}–{result.offset + result.results.length} of {result.total}</p>
    {result.nextOffset !== null && <button type="button" onClick={() => changePage(result.nextOffset!)}>Next</button>}
  </nav>;
}
