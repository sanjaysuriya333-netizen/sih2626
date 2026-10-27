import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../src/utils/csv.js');

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('handles Windows line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('handles a last line without a newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('handles a comma inside quotes', () => {
    expect(parseCsv('a,"b,c"\n')).toEqual([['a', 'b,c']]);
  });
  it('handles escaped quotes', () => {
    expect(parseCsv('"say ""hi"""\n')).toEqual([['say "hi"']]);
  });
  it('handles a newline inside quotes', () => {
    expect(parseCsv('"a\nb",c\n')).toEqual([['a\nb', 'c']]);
  });
  it('strips a byte order mark', () => {
    expect(parseCsv('\uFEFFa,b\n')).toEqual([['a', 'b']]);
  });
  it('keeps empty fields and blank lines so row numbers stay right', () => {
    expect(parseCsv('a,,c\n\nb\n')).toEqual([['a', '', 'c'], [''], ['b']]);
  });
  it('returns nothing for an empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });
  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(/never closed/);
  });
});