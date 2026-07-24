import {
  applyProviderUnknownAuthorityGuard,
  evaluateTravelEtaL2AuthorityGate,
  isTripInTravelEtaL2SelectedWhitelist,
  resolveTravelEtaAuthorityForTrip,
  resolveTravelEtaL2CanaryStage,
} from './travel-eta-l2-authority.gate';

describe('travel-eta-l2-authority gate', () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      'TRAVEL_ETA_L2_CANARY_STAGE',
      'TRAVEL_ETA_L2_AUTHORITY_APPROVED',
      'TRAVEL_ETA_L2_KILL_SWITCH',
      'TRAVEL_ETA_L2_SELECTED_TRIP_IDS',
      'TRAVEL_ETA_L2_AUTHORITY',
    ]) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('defaults to shadow stage', () => {
    expect(resolveTravelEtaL2CanaryStage()).toBe('shadow');
    const gate = evaluateTravelEtaL2AuthorityGate({
      goldMatrixPresent: true,
      whitelist: { schemaId: 'tripnara.travel_eta_l2_selected_trips@v1', tripIds: [] },
    });
    expect(gate.authoritativePromotion).toBe(false);
    expect(resolveTravelEtaAuthorityForTrip({ tripId: 'any', gate })).toBe('SHADOW');
  });

  it('selected_trips requires approval + whitelist', () => {
    process.env.TRAVEL_ETA_L2_CANARY_STAGE = 'selected_trips';
    process.env.TRAVEL_ETA_L2_AUTHORITY_APPROVED = '1';
    process.env.TRAVEL_ETA_L2_SELECTED_TRIP_IDS = 'trip-f208,trip-f35';

    const gate = evaluateTravelEtaL2AuthorityGate({ goldMatrixPresent: true });
    expect(gate.authoritativePromotion).toBe(true);
    expect(gate.releaseAuthorized).toBe(true);
    expect(isTripInTravelEtaL2SelectedWhitelist('trip-f208')).toBe(true);
    expect(resolveTravelEtaAuthorityForTrip({ tripId: 'trip-f208', gate })).toBe('AUTHORITATIVE');
    expect(resolveTravelEtaAuthorityForTrip({ tripId: 'other', gate })).toBe('SHADOW');
  });

  it('kill switch forces shadow', () => {
    process.env.TRAVEL_ETA_L2_CANARY_STAGE = 'selected_trips';
    process.env.TRAVEL_ETA_L2_AUTHORITY_APPROVED = '1';
    process.env.TRAVEL_ETA_L2_SELECTED_TRIP_IDS = 'trip-f208';
    process.env.TRAVEL_ETA_L2_KILL_SWITCH = '1';

    const gate = evaluateTravelEtaL2AuthorityGate({ goldMatrixPresent: true });
    expect(gate.killSwitch).toBe(true);
    expect(gate.authoritativePromotion).toBe(false);
    expect(resolveTravelEtaAuthorityForTrip({ tripId: 'trip-f208', gate })).toBe('SHADOW');
  });

  it('UNKNOWN provider blocks authoritative elevation', () => {
    expect(
      applyProviderUnknownAuthorityGuard('AUTHORITATIVE', 'UNKNOWN', 'UNKNOWN'),
    ).toEqual({
      authority: 'SHADOW',
      blockedReason: 'PROVIDER_UNKNOWN_BLOCKS_AUTHORITATIVE',
    });
    expect(applyProviderUnknownAuthorityGuard('AUTHORITATIVE', 'MAPBOX', 'CONFIRMED')).toEqual({
      authority: 'AUTHORITATIVE',
    });
  });
});
