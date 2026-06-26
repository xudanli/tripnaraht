import {
  mapActuatorActionToTripIntervention,
  mapCausalInterventionToTripIntervention,
  mapWhatIfActionToTripIntervention,
} from './trip-intervention.mapper';

describe('trip-intervention.mapper', () => {
  it('maps SHIFT_EARLIER What-If action', () => {
    const iv = mapWhatIfActionToTripIntervention({
      type: 'SHIFT_EARLIER',
      poiId: 'poi_glacier',
      minutes: 50,
    });
    expect(iv.type).toBe('SHIFT_TIME');
    expect(iv.targetVariable).toBe('temporal:poi_start:poi_glacier');
    expect(iv.proposedValue).toEqual({ shiftMinutes: -50 });
    expect(iv.source).toBe('what_if');
  });

  it('maps causal do-operator intervention', () => {
    const iv = mapCausalInterventionToTripIntervention({
      id: 'do_slack_time',
      targetNodeId: 'domain:temporal',
      doOperator: false,
      statePatch: { meanTemporalPressure: 0.22 },
    });
    expect(iv.type).toBe('SHIFT_TIME');
    expect(iv.source).toBe('causal_physics');
  });

  it('maps actuator WAITING_FOR_WINDOW', () => {
    const iv = mapActuatorActionToTripIntervention('WAITING_FOR_WINDOW', {
      reasonCodes: ['WIND_WINDOW'],
    });
    expect(iv.type).toBe('WAIT_FOR_WINDOW');
    expect(iv.source).toBe('actuator');
  });
});
