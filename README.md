# romehta — personal site & One Sip

My personal site, and **One Sip**: a map of every coffee shop I've rated, out of ten.

- Site: https://rohit9mehta.github.io/personal-site/
- One Sip: https://rohit9mehta.github.io/personal-site/coffee/

## Logging a coffee

All the ratings live in one file: [`data/coffee.csv`](data/coffee.csv). Add a line, commit to `main`, and the site
updates itself in a couple of minutes. No coordinates, no addresses — just:

```csv
name,city,score,date,note
Sightglass Coffee,San Francisco,8.5,2026-10-21,
```

- `name`, `city`, `score` (0–10, decimals fine) are required. `date` (YYYY-MM-DD) and `note` are optional — leave
  them off entirely if you like: `Sightglass Coffee,San Francisco,8.5`
- If a value contains a comma, wrap it in double quotes: `"Coffee, Etc.","Portland, OR",7`
- Went back? Add another line with the same name and city. The newest line is the current score; the map shows the
  history.

**Three easy ways to make that commit:**

1. **On GitHub** (works on a phone): open [`data/coffee.csv`](data/coffee.csv), tap ✏️, add a line at the bottom,
   _Commit changes_.
2. **Fill in a form**: [Log a coffee](../../issues/new?template=log-coffee.yml) opens a three-field form; submitting
   it adds the line, commits, redeploys, and replies with a link to the new pin. (Only works for issues you open.)
   Bookmark it on your phone's home screen.
3. **Ask Claude**: "log Sightglass in San Francisco, 8.5" — see [CLAUDE.md](CLAUDE.md).

### What happens after you push

The [Deploy workflow](.github/workflows/deploy.yml) checks the CSV (a typo fails the run with the exact line and
problem), looks up any new café on OpenStreetMap, saves what it found to
[`data/places.json`](data/places.json), builds the site and publishes it to GitHub Pages. The run's summary page
lists each newly located café with a map link so you can sanity-check it.

### When a pin is in the wrong place

The lookup uses the café name and city. For chains, or cafés OpenStreetMap doesn't know, it may pick the wrong branch
or fall back to the city center (shown as a hollow pin, "approximate"). To fix one, find its entry in
`data/places.json` and either:

- add the street address and delete `lat`/`lng` — the next deploy re-locates it from the address:
  `"address": "66 Mint St"`; or
- set `lat`/`lng` yourself (right-click → "What's here?" in Google Maps) and `"source": "manual"`.

To re-try every approximate café (OpenStreetMap keeps improving), run the Deploy workflow by hand from the Actions tab
with **Retry cafés that are only placed at their city center** ticked.

## Developing

Needs Node 22.18+ (24 recommended).

```bash
npm install
npm run dev                              # http://localhost:5173/ and /coffee/
COFFEE_DATA=fixtures/sample npm run dev  # with made-up sample data
npm run check                            # typecheck + lint + tests
npm run validate                         # check data/coffee.csv
npm run enrich                           # locate new cafés (needs internet)
npm run build                            # static site in dist/
```

### How it's put together

- **Vite + React + TypeScript**, two pages: `/` (`index.html`, `src/home`) and `/coffee/` (`coffee/index.html`,
  `src/coffee`).
- **Data**: `lib/vite-plugin-coffee.ts` reads the CSV and places file at build time and hands the app a validated
  dataset (`virtual:coffee-data`), so the published site is fully static.
- **Map**: [MapLibre GL](https://maplibre.org/) with a custom paper-toned style (`src/coffee/map/style.ts`) on free
  [OpenFreeMap](https://openfreemap.org/) vector tiles; a bundled Natural Earth outline draws the world instantly.
  Pins are HTML markers clustered with supercluster (`src/coffee/map/markers.ts`).
- **Geocoding**: `lib/geocode.ts` — Nominatim, then Photon, checked against the city's location and the café's name.
  Results are cached in `data/places.json`, so each café is looked up once.
- Scores are colored on a single latte→espresso ramp (`src/coffee/score.ts`), checked for contrast against the map.

### One-time setup

GitHub Pages must be set to deploy from Actions: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. To use a custom domain, add it on that page; the build picks up the new base path automatically.

The 2021 version of this site (a React template) is kept in [`legacy/`](legacy) for reference.
