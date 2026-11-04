// The time in a few of the cities I drink coffee in, and what that hour is
// for.

export interface ClockCity {
  name: string;
  zone: string;
}

export const CLOCK_CITIES: readonly ClockCity[] = [
  { name: 'New York', zone: 'America/New_York' },
  { name: 'San Francisco', zone: 'America/Los_Angeles' },
  { name: 'Mumbai', zone: 'Asia/Kolkata' },
  { name: 'Paris', zone: 'Europe/Paris' },
];

/** What an hour (0–23) of the day is for. */
export function moodAt(hour: number): string {
  if (hour >= 5 && hour < 11) return 'coffee o’clock';
  if (hour >= 11 && hour < 14) return 'lunch, then coffee';
  if (hour >= 14 && hour < 16) return 'the slump';
  if (hour >= 16 && hour < 19) return 'chai o’clock';
  if (hour >= 19 && hour < 23) return 'one more chai';
  return 'asleep, ideally';
}

/** Hours and minutes on the wall clock in a time zone. */
export function wallTime(zone: string, date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour') % 24, minute: get('minute') };
}

/** 18:05 → "6:05 pm". */
export function formatTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

const NS = 'http://www.w3.org/2000/svg';

function dial(): { svg: SVGSVGElement; hour: SVGLineElement; minute: SVGLineElement } {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('class', 'clock__dial');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<circle cx="20" cy="20" r="18.5" class="clock__face"/>' +
    Array.from(
      { length: 12 },
      (_, i) => `<circle cx="20" cy="4.5" r="${i % 3 ? 0.8 : 1.4}" transform="rotate(${i * 30} 20 20)"/>`,
    ).join('');
  const hand = (length: number, cls: string) => {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', '20');
    line.setAttribute('y1', '20');
    line.setAttribute('x2', '20');
    line.setAttribute('y2', String(20 - length));
    line.setAttribute('class', cls);
    svg.append(line);
    return line;
  };
  const hour = hand(9, 'clock__hour');
  const minute = hand(13.5, 'clock__minute');
  svg.insertAdjacentHTML('beforeend', '<circle cx="20" cy="20" r="1.8" class="clock__pin"/>');
  return { svg, hour, minute };
}

export function startClocks(container: HTMLElement): void {
  const clocks = CLOCK_CITIES.map((city) => {
    const el = document.createElement('div');
    el.className = 'clock';
    const { svg, hour, minute } = dial();
    const name = document.createElement('span');
    name.className = 'clock__city';
    name.textContent = city.name;
    const time = document.createElement('span');
    time.className = 'clock__time';
    const mood = document.createElement('span');
    mood.className = 'clock__mood';
    el.append(svg, name, time, mood);
    container.append(el);
    return { city, hour, minute, time, mood };
  });

  const tick = () => {
    const now = new Date();
    for (const c of clocks) {
      const t = wallTime(c.city.zone, now);
      c.hour.setAttribute('transform', `rotate(${(t.hour % 12) * 30 + t.minute / 2} 20 20)`);
      c.minute.setAttribute('transform', `rotate(${t.minute * 6} 20 20)`);
      c.time.textContent = formatTime(t.hour, t.minute);
      c.mood.textContent = moodAt(t.hour);
    }
  };
  tick();
  // Re-check every 15 seconds so a minute never shows for long after it's over.
  setInterval(tick, 15_000);
}
