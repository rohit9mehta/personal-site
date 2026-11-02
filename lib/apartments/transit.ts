// Door-to-door commute times by subway and on foot — no buses.
//
// The subway is modelled from the MTA's published timetable (see
// scripts/apartments/build-subway.ts): each line's typical running time between
// stops and how often it comes, for a weekday rush hour and a weekend afternoon.
// A trip is: walk to a station, wait for the train (half the gap between trains),
// ride, maybe transfer (walk + wait again), get off, walk to the door.
//
// Shared by the site (answers are computed in your browser, so the addresses you
// commute to never leave it) and the tests.

export interface LatLng {
  lat: number;
  lng: number;
}

export type ProfileId = 'weekday' | 'weekend';

export const PROFILES: Record<ProfileId, string> = {
  weekday: 'Weekday rush hour',
  weekend: 'Evenings & weekends',
};

export interface SubwayProfile {
  /** Seconds between trains for each node; 0 where the line doesn't run in this period. */
  headway: number[];
  /** Flat triples: from node, to node, seconds of riding. */
  rides: number[];
}

export interface SubwayGraph {
  /** MTA feed version the graph was built from. */
  feed: string;
  /** name, lat, lng — index is the station id used everywhere else. */
  stations: [string, number, number][];
  /** route id → [bullet label, background color, text color]. */
  routes: Record<string, [string, string, string]>;
  /** A line stopping at a station in one direction: [station, route id, direction 0|1]. */
  nodes: [number, string, number][];
  profiles: Record<ProfileId, SubwayProfile>;
  /** Flat triples: station, station, seconds — walking between connected stations. */
  transfers: number[];
}

// --- Walking -----------------------------------------------------------------

/** About 3 mph, the pace map apps assume. */
export const WALK_METERS_PER_SECOND = 1.33;
/** Street to platform. */
const ENTRY_SECONDS = 60;
/** Platform to street (or to another platform). */
const EXIT_SECONDS = 60;
/** Stations farther than this (walking) aren't worth trying. */
const MAX_ACCESS_METERS = 1800;
/** Nobody waits longer than this on average, even for a rare train. */
const MAX_WAIT_SECONDS = 600;

// Manhattan's street grid runs about 29° clockwise from true north, so a walk
// there is the sum of the avenue and street legs.
const GRID = (29 * Math.PI) / 180;
const COS_G = Math.cos(GRID);
const SIN_G = Math.sin(GRID);
const M_PER_DEG_LAT = 111_132;

/** Walking distance in meters: along the grid, never more than 1.35× straight-line. */
export function walkMeters(a: LatLng, b: LatLng): number {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dx = (b.lng - a.lng) * mPerDegLng;
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
  const straight = Math.hypot(dx, dy);
  const avenue = Math.abs(dx * SIN_G + dy * COS_G);
  const street = Math.abs(dx * COS_G - dy * SIN_G);
  return Math.min(avenue + street, straight * 1.35);
}

export function walkSeconds(a: LatLng, b: LatLng): number {
  return walkMeters(a, b) / WALK_METERS_PER_SECOND;
}

// --- Trips -------------------------------------------------------------------

export type Leg =
  | { kind: 'walk'; seconds: number; to: string }
  | { kind: 'wait'; seconds: number; route: string; station: string }
  | { kind: 'ride'; seconds: number; route: string; from: string; to: string; stops: number }
  | { kind: 'transfer'; seconds: number; from: string; to: string };

export interface Trip {
  /**
   * Door to door in whole minutes, leaving home in time for the train — how
   * Google Maps counts it. Waits at transfers are included.
   */
  minutes: number;
  /** Extra average wait for the first train if you just show up, whole minutes. */
  waitMinutes: number;
  /** The same trip on foot, whole minutes. */
  walkMinutes: number;
  mode: 'walk' | 'subway';
  legs: Leg[];
}

const toMinutes = (s: number) => Math.max(1, Math.round(s / 60));

