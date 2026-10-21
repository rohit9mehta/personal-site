import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { buildMapStyle } from './style.ts';

describe('buildMapStyle', () => {
  it('is a valid MapLibre style', () => {
    const errors = validateStyleMin(buildMapStyle());
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it('has unique layer ids', () => {
    const ids = buildMapStyle().layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
