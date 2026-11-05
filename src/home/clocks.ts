// Analog clocks for a few cities, in the footer.

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

/** "UTC−5", "UTC+5:30": the zone's offset at that moment. */
export function utcOffset(zone: string, date: Date): string {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const offset = name.replace(/^GMT/, '').replace('-', '−');
  return `UTC${offset === '' || offset === '+0' ? '±0' : offset}`;
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
    const zone = document.createElement('span');
    zone.className = 'clock__zone';
    el.append(svg, name, time, zone);
    container.append(el);
    return { city, hour, minute, time, zone };
  });

  const tick = () => {
    const now = new Date();
    for (const c of clocks) {
      const t = wallTime(c.city.zone, now);
      c.hour.setAttribute('transform', `rotate(${(t.hour % 12) * 30 + t.minute / 2} 20 20)`);
      c.minute.setAttribute('transform', `rotate(${t.minute * 6} 20 20)`);
      c.time.textContent = formatTime(t.hour, t.minute);
      c.zone.textContent = utcOffset(c.city.zone, now);
    }
  };
  tick();
  // Re-check every 15 seconds so a minute never shows for long after it's over.
  setInterval(tick, 15_000);
}