/** Every station's best time to one destination, solved once and reused for every listing. */
export class Destination {
  private readonly router: SubwayRouter;
  readonly point: LatLng;
  private readonly dist: Float64Array;
  private readonly next: Int32Array;
  private readonly via: Uint8Array;

  constructor(router: SubwayRouter, point: LatLng, dist: Float64Array, next: Int32Array, via: Uint8Array) {
    this.router = router;
    this.point = point;
    this.dist = dist;
    this.next = next;
    this.via = via;
  }

  trip(from: LatLng): Trip {
    const direct = walkSeconds(from, this.point);
    const walkMinutes = toMinutes(direct);
    const walk: Trip = {
      minutes: walkMinutes,
      waitMinutes: 0,
      walkMinutes,
      mode: 'walk',
      legs: [{ kind: 'walk', seconds: direct, to: '' }],
    };
    const { stations } = this.router.graph;
    let best = direct;
    let bestWait = 0;
    let start = -1;
    for (let s = 0; s < stations.length; s++) {
      const [, lat, lng] = stations[s]!;
      const meters = walkMeters(from, { lat, lng });
      if (meters > MAX_ACCESS_METERS) continue;
      const wait = this.firstWait(s);
      const planned = meters / WALK_METERS_PER_SECOND + ENTRY_SECONDS + this.dist[s]! - wait;
      if (planned < best) {
        best = planned;
        bestWait = wait;
        start = s;
      }
    }
    if (start < 0) return walk;
    const legs = this.legsFrom(from, start);
    // Only call it a subway trip if a train is actually involved.
    if (!legs.some((l) => l.kind === 'ride')) return walk;
    return {
      minutes: toMinutes(best),
      waitMinutes: Math.round(bestWait / 60),
      walkMinutes,
      mode: 'subway',
      legs,
    };
  }

  /** The wait for the first train on the best path from station `s`. */
  private firstWait(s: number): number {
    let v = s;
    for (let guard = 0; guard < 10 && v >= 0; guard++) {
      const u = this.next[v]!;
      if (u < 0) return 0;
      if (this.via[v] === VIA_BOARD) return this.dist[v]! - this.dist[u]!;
      if (this.via[v] !== VIA_TRANSFER) return 0;
      v = u;
    }
    return 0;
  }

  private legsFrom(from: LatLng, start: number): Leg[] {
    const { graph } = this.router;
    const S = graph.stations.length;
    const name = (s: number) => graph.stations[s]![0];
    const [, sLat, sLng] = graph.stations[start]!;
    const legs: Leg[] = [
      { kind: 'walk', seconds: walkSeconds(from, { lat: sLat, lng: sLng }) + ENTRY_SECONDS, to: name(start) },
    ];
    // Platform-to-street time is added to whatever comes after getting off.
    let carry = 0;
    const push = (leg: Leg) => {
      leg.seconds += carry;
      carry = 0;
      legs.push(leg);
    };
    let v = start;
    let guard = 0;
    while (v >= 0 && guard++ < 500) {
      const u = this.next[v]!;
      const how = this.via[v]!;
      if (u < 0) {
        // Exit here and walk.
        const [, lat, lng] = graph.stations[v]!;
        push({ kind: 'walk', seconds: walkSeconds({ lat, lng }, this.point), to: '' });
        break;
      }
      const cost = this.dist[v]! - this.dist[u]!;
      if (how === VIA_BOARD) {
        const [station, route] = graph.nodes[u - S]!;
        push({ kind: 'wait', seconds: cost, route, station: name(station) });
      } else if (how === VIA_RIDE) {
        const [fromStation, route] = graph.nodes[v - S]!;
        const [toStation] = graph.nodes[u - S]!;
        const last = legs.at(-1);
        if (last?.kind === 'ride' && last.route === route) {
          last.seconds += cost;
          last.stops += 1;
          last.to = name(toStation);
        } else {
          push({ kind: 'ride', seconds: cost, route, from: name(fromStation), to: name(toStation), stops: 1 });
        }
      } else if (how === VIA_ALIGHT) {
        carry += cost;
      } else if (how === VIA_TRANSFER) {
        push({ kind: 'transfer', seconds: cost, from: name(v), to: name(u) });
      }
      v = u;
    }
    return legs;
  }
}

