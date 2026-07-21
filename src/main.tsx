import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/overlays.css';
import './styles/components.css';
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
