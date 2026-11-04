# Notes for Claude

Rohit's personal site plus **One Sip**, a map of coffee shops he has rated out of 10, and **Shortlist**
(`/apartments/`), his apartment hunt. See README.md for the full picture.

## Logging a coffee (the most common request)

"Log X in Y, 8.5" means: append one line to `data/coffee.csv` and push to `main`.

- Columns: `name,city,score,date,note`. Use today's date (YYYY-MM-DD) unless told otherwise; leave `note` empty
  unless he gave one. Quote any value containing a comma.
- Use the café's real, properly capitalized name (look it up if unsure) and the city as a plain name ("San
  Francisco", not "SF"). If he's rating a place already in the file, keep the exact same name and city spelling so
  it counts as a revisit — don't edit the old line.
- Run `npm run validate` before committing. Commit message: `Log <name> (<city>): <score>`.
- Don't add coordinates: the Deploy workflow geocodes new cafés and commits `data/places.json` itself. If you know
  which branch of a chain it was, you may add `{"name", "city", "address"}` for its key in `data/places.json`
  (key = `placeKey(name, city)` from `lib/dataset.ts`, e.g. `blue-bottle-coffee--san-francisco`).

## Working on the code

- `npm run check` (tsc, eslint, vitest) and `npm run build` must pass. Format with `npx prettier --write`.
- Scripts run on Node's built-in TypeScript support: erasable syntax only (no enums/namespaces), `.ts` import
  extensions.
- The sandbox usually can't reach map tiles or geocoders; `node scripts/dev/screenshot.ts` still renders the
  bundled world outline and pins. `COFFEE_DATA=fixtures/sample` swaps in sample data.
- Data flow: `data/coffee.csv` + `data/places.json` → `lib/dataset.ts` (`buildDataset`) → `virtual:coffee-data`.
- `scripts/dev/import-sheet.ts` converts rows pasted from the original Google Sheet into `data/coffee.csv`.

## Homepage

- Plain TypeScript in `src/home` (no React), styles in `src/home/home.css` with its own `--k-*` tokens for both themes
  (`[data-brew='chai'|'coffee']` plus the system setting). Keep it to the existing palette and the four typefaces.
- The intro in `index.html` (comment `INTRO`) is Rohit's to write. Don't write it for him; when he sends the text, put it
  in and drop the `is-draft` class and the "draft" note.
- `public/og-home.png` is a 1200×630 render of the hero; re-render it if the hero changes a lot.

## Shortlist (apartments)

- Listings arrive only through StreetEasy's own saved-search alert emails (Gmail → `apps-script/streeteasy-relay.gs` →
  `repository_dispatch` → `scripts/apartments/scan.ts`). Don't add scraping of StreetEasy or Openigloo: both block
  automated access.
- Never commit his personal addresses (office, partner's place) or settings: they live in the browser only. Sample
  places in dev scripts are public landmarks.
- Scan output is `scan.json` on the `apartments-data` branch (written by the workflow; never merge it into `main`).
- Logic shared by the scan and the page is in `lib/apartments/` (tests next to it); the alert email fixtures are real
  2023 StreetEasy emails with personal details removed.
- `node scripts/apartments/check.ts "<address>"` shows what the city has on a building (needs internet; the sandbox
  usually can't reach NYC Open Data, so verify with the workflow's address input instead).
