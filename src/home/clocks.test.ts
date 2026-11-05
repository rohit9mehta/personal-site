import { describe, expect, it } from 'vitest';
import { formatTime, utcOffset, wallTime } from './clocks.ts';

describe('utcOffset', () => {
  it('names the offset, including half hours and summer time', () => {
    expect(utcOffset('America/New_York', new Date('2026-11-04T23:30:00Z'))).toBe('UTC−5');
    expect(utcOffset('America/New_York', new Date('2026-07-04T12:00:00Z'))).toBe('UTC−4');
    expect(utcOffset('Asia/Kolkata', new Date('2026-11-04T23:30:00Z'))).toBe('UTC+5:30');
    expect(utcOffset('UTC', new Date('2026-11-04T23:30:00Z'))).toBe('UTC±0');
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