const VIA_BOARD = 1;
const VIA_RIDE = 2;
const VIA_ALIGHT = 3;
const VIA_TRANSFER = 4;

interface Edge {
  to: number;
  cost: number;
  via: number;
}

/** A tiny binary heap of [priority, vertex]. */
class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): [number, number] {
    const { keys, vals } = this;
    const top: [number, number] = [keys[0]!, vals[0]!];
    const k = keys.pop()!;
    const v = vals.pop()!;
    const n = keys.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= k) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }
}

export class SubwayRouter {
  /** Per profile: for each vertex, the edges arriving at it (we search backwards from the destination). */
  private readonly incoming = new Map<ProfileId, Edge[][]>();
  readonly graph: SubwayGraph;

  constructor(graph: SubwayGraph) {
    this.graph = graph;
  }

  private edgesFor(profile: ProfileId): Edge[][] {
    const cached = this.incoming.get(profile);
    if (cached) return cached;
    const { stations, nodes, transfers } = this.graph;
    const { headway, rides } = this.graph.profiles[profile];
    const S = stations.length;
    const incoming: Edge[][] = Array.from({ length: S + nodes.length }, () => []);
    // Vertices 0..S-1 are stations (street level); S+i is line i at its station.
    nodes.forEach(([station], i) => {
      const h = headway[i]!;
      if (!h) return;
      // board: station → node, costs the average wait
      incoming[S + i]!.push({ to: station, cost: Math.min(h / 2, MAX_WAIT_SECONDS), via: VIA_BOARD });
      // alight: node → station
      incoming[station]!.push({ to: S + i, cost: EXIT_SECONDS, via: VIA_ALIGHT });
    });
    for (let k = 0; k + 2 < rides.length; k += 3) {
      const [a, b, sec] = [rides[k]!, rides[k + 1]!, rides[k + 2]!];
      incoming[S + b]!.push({ to: S + a, cost: sec, via: VIA_RIDE });
    }
    for (let k = 0; k + 2 < transfers.length; k += 3) {
      const [a, b, sec] = [transfers[k]!, transfers[k + 1]!, transfers[k + 2]!];
      incoming[b]!.push({ to: a, cost: sec, via: VIA_TRANSFER });
    }
    this.incoming.set(profile, incoming);
    return incoming;
  }

  /** Solves the network once for everything heading to `point`. */
  towards(point: LatLng, profile: ProfileId = 'weekday'): Destination {
    const incoming = this.edgesFor(profile);
    const n = incoming.length;
    const dist = new Float64Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    const via = new Uint8Array(n);
    const heap = new Heap();
    this.graph.stations.forEach(([, lat, lng], s) => {
      const meters = walkMeters({ lat, lng }, point);
      if (meters > MAX_ACCESS_METERS) return;
      dist[s] = meters / WALK_METERS_PER_SECOND;
      heap.push(dist[s]!, s);
    });
    while (heap.size) {
      const [d, v] = heap.pop();
      if (d > dist[v]!) continue;
      for (const e of incoming[v]!) {
        const nd = d + e.cost;
        if (nd < dist[e.to]!) {
          dist[e.to] = nd;
          next[e.to] = v;
          via[e.to] = e.via;
          heap.push(nd, e.to);
        }
      }
    }
    return new Destination(this, point, dist, next, via);
  }
}

/** "6 to Bleecker St" style summary of the train part of a trip. */
export function describeTrip(trip: Trip, routes: SubwayGraph['routes']): string {
  if (trip.mode === 'walk') return 'Walk';
  const rides = trip.legs.filter((l) => l.kind === 'ride');
  return rides.map((r) => routes[r.route]?.[0] ?? r.route).join(' → ');
}
