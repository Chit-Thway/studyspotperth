import { useEffect, useRef } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { FinderPage } from '../features/finder/FinderPage';
import { LibraryDetailPage } from '../features/libraries/LibraryDetailPage';
import { AccountNavigation } from '../features/account/AccountNavigation';
import { SignInPage } from '../features/account/SignInPage';
import { ProfilePage } from '../features/account/ProfilePage';
import { SavedPage } from '../features/account/SavedPage';
import { internalReturnTo } from '../domain/account';
import { withoutEndTime } from '../domain/search-request';
import { finderUrl } from '../features/finder/finder-state';
import { AdminDashboard, AdminNewPage, AdminEditPage } from '../features/admin/AdminPages';
import { CookieConsent } from '../features/privacy/CookieConsent';
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
  const location = useLocation();
  const navigate = useNavigate();
  const previousPath = useRef(location.pathname);
  const main = useRef<HTMLElement>(null);
  const query = location.pathname === '/sign-in' ? new URL(internalReturnTo(new URLSearchParams(location.search).get('returnTo')), window.location.origin).search : location.search;
  const finder = finderUrl(new URLSearchParams(query));
  useEffect(() => {
    if (!['/', '/saved', '/profile', '/sign-in'].includes(location.pathname) && !location.pathname.startsWith('/libraries/')) return;
    const current = new URLSearchParams(location.search);
    const next = withoutEndTime(current);
    if (location.pathname === '/sign-in' && current.has('returnTo')) next.set('returnTo', internalReturnTo(current.get('returnTo')));
    if (next.toString() !== current.toString()) {
      void navigate({ pathname: location.pathname, search: next.toString() ? `?${next}` : '', hash: location.hash }, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      main.current?.focus();
      window.scrollTo(0, 0);
      previousPath.current = location.pathname;
    }
  }, [location.pathname]);
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <Link className={styles.brand} to={finder} aria-label="StudySpot Perth home">
          <svg className={styles.brandIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14" />
          </svg>
          StudySpot Perth
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <Link className={styles.libraryLink} to={finder}>Libraries</Link>
          <AccountNavigation />
        </nav>
      </header>
      <main ref={main} id="main" className={styles.main} tabIndex={-1}>
        <Routes><Route path="/" element={<FinderPage />} /><Route path="/libraries/:slug" element={<LibraryDetailPage />} /><Route path="/sign-in" element={<SignInPage />} /><Route path="/profile" element={<ProfilePage />} /><Route path="/saved" element={<SavedPage />} /><Route path="/admin" element={<AdminDashboard />} /><Route path="/admin/libraries/new" element={<AdminNewPage />} /><Route path="/admin/libraries/:id" element={<AdminEditPage />} /><Route path="*" element={<NotFound />} /></Routes>
      </main>
      <footer className={styles.footer}>StudySpot Perth · Free to browse<CookieConsent /><span className={styles.mapCredit}>Some location data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors · ODbL</a></span></footer>
    </div>
  );
}
