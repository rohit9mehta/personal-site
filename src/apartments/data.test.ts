import { describe, expect, it } from 'vitest';
import { readListingUrl } from './data.ts';

describe('readListingUrl', () => {
  it('reads the address, unit and borough out of a building link', () => {
    expect(readListingUrl('https://streeteasy.com/building/212-east-29-street-new_york/7?featured=1')).toEqual({
      id: '212-east-29-street-new_york/7',
      url: 'https://streeteasy.com/building/212-east-29-street-new_york/7',
      address: '212 East 29 Street',
      unit: '7',
      borough: 'Manhattan',
    });
    expect(readListingUrl('https://streeteasy.com/building/50-bayard-street-brooklyn/4b')).toMatchObject({
      address: '50 Bayard Street',
      unit: '4B',
      borough: 'Brooklyn',
    });
  });

  it('keeps rental links as they are', () => {
    expect(readListingUrl('https://streeteasy.com/rental/4166895')).toEqual({
      id: '4166895',
      url: 'https://streeteasy.com/rental/4166895',
    });
  });

  it("doesn't invent an address for named buildings or other sites", () => {
    expect(readListingUrl('https://streeteasy.com/building/the-eugene/12a')?.address).toBeUndefined();
    expect(readListingUrl('https://example.com/rental/1')).toBeNull();
    expect(readListingUrl('not a link')).toBeNull();
  });
});
