// Builds the subway network the commute calculator runs on, from the MTA's
// published timetable (GTFS). Run it when service changes (a few times a year):
//
//   node scripts/apartments/build-subway.ts              # downloads the feed
//   node scripts/apartments/build-subway.ts --dir gtfs/  # an already-unzipped feed
//
// Writes src/apartments/subway.json. For each line at each station it keeps how
// often trains come and how long they take to the next stop, in two periods:
// weekday rush hour and a weekend afternoon (a stand-in for evenings too).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseCsv } from '../../lib/csv.ts';
import type { ProfileId, SubwayGraph } from '../../lib/apartments/transit.ts';

const FEED_URL = 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip';
const OUT = resolve(import.meta.dirname, '../../src/apartments/subway.json');

interface Period {
  /** Which calendar day's service to use. */
  day: 'monday' | 'saturday';
  from: number;
  to: number;
}
const PERIODS: Record<ProfileId, Period> = {
  weekday: { day: 'monday', from: 7 * 3600, to: 10 * 3600 },
  weekend: { day: 'saturday', from: 10 * 3600, to: 20 * 3600 },
};

async function feedDir(): Promise<string> {
  const i = process.argv.indexOf('--dir');
  if (i > 0 && process.argv[i + 1]) return resolve(process.argv[i + 1]!);
  const dir = mkdtempSync(join(tmpdir(), 'gtfs-'));
  console.log(`Downloading ${FEED_URL}…`);
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`${FEED_URL}: HTTP ${res.status}`);
  writeFileSync(join(dir, 'gtfs.zip'), Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-q', '-o', 'gtfs.zip'], { cwd: dir });
  return dir;
}

/** Reads a GTFS table into objects keyed by header. */
function table(dir: string, name: string): Record<string, string>[] {
  const records = parseCsv(readFileSync(join(dir, name), 'utf8'));
  const [header, ...rows] = records;
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.fields.map((h, i) => [h, r.fields[i] ?? ''])));
}

