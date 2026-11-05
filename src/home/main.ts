import '@fontsource-variable/instrument-sans/wdth.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/jetbrains-mono';
import '../shared/base.css';
import './home.css';
import { setupArtboard } from './artboard.ts';
import { setupBrew } from './brew.ts';
import { startClocks } from './clocks.ts';

const brew = document.getElementById('brew');
if (brew instanceof HTMLButtonElement) setupBrew(brew);

const hero = document.getElementById('hero');
if (hero) setupArtboard(hero);

const clocks = document.getElementById('clocks');
if (clocks) startClocks(clocks);
