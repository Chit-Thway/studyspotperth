import { Link, Route, Routes } from 'react-router-dom';
import { FinderPage } from '../features/finder/FinderPage';
import styles from './App.module.css';

function NotFound() {
  return (
    <section className={styles.intro} aria-labelledby="page-title">
      <p className={styles.eyebrow}>Page not found</p>
      <h1 id="page-title">Let’s head back.</h1>
      <p className={styles.description}>This page isn’t available.</p>
      <Link className={styles.returnLink} to="/">Back to libraries <span aria-hidden="true">→</span></Link>
    </section>
  );
}

export function App() {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <Link className={styles.brand} to="/" aria-label="StudySpot Perth home">
          <svg className={styles.brandIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14" />
          </svg>
          StudySpot Perth
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <Link className={styles.libraryLink} to="/">Libraries</Link>
          <div className={styles.accountControls} aria-describedby="account-note">
            <button className={styles.saved} type="button" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
              Saved
            </button>
            <button className={styles.signIn} type="button" disabled>Sign in</button>
          </div>
        </nav>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        <Routes><Route path="/" element={<FinderPage />} /><Route path="*" element={<NotFound />} /></Routes>
      </main>
      <footer className={styles.footer} id="account-note">Free to browse. Saved libraries and accounts are coming later.</footer>
    </div>
  );
}
