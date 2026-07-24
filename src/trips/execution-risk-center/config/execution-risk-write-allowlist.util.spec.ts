import {
  isExecutionRiskWriteAllowlisted,
  readExecutionRiskWriteAllowlist,
} from './execution-risk-write-allowlist.util';

describe('execution-risk-write-allowlist.util', () => {
  beforeEach(() => {
    delete process.env.EXECUTION_RISK_WRITE_ALLOWLIST_TRIPS;
    delete process.env.EXECUTION_RISK_WRITE_ALLOWLIST_USERS;
    delete process.env.EXECUTION_RISK_WRITE_ALLOWLIST_CODES;
  });

  it('allows all when allowlist env vars are unset', () => {
    expect(
      isExecutionRiskWriteAllowlisted({
        tripId: 'trip-1',
        userId: 'user-1',
        riskCode: 'WEATHER_STRONG_WIND',
      }),
    ).toBe(true);
  });

  it('requires matching trip, user, and code when all lists configured', () => {
    process.env.EXECUTION_RISK_WRITE_ALLOWLIST_TRIPS = 'trip-allowed';
    process.env.EXECUTION_RISK_WRITE_ALLOWLIST_USERS = 'user-allowed';
    process.env.EXECUTION_RISK_WRITE_ALLOWLIST_CODES = 'WEATHER_STRONG_WIND,ROAD_CLOSED';

    expect(
      isExecutionRiskWriteAllowlisted({
        tripId: 'trip-allowed',
        userId: 'user-allowed',
        riskCode: 'WEATHER_STRONG_WIND',
      }),
    ).toBe(true);
    expect(
      isExecutionRiskWriteAllowlisted({
        tripId: 'trip-other',
        userId: 'user-allowed',
        riskCode: 'WEATHER_STRONG_WIND',
      }),
    ).toBe(false);

    const list = readExecutionRiskWriteAllowlist();
    expect(list.riskCodes.has('ROAD_CLOSED')).toBe(true);
  });
});