const seconds = (hms: string) => {
  const [h, m, s] = hms.split(':').map(Number);
  return h! * 3600 + m! * 60 + s!;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The 6X (express in the Bronx) is the same 6 train on the platform in Manhattan. */
const canonical = (routeId: string) => (/^[67F]X$/.test(routeId) ? routeId.slice(0, -1) : routeId);

/** The letter or number on the bullet. */
function bullet(routeId: string, shortName: string): string {
  if (/^(GS|FS|H)$/.test(routeId)) return 'S';
  if (routeId === 'SI') return 'SIR';
  return (shortName || routeId).replace(/X$/, '');
}

async function main() {
  const dir = await feedDir();
  const feed = table(dir, 'feed_info.txt')[0]?.feed_version ?? 'unknown';

  // Platforms ("127N") roll up to their station ("127").
  const parentOf = new Map<string, string>();
  const stationInfo = new Map<string, [string, number, number]>();
  for (const s of table(dir, 'stops.txt')) {
    if (s.location_type === '1') {
      stationInfo.set(s.stop_id!, [s.stop_name!, Number(s.stop_lat), Number(s.stop_lon)]);
    } else if (s.parent_station) {
      parentOf.set(s.stop_id!, s.parent_station);
    }
  }

  const routes: SubwayGraph['routes'] = {};
  for (const r of table(dir, 'routes.txt')) {
    if (canonical(r.route_id!) !== r.route_id) continue;
    const color = /^[0-9A-F]{6}$/i.test(r.route_color ?? '') ? r.route_color! : '808183';
    const text = /^[0-9A-F]{6}$/i.test(r.route_text_color ?? '') ? r.route_text_color! : 'FFFFFF';
    routes[r.route_id!] = [bullet(r.route_id!, r.route_short_name ?? ''), `#${color}`, `#${text}`];
  }

  const calendar = table(dir, 'calendar.txt');
  const services = (day: Period['day']) => new Set(calendar.filter((c) => c[day] === '1').map((c) => c.service_id!));

  const trips = new Map<string, { route: string; service: string; dir: number }>();
  for (const t of table(dir, 'trips.txt')) {
    trips.set(t.trip_id!, { route: canonical(t.route_id!), service: t.service_id!, dir: Number(t.direction_id) || 0 });
  }

  // stop_times is big and has no quoted fields: split it by hand.
  const stopTimes = new Map<string, { station: string; arr: number; dep: number; seq: number }[]>();
  const lines = readFileSync(join(dir, 'stop_times.txt'), 'utf8').split('\n');
  const head = lines[0]!.trim().split(',');
  const col = (name: string) => head.indexOf(name);
  const [cTrip, cStop, cArr, cDep, cSeq] = [
    col('trip_id'),
    col('stop_id'),
    col('arrival_time'),
    col('departure_time'),
    col('stop_sequence'),
  ];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const f = line.split(',');
    const stop = f[cStop]!;
    const station = parentOf.get(stop) ?? stop;
    if (!stationInfo.has(station)) continue;
    let list = stopTimes.get(f[cTrip]!);
    if (!list) stopTimes.set(f[cTrip]!, (list = []));
    list.push({ station, arr: seconds(f[cArr]!), dep: seconds(f[cDep]!), seq: Number(f[cSeq]) });
  }

  const nodeIndex = new Map<string, number>();
  const nodes: [string, string, number][] = [];
  const nodeOf = (station: string, route: string, dir: number) => {
    const key = `${station}|${route}|${dir}`;
    let i = nodeIndex.get(key);
    if (i === undefined) {
      i = nodes.length;
      nodeIndex.set(key, i);
      nodes.push([station, route, dir]);
    }
    return i;
  };

  const perProfile = {} as Record<ProfileId, { departures: Map<number, number>; rides: Map<string, number[]> }>;
  for (const [profile, period] of Object.entries(PERIODS) as [ProfileId, Period][]) {
    const active = services(period.day);
    const departures = new Map<number, number>();
    const rides = new Map<string, number[]>();
    for (const [tripId, times] of stopTimes) {
      const trip = trips.get(tripId);
      if (!trip || !active.has(trip.service)) continue;
      times.sort((a, b) => a.seq - b.seq);
      for (let k = 0; k < times.length; k++) {
        const here = times[k]!;
        if (here.dep < period.from || here.dep >= period.to) continue;
        const a = nodeOf(here.station, trip.route, trip.dir);
        departures.set(a, (departures.get(a) ?? 0) + 1);
        const there = times[k + 1];
        if (!there || there.station === here.station) continue;
        const b = nodeOf(there.station, trip.route, trip.dir);
        const key = `${a}>${b}`;
        let list = rides.get(key);
        if (!list) rides.set(key, (list = []));
        list.push(Math.max(30, there.arr - here.dep));
      }
    }
    perProfile[profile] = { departures, rides };
  }

  // Number the stations that trains actually stop at.
  const stationIds = [...new Set(nodes.map(([s]) => s))].sort();
  const stationIndex = new Map(stationIds.map((id, i) => [id, i]));

  const graph: SubwayGraph = {
    feed,
    stations: stationIds.map((id) => {
      const [name, lat, lng] = stationInfo.get(id)!;
      return [name, Number(lat.toFixed(5)), Number(lng.toFixed(5))];
    }),
    routes,
    nodes: nodes.map(([s, r, d]) => [stationIndex.get(s)!, r, d]),
    profiles: {} as SubwayGraph['profiles'],
    transfers: [],
  };

  for (const [profile, period] of Object.entries(PERIODS) as [ProfileId, Period][]) {
    const { departures, rides } = perProfile[profile];
    const span = period.to - period.from;
    graph.profiles[profile] = {
      headway: nodes.map((_, i) => {
        const n = departures.get(i) ?? 0;
        return n ? Math.round(span / n) : 0;
      }),
      rides: [...rides].flatMap(([key, secs]) => {
        const [a, b] = key.split('>').map(Number);
        return [a!, b!, Math.round(median(secs))];
      }),
    };
  }

  for (const t of table(dir, 'transfers.txt')) {
    const a = stationIndex.get(t.from_stop_id!);
    const b = stationIndex.get(t.to_stop_id!);
    if (a === undefined || b === undefined || a === b) continue;
    graph.transfers.push(a, b, Number(t.min_transfer_time) || 180);
  }

  writeFileSync(OUT, JSON.stringify(graph) + '\n');
  const kb = (JSON.stringify(graph).length / 1024).toFixed(0);
  console.log(
    `Wrote ${OUT}: ${graph.stations.length} stations, ${nodes.length} line stops, ` +
      `${graph.transfers.length / 3} transfers, ${kb} KB (feed ${feed}).`,
  );
}

await main();
