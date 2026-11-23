import '@fontsource-variable/instrument-sans/wdth.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource-variable/jetbrains-mono';
import '../shared/base.css';
import './home.css';
import { setupBrew } from './brew.ts';
import { startClocks } from './clocks.ts';
import { setupName } from './name.ts';

const brew = document.getElementById('brew');
if (brew instanceof HTMLButtonElement) setupBrew(brew);

const name = document.getElementById('name');
const mark = document.getElementById('mark');
const top = document.getElementById('top');
if (name && mark && top) setupName(name, mark, top);

const clocks = document.getElementById('clocks');
if (clocks) startClocks(clocks);
