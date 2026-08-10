import { extractCountryCodeFromMessage } from './extract-country-code-from-message.runner';

describe('extract-country-code-from-message.runner', () => {
  it('returns undefined for region hints', () => {
    const debug = jest.fn();
    expect(extractCountryCodeFromMessage('阿尔卑斯山自驾', { debug })).toBeUndefined();
    expect(debug).toHaveBeenCalled();
  });
});
