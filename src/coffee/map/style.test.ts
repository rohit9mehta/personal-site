import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { buildMapStyle } from './style.ts';

describe('buildMapStyle', () => {
  it.each(['light', 'dark'] as const)('is a valid MapLibre style (%s)', (theme) => {
    const errors = validateStyleMin(buildMapStyle(theme));
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it('has unique layer ids', () => {
    const ids = buildMapStyle().layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
