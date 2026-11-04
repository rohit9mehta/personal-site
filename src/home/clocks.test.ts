import { describe, expect, it } from 'vitest';
import { formatTime, moodAt, wallTime } from './clocks.ts';

describe('moodAt', () => {
  it('has something for every hour', () => {
    expect(moodAt(7)).toBe('coffee o’clock');
    expect(moodAt(12)).toBe('lunch, then coffee');
    expect(moodAt(15)).toBe('the slump');
    expect(moodAt(17)).toBe('chai o’clock');
    expect(moodAt(21)).toBe('one more chai');
    expect(moodAt(2)).toBe('asleep, ideally');
    for (let h = 0; h < 24; h++) expect(moodAt(h)).toBeTruthy();
  });
});

describe('wallTime', () => {
  it('reads the clock in another time zone', () => {
    const date = new Date('2026-11-04T23:30:00Z');
    expect(wallTime('America/New_York', date)).toEqual({ hour: 18, minute: 30 });
    expect(wallTime('Asia/Kolkata', date)).toEqual({ hour: 5, minute: 0 });
    expect(wallTime('Europe/Paris', new Date('2026-11-04T23:05:00Z'))).toEqual({ hour: 0, minute: 5 });
  });
});

describe('formatTime', () => {
  it('uses a 12-hour clock', () => {
    expect(formatTime(18, 5)).toBe('6:05 pm');
    expect(formatTime(0, 30)).toBe('12:30 am');
    expect(formatTime(12, 0)).toBe('12:00 pm');
  });
});
