import { describe, expect, it } from 'vitest';
import { CsvSyntaxError, formatCsvRow, parseCsv } from './csv.ts';

describe('parseCsv', () => {
  it('parses plain rows and tracks line numbers', () => {
    expect(parseCsv('name,city,score\nSightglass,San Francisco,8.5\n')).toEqual([
      { line: 1, fields: ['name', 'city', 'score'] },
      { line: 2, fields: ['Sightglass', 'San Francisco', '8.5'] },
    ]);
  });

  it('handles quotes, escaped quotes, commas and newlines inside quotes', () => {
    const rows = parseCsv('a,b\n"Coffee, Etc.","say ""hi""\nthere"\nlast,row');
    expect(rows).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['Coffee, Etc.', 'say "hi"\nthere'] },
      { line: 4, fields: ['last', 'row'] },
    ]);
  });

  it('skips blank lines, trims unquoted fields, and handles CRLF and a BOM', () => {
    const rows = parseCsv('﻿a,b\r\n\r\n  x , y \r\n');
    expect(rows).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 3, fields: ['x', 'y'] },
    ]);
  });

  it('keeps trailing empty fields', () => {
    expect(parseCsv('a,b,c\n1,,\n')[1]?.fields).toEqual(['1', '', '']);
  });

  it('reports unterminated quotes with the line they start on', () => {
    expect(() => parseCsv('a\n"oops\nmore')).toThrowError(CsvSyntaxError);
    expect(() => parseCsv('a\n"oops\nmore')).toThrowError(/line 2/);
  });

  it('rejects stray quotes', () => {
    expect(() => parseCsv('a\nab"c')).toThrowError(/unexpected quote/);
    expect(() => parseCsv('a\n"ab"c')).toThrowError(/after a closing quote/);
  });
});

describe('formatCsvRow', () => {
  it('quotes only when needed and round-trips', () => {
    const values = ['Blue Bottle', 'Portland, OR', 'He said "wow"', ''];
    const line = formatCsvRow(values);
    expect(line).toBe('Blue Bottle,"Portland, OR","He said ""wow""",');
    expect(parseCsv(line)[0]?.fields).toEqual(values);
  });
});
