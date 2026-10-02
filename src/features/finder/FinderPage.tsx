import { useState } from 'react';
import styles from './FinderPage.module.css';

function FilterPanel() {
  return (
    <>
      <div className={styles.filterHeader}>
        <h2>Filters</h2>
        <button type="button" disabled>Clear all</button>
      </div>
      <p className={styles.filterNotice} id="filter-note">Filters will be available when library data is ready.</p>
      <fieldset className={styles.filterFields} disabled aria-describedby="filter-note">
        <legend className={styles.visuallyHidden}>Library search filters</legend>
        <div className={styles.filterSection}>
          <label className={styles.fieldLabel} htmlFor="location">Location</label>
          <select id="location" defaultValue="perth-cbd"><option value="perth-cbd">Perth CBD</option></select>
        </div>
        <div className={styles.filterSection}>
          <span className={styles.fieldLabel} id="when-label">When</span>
          <div className={styles.timeMode} role="group" aria-labelledby="when-label">
            <button className={styles.selectedMode} type="button" aria-pressed="true">Open now</button>
            <button type="button" aria-pressed="false">Choose a time</button>
          </div>
          <p className={styles.help}>Local time in Perth</p>
          <label className={styles.smallLabel} htmlFor="start-time">Start time</label>
          <select id="start-time" defaultValue="now"><option value="now">Now</option></select>
          <label className={styles.smallLabel} htmlFor="end-time">End time (optional)</label>
          <select id="end-time" defaultValue="none"><option value="none">No end time</option></select>
        </div>
        <div className={styles.filterSection}>
          <label className={styles.switchRow}>
            <input type="checkbox" role="switch" />
            <span className={styles.switchTrack} aria-hidden="true" />
            <span><strong>Open 24/7</strong><span className={styles.switchHelp}>All universities. Entry requirements shown.</span></span>
          </label>
        </div>
        <fieldset className={styles.filterSection}>
          <legend className={styles.fieldLabel}>Institution</legend>
          <p className={styles.help}>All institutions unless you select one.</p>
          {['Public libraries', 'UWA', 'Curtin', 'ECU', 'Murdoch'].map((institution) => (
            <label className={styles.checkboxRow} key={institution}><input type="checkbox" />{institution}</label>
          ))}
        </fieldset>
        <fieldset className={styles.filterSection}>
          <legend className={styles.fieldLabel}>Study environment</legend>
          <label className={styles.checkboxRow}><input type="checkbox" />Quiet study areas</label>
          <label className={styles.checkboxRow}><input type="checkbox" />Group study areas</label>
          <label className={styles.checkboxRow}><input type="checkbox" />Step-free access</label>
        </fieldset>
        <div className={styles.filterSection}>
          <label className={styles.switchRow}>
            <input type="checkbox" role="switch" />
            <span className={styles.switchTrack} aria-hidden="true" />
            <span><strong>Wi-Fi I can use</strong><span className={styles.switchHelp}>Public or eligible university networks.</span></span>
          </label>
        </div>
      </fieldset>
    </>
  );
}

export function FinderPage() {
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  return (
    <>
      <section className={styles.heading} aria-labelledby="page-title">
        <h1 id="page-title">Find your next study spot</h1>
        <p>Libraries near you, with the access details that matter.</p>
      </section>
      <div className={styles.finderLayout}>
        <button className={styles.filterToggle} type="button" aria-expanded={filtersExpanded} aria-controls="finder-filters" onClick={() => setFiltersExpanded(!filtersExpanded)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" />
          </svg>
          {filtersExpanded ? 'Hide filters' : 'Show filters'}<span aria-hidden="true">{filtersExpanded ? '−' : '+'}</span>
        </button>
        <aside id="finder-filters" className={`${styles.filters} ${filtersExpanded ? styles.filtersExpanded : ''}`} aria-label="Library filters">
          <FilterPanel />
        </aside>
        <section className={styles.results} aria-labelledby="results-title">
          <div className={styles.resultsHeader}>
            <h2 id="results-title">Libraries</h2>
            <label className={styles.sortLabel}>Sort by
              <select disabled defaultValue="nearest"><option value="nearest">Nearest first</option></select>
            </label>
          </div>
          <div className={styles.pendingData}>
            <div className={styles.bookMark} aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M24 12c-6-4-12-4-18-2v27c6-2 12-2 18 2 6-4 12-4 18-2V10c-6-2-12-2-18 2Zm0 0v27M11 17c3-.5 6 0 8 1M11 23c3-.5 6 0 8 1M29 18c2-1 5-1.5 8-1M29 24c2-1 5-1.5 8-1" />
              </svg>
            </div>
            <span className={styles.pendingLabel}>Library listings coming soon</span>
            <h3>Your next study spot will be here.</h3>
            <p>We’re preparing Perth library listings with opening hours, 24/7 access and clear entry requirements.</p>
            <p className={styles.pendingNote}>Search and filters will be available once the listings are ready.</p>
          </div>
        </section>
      </div>
    </>
  );
}
