import {
  detectDestinationRegionHint,
  extractCountryCodeFromMessage,
} from './extract-country-code-from-message.util';

describe('extractCountryCodeFromMessage', () => {
  it('does not misroute travel / start via substring ISO (US/AL)', () => {
    expect(extractCountryCodeFromMessage('travel plan')).toBeUndefined();
    expect(extractCountryCodeFromMessage('start planning')).toBeUndefined();
  });

  it('resolves Australia via name alias (not AU substring inside Australia)', () => {
    expect(extractCountryCodeFromMessage('Australia travel plan')).toBe('AU');
    expect(extractCountryCodeFromMessage('澳大利亚 7 日')).toBe('AU');
    expect(extractCountryCodeFromMessage('悉尼一周游')).toBe('AU');
    expect(extractCountryCodeFromMessage('destination AU')).toBe('AU');
  });

  it('does not fake Alps as country AL', () => {
    expect(extractCountryCodeFromMessage('Alps road trip')).toBeUndefined();
    expect(extractCountryCodeFromMessage('阿尔卑斯自驾')).toBeUndefined();
    expect(detectDestinationRegionHint('Alps road trip')?.regionCode).toBe('ALPS');
    expect(detectDestinationRegionHint('阿尔卑斯山')?.regionCode).toBe('ALPS');
  });

  it('resolves Iceland aliases and city', () => {
    expect(extractCountryCodeFromMessage('Iceland 7 day trip')).toBe('IS');
    expect(extractCountryCodeFromMessage('去冰岛玩一周')).toBe('IS');
    expect(extractCountryCodeFromMessage('Reykjavik itinerary')).toBe('IS');
    expect(extractCountryCodeFromMessage('雷克雅未克')).toBe('IS');
  });

  it('allows ISO two-letter only as full tokens', () => {
    expect(extractCountryCodeFromMessage('destination IS')).toBe('IS');
    expect(extractCountryCodeFromMessage('trip to US, summer')).toBe('US');
  });

  it('prefers longer country names over shorter aliases', () => {
    expect(extractCountryCodeFromMessage('New Zealand road trip')).toBe('NZ');
    expect(extractCountryCodeFromMessage('United States west coast')).toBe('US');
  });
});
