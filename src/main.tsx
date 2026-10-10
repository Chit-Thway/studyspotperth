import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './app/App';
import { AccountProvider } from './features/account/AccountContext';
import { LocationProvider } from './features/location/LocationProvider';
import { FinderPaginationProvider } from './features/finder/FinderPaginationProvider';
import { CatalogueProvider } from './features/libraries/CatalogueProvider';
import './app/tokens.css';
import './app/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

// A data router supplies the blocker used to protect unsaved admin edits.
const router = createBrowserRouter([{ path: '*', element: <AccountProvider><LocationProvider><CatalogueProvider><FinderPaginationProvider><App /></FinderPaginationProvider></CatalogueProvider></LocationProvider></AccountProvider> }]);

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
