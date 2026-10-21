# Notes for Claude

Rohit's personal site plus **One Sip**, a map of coffee shops he has rated out of 10. See README.md for the full
picture.

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
