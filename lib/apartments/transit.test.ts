import { describe, expect, it } from 'vitest';
import subway from '../../src/apartments/subway.json';
import { SubwayRouter, describeTrip, walkMeters, type SubwayGraph } from './transit.ts';

const graph = subway as unknown as SubwayGraph;
const router = new SubwayRouter(graph);

const COOPER_UNION = { lat: 40.729, lng: -73.9905 }; // Astor Place
const KIPS_BAY = { lat: 40.7436, lng: -73.9801 }; // 3rd Ave & E 30th St
const BRYANT_PARK = { lat: 40.7536, lng: -73.9832 };
const CHELSEA = { lat: 40.7437, lng: -74.0005 }; // W 20th & 8th Ave
const TOTTENVILLE = { lat: 40.5122, lng: -74.2512 }; // far end of Staten Island

describe('walkMeters', () => {
  it('follows the avenues exactly when walking straight up one', () => {
    // Ten blocks up 5th Avenue (along the grid): grid distance = straight line.
    const a = { lat: 40.7359, lng: -73.9911 };
    const mPerDegLng = 111_132 * Math.cos((40.74 * Math.PI) / 180);
    const up = 800;
    const b = {
      lat: a.lat + (up * Math.cos((29 * Math.PI) / 180)) / 111_132,
      lng: a.lng + (up * Math.sin((29 * Math.PI) / 180)) / mPerDegLng,
    };
    expect(walkMeters(a, b)).toBeCloseTo(up, -1);
  });

  it('charges extra for going across the grid, but never more than 1.35×', () => {
    const straight = Math.hypot(
      (CHELSEA.lng - KIPS_BAY.lng) * 111_132 * Math.cos((40.74 * Math.PI) / 180),
      (CHELSEA.lat - KIPS_BAY.lat) * 111_132,
    );
    const walk = walkMeters(KIPS_BAY, CHELSEA);
    expect(walk).toBeGreaterThan(straight * 1.05);
    expect(walk).toBeLessThanOrEqual(straight * 1.35 + 1e-6);
  });
});

describe('SubwayRouter', () => {
  it('takes the 6 from Kips Bay down to Astor Place', () => {
    const trip = router.towards(COOPER_UNION, 'weekday').trip(KIPS_BAY);
    expect(trip.mode).toBe('subway');
    expect(describeTrip(trip, graph.routes)).toBe('6');
    expect(trip.minutes).toBeGreaterThanOrEqual(9);
    expect(trip.minutes).toBeLessThanOrEqual(18);
    expect(trip.walkMinutes).toBeGreaterThan(trip.minutes);
    expect(trip.waitMinutes).toBeGreaterThan(0);
  });

  it('adds up its legs to the total', () => {
    const trip = router.towards(COOPER_UNION, 'weekday').trip(CHELSEA);
    const total = trip.legs.reduce((sum, l) => sum + l.seconds, 0) / 60;
    // Legs include the first wait; `minutes` assumes you time it.
    expect(Math.abs(total - trip.waitMinutes - trip.minutes)).toBeLessThan(1.5);
    expect(trip.legs[0]?.kind).toBe('walk');
    expect(trip.legs.at(-1)?.kind).toBe('walk');
  });

  it('walks when walking is quicker', () => {
    const nearby = { lat: 40.7287, lng: -73.9866 }; // St. Marks Place & 2nd Ave
    const trip = router.towards(COOPER_UNION, 'weekday').trip(nearby);
    expect(trip.mode).toBe('walk');
    expect(trip.minutes).toBe(trip.walkMinutes);
    expect(trip.minutes).toBeLessThan(10);
  });

  it('is slower on weekends, when trains come less often', () => {
    const weekday = router.towards(COOPER_UNION, 'weekday').trip(BRYANT_PARK);
    const weekend = router.towards(COOPER_UNION, 'weekend').trip(BRYANT_PARK);
    expect(weekend.minutes + weekend.waitMinutes).toBeGreaterThanOrEqual(weekday.minutes + weekday.waitMinutes);
  });

  it('still answers for far-off places, just slowly', () => {
    const trip = router.towards(COOPER_UNION, 'weekday').trip(TOTTENVILLE);
    expect(trip.minutes).toBeGreaterThan(45);
  });

  it('labels express variants with the plain bullet', () => {
    expect(graph.routes['6']?.[0]).toBe('6');
    expect(graph.routes['6X']).toBeUndefined();
    expect(graph.routes.GS?.[0]).toBe('S');
  });
});
