import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/overlays.css';
import './styles/app-shell.css';
import './styles/app-header.css';
import './styles/compare-toast.css';
import './styles/diff-action-popover.css';
import './styles/diff-map.css';
import './styles/diff-navigator.css';
import './styles/document-pane.css';
import './styles/review-modals.css';
import './styles/mobile-pane.css';
import './styles/similar-diff.css';
import './styles/react.css';
import App from './App';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
