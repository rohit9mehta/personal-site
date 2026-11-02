import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaNames, inAreas, parseAlertEmail, parseSearchUrl, searchUrl } from './streeteasy.ts';

const fixture = (name: string) => readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

describe('parseAlertEmail', () => {
  const a = parseAlertEmail(fixture('alert-a.txt'));

  it('finds every listing once, in order', () => {
    expect(a.listings.map((l) => l.id)).toEqual(['4166895', '4166425', '4152919', '4156736', '4166910']);
  });

  it('reads the facts for each listing', () => {
    expect(a.listings[0]).toMatchObject({
      url: 'https://streeteasy.com/rental/4166895',
      kind: 'Condo',
      neighborhood: 'East Village',
      address: '753 East 5th Street',
      unit: '3B',
      price: 4800,
      noFee: true,
      beds: 2,
      baths: 2,
      sqft: 722,
      broker: 'Owner',
      section: 'new',
    });
    expect(a.listings[1]).toMatchObject({
      address: '91 East 3rd Street',
      unit: '33',
      price: 4250,
      baths: 1,
      broker: 'Avenues Real Estate',
      updates: ['Open House'],
    });
    expect(a.listings[1]!.noFee).toBeUndefined();
  });

  it('keeps the updates StreetEasy lists and which section a listing came in', () => {
    expect(a.listings[2]).toMatchObject({
      section: 'updated',
      updates: ['Open House Price Increase: $195'],
      broker: 'Corcoran',
    });
    expect(a.listings[4]).toMatchObject({ section: 'suggested', neighborhood: 'Gramercy Park', unit: '3O' });
  });

  it('remembers which saved search each listing was sent for', () => {
    expect(a.searches[0]?.label).toMatch(/^For Rent: listings under \$5,500 in Civic Center/);
    expect(a.listings[0]!.search).toBe(a.searches[0]!.url);
  });

  it('handles hyphenated house numbers and half baths', () => {
    const b = parseAlertEmail(fixture('alert-b.txt'));
    expect(b.listings).toHaveLength(5);
    expect(b.listings.find((l) => l.id === '4160243')).toMatchObject({ address: '70-80 Kenmare Street', unit: '3' });
    expect(b.listings.find((l) => l.id === '4161520')).toMatchObject({ address: '40 Avenue B', baths: 1.5 });
    expect(b.listings.find((l) => l.id === '4162114')?.updates).toEqual(['Open House']);
  });

  it('reads a studio and building-style links', () => {
    const text = [
      'For Rent: listings under $3,500 in Chelsea with studios',
      '<https://streeteasy.com/for-rent/nyc/status:open%7Cprice:-3500%7Carea:115%7Cbeds:%3C1>',
      'Rental Unit in Chelsea',
      '300 West 23rd Street #5F',
      '$3,150',
      'Studio',
      '1 Bath',
      'Some Brokerage LLC',
      '<https://streeteasy.com/building/300-west-23-street-new_york/5f?utm_source=x>',
    ].join('\n');
    const { listings } = parseAlertEmail(text);
    expect(listings).toEqual([
      expect.objectContaining({
        id: '300-west-23-street-new_york/5f',
        url: 'https://streeteasy.com/building/300-west-23-street-new_york/5f',
        beds: 0,
        price: 3150,
        broker: 'Some Brokerage LLC',
      }),
    ]);
  });

  it('still reads listings when the links are wrapped for click tracking', () => {
    const wrapped = fixture('alert-b.txt').replace(
      /https:\/\/streeteasy\.com\/rental\/(\d+)/g,
      'https://links.streeteasy.com/ls/click?upn=abc$1',
    );
    const { listings } = parseAlertEmail(wrapped);
    expect(listings.map((l) => [l.address, l.unit, l.price, l.section])).toEqual([
      ['441 East 12th Street', '2D', 4800, 'new'],
      ['40 Avenue B', '4E', 5250, 'new'],
      ['209 Grand Street', '1D', 4700, 'new'],
      ['70-80 Kenmare Street', '3', 5250, 'updated'],
      ['237 East 2nd Street', '6', 4995, 'updated'],
    ]);
    expect(listings[0]).toMatchObject({ id: '441-east-12th-street/2d', beds: 2, broker: 'PocketBroker Inc' });
    expect(listings[0]!.url).toMatch(/^https:\/\/www\.google\.com\/search\?q=streeteasy/);
  });

  it('ignores emails without listings', () => {
    expect(parseAlertEmail('Hello! Thanks for signing up.').listings).toEqual([]);
  });
});

describe('search links', () => {
  it('builds a StreetEasy search for a filter', () => {
    const url = searchUrl({ areas: [115, 158], beds: [0, 1], maxPrice: 3675 });
    expect(url).toBe(
      'https://streeteasy.com/for-rent/nyc/status%3Aopen%7Cprice%3A-3675%7Carea%3A115%2C158%7Cbeds%3A%3C%3D1',
    );
    expect(parseSearchUrl(url)).toEqual({ areas: [115, 158], beds: [0, 1], maxPrice: 3675 });
  });

  it('reads the search out of an alert email link', () => {
    const c = parseSearchUrl(
      'https://streeteasy.com/2-bedroom-apartments-for-rent/nyc/status:open%7Cprice:-5500%7Carea:103,107,162%7Camenities:washer_dryer',
    );
    expect(c).toEqual({ areas: [103, 107, 162], beds: [2], maxPrice: 5500 });
  });

  it('covers bedroom ranges', () => {
    const beds = (b: number[]) => parseSearchUrl(searchUrl({ areas: [], beds: b }))?.beds;
    expect(beds([0])).toEqual([0]);
    expect(beds([2])).toEqual([2]);
    expect(beds([1, 2])).toEqual([1, 2]);
    expect(beds([2, 3, 4])).toEqual([2, 3, 4]);
    expect(beds([0, 1, 2, 3, 4])).toEqual([]);
  });
});

describe('areas', () => {
  it('counts sub-neighborhoods as part of their area', () => {
    expect(inAreas('Kips Bay', [123])).toBe(true);
    expect(inAreas('Murray Hill', [123])).toBe(true);
    expect(inAreas('Turtle Bay', [123])).toBe(true);
    expect(inAreas('Kips Bay', [115])).toBe(false);
    expect(inAreas('Soho', [107])).toBe(true);
    expect(inAreas("Hell's Kitchen", [124])).toBe(true);
    expect(areaNames([162]).has('nolita')).toBe(true);
  });
});
