// A small RFC 4180 CSV reader/writer. Kept dependency-free so the same code runs
// in Node scripts, the Vite plugin, and tests.

export interface CsvRecord {
  /** 1-based line number where the record starts, for error messages. */
  line: number;
  fields: string[];
}

export class CsvSyntaxError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`line ${line}: ${message}`);
    this.line = line;
  }
}

export function parseCsv(text: string): CsvRecord[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let line = 1;
  let recordLine = 1;
  let inQuotes = false;
  let quotedLine = 0;
  let fieldWasQuoted = false;

  const endField = () => {
    fields.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };
  const endRecord = () => {
    endField();
    // Skip blank lines (a single empty, unquoted field).
    if (!(fields.length === 1 && fields[0] === '')) {
      records.push({ line: recordLine, fields });
    }
    fields = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field.trim() !== '') {
        throw new CsvSyntaxError(
          'unexpected quote in the middle of a field; wrap the whole field in quotes and double any quotes inside it',
          line,
        );
      }
      field = '';
      inQuotes = true;
      fieldWasQuoted = true;
      quotedLine = line;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else if (fieldWasQuoted) {
      if (ch !== ' ' && ch !== '\t') {
        throw new CsvSyntaxError('text after a closing quote; wrap the whole field in quotes', line);
      }
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    throw new CsvSyntaxError('a quoted field is never closed', quotedLine);
  }
  if (field !== '' || fields.length > 0 || fieldWasQuoted) endRecord();
  return records;
}

export function formatCsvField(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function formatCsvRow(values: string[]): string {
  return values.map(formatCsvField).join(',');
}
