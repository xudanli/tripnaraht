import {
  normalizeClientDsoVersion,
  parseClientDsoVersionNumber,
} from './client-dso-version.util';

describe('client-dso-version.util', () => {
  it('normalizes finite numbers to string', () => {
    expect(normalizeClientDsoVersion(11)).toBe('11');
    expect(normalizeClientDsoVersion(11.9)).toBe('11');
  });

  it('trims and normalizes numeric strings', () => {
    expect(normalizeClientDsoVersion(' 12 ')).toBe('12');
  });

  it('parses normalized values back to numbers', () => {
    expect(parseClientDsoVersionNumber('7')).toBe(7);
    expect(parseClientDsoVersionNumber(7)).toBe(7);
  });
});
