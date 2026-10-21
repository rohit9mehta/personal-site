import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '../shared/base.css';
import './coffee.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import dataset from 'virtual:coffee-data';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App dataset={dataset} />
  </StrictMode>,
);
