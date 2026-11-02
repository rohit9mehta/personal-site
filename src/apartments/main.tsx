import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/newsreader/opsz.css';
import '../shared/base.css';
import './apartments.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
