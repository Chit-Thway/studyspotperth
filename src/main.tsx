import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AccountProvider } from './features/account/AccountContext';
import './app/tokens.css';
import './app/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AccountProvider><App /></AccountProvider>
    </BrowserRouter>
  </StrictMode>,
);
