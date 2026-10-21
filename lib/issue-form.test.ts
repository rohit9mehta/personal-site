import { describe, expect, it } from 'vitest';
import { parseRatings } from './dataset.ts';
import { appendCoffee, parseIssueForm, toCoffee } from './issue-form.ts';

const BODY =
  '### Café\n\nSightglass Coffee\n\n### City\n\nSan Francisco, CA\n\n### Score\n\n8.5\n\n### Note\n\n_No response_';

describe('parseIssueForm', () => {
  it('reads the rendered form', () => {
    expect(parseIssueForm(BODY)).toEqual({ name: 'Sightglass Coffee', city: 'San Francisco, CA', score: '8.5' });
  });

  it('handles CRLF and multi-line notes', () => {
    expect(parseIssueForm('### Café\r\n\r\nA\r\n\r\n### Note\r\n\r\nline one\r\nline two')).toEqual({
      name: 'A',
      note: 'line one line two',
    });
  });
});

describe('toCoffee', () => {
  it('validates and defaults the date to today', () => {
    expect(toCoffee(parseIssueForm(BODY), '2026-10-21')).toEqual({
      name: 'Sightglass Coffee',
      city: 'San Francisco, CA',
      score: 8.5,
      date: '2026-10-21',
    });
  });

  it('explains what is wrong', () => {
    expect(() => toCoffee({ name: 'A', score: '11' }, '2026-10-21')).toThrowError(
      'the city is missing; "11" isn\'t a score from 0 to 10',
    );
  });
});

describe('appendCoffee', () => {
  const csv = 'name,city,score,date,note\nSightglass Coffee,"San Francisco, CA",8,2025-01-01,\n';

  it('appends a quoted row that round-trips, and reports earlier visits', () => {
    const coffee = toCoffee(parseIssueForm(BODY), '2026-10-21');
    const { csv: next, previous } = appendCoffee(csv, coffee);
    expect(previous).toEqual([8]);
    expect(next.endsWith('Sightglass Coffee,"San Francisco, CA",8.5,2026-10-21\n')).toBe(true);
    const { rows, issues } = parseRatings(next);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it('adds a missing trailing newline first and follows the header order', () => {
    const { csv: next } = appendCoffee('city,name,score\nOslo,Tim Wendelboe,9', {
      name: 'Fuglen',
      city: 'Oslo',
      score: 8,
      note: 'dropped: no note column',
    });
    expect(next).toBe('city,name,score\nOslo,Tim Wendelboe,9\nOslo,Fuglen,8\n');
  });
});
