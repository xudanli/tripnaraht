import { VedurCapAlertsService } from './vedur-cap-alerts.service';

describe('VedurCapAlertsService', () => {
  let svc: VedurCapAlertsService;

  beforeEach(() => {
    svc = new VedurCapAlertsService();
  });

  it('extractAlertItems parses CAP-style nested info', () => {
    const data = {
      identifier: 'cap-1',
      info: [
        {
          headline: 'Strong winds in SE Iceland',
          severity: 'Moderate',
        },
      ],
    };
    const items = svc.extractAlertItems(data);
    expect(items.some((i) => i.headline.includes('Strong winds'))).toBe(true);
  });

  it('extractAlertItems parses array of feature-like objects', () => {
    const data = [
      { headline: 'Alert A', identifier: 'a' },
      { headline: 'Alert B', identifier: 'b' },
    ];
    const items = svc.extractAlertItems(data);
    expect(items).toHaveLength(2);
  });
});
