import { ClarificationHandlerService } from './clarification-handler.service';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

describe('ClarificationHandlerService', () => {
  const svc = new ClarificationHandlerService();

  const baseTrip = (): TripPlanRequest =>
    ({
      days: 2,
      must_include_poi_ids: ['a', 'b'],
      constraints: { vehicle_type: '2WD' },
    }) as TripPlanRequest;

  it('applies early_warning_relaxations same as plan_gen ids', () => {
    const { tripPlanRequest, applied } = svc.applyRelaxationsFromAnswers(baseTrip(), [
      { questionId: 'early_warning_relaxations', value: ['upgrade_vehicle_to_4wd'] },
    ]);
    expect(applied.map((a) => a.id)).toEqual(['upgrade_vehicle_to_4wd']);
    expect(tripPlanRequest.constraints?.vehicle_type).toBe('4WD');
  });

  it('merges plan_gen and early_warning answers without double-counting', () => {
    const answersA = [
      { questionId: 'plan_gen_empty_draft_relax_constraints', value: ['upgrade_vehicle_to_4wd'] },
      { questionId: 'early_warning_relaxations', value: ['increase_days_by_1'] },
    ];
    const answersB = [
      { questionId: 'early_warning_relaxations', value: ['increase_days_by_1'] },
      { questionId: 'plan_gen_empty_draft_relax_constraints', value: ['upgrade_vehicle_to_4wd'] },
    ];
    const { tripPlanRequest, applied, fingerprint: fp1 } = svc.applyRelaxationsFromAnswers(baseTrip(), answersA);
    expect(new Set(applied.map((a) => a.id))).toEqual(
      new Set(['upgrade_vehicle_to_4wd', 'increase_days_by_1']),
    );
    expect(tripPlanRequest.constraints?.vehicle_type).toBe('4WD');
    expect(tripPlanRequest.days).toBe(3);

    const { fingerprint: fp2 } = svc.applyRelaxationsFromAnswers(baseTrip(), answersB);
    expect(fp1).toBe(fp2);
  });

  it('accept_no_solution only when present on plan_gen question', () => {
    const r = svc.applyRelaxationsFromAnswers(baseTrip(), [
      { questionId: 'early_warning_relaxations', value: ['accept_no_solution'] },
    ]);
    expect(r.terminalIntent).toBeUndefined();
    expect(r.applied).toEqual([]);
    expect(r.tripPlanRequest.constraints?.vehicle_type).toBe('2WD');

    const r2 = svc.applyRelaxationsFromAnswers(baseTrip(), [
      { questionId: 'plan_gen_empty_draft_relax_constraints', value: ['accept_no_solution'] },
    ]);
    expect(r2.terminalIntent).toBe('TERMINAL_NO_SOLUTION');
  });

  it('early_warning proceed_at_own_risk applies no patch but flags proceed', () => {
    const r = svc.applyRelaxationsFromAnswers(baseTrip(), [
      { questionId: 'early_warning_relaxations', value: ['proceed_at_own_risk'] },
    ]);
    expect(r.applied).toEqual([]);
    expect(r.earlyWarningProceedAtOwnRisk).toBe(true);
    expect(r.tripPlanRequest.constraints?.vehicle_type).toBe('2WD');
  });

  it('proceed_at_own_risk mixed with physical picks ignores proceed for patch', () => {
    const r = svc.applyRelaxationsFromAnswers(baseTrip(), [
      { questionId: 'early_warning_relaxations', value: ['proceed_at_own_risk', 'upgrade_vehicle_to_4wd'] },
    ]);
    expect(r.earlyWarningProceedAtOwnRisk).toBeUndefined();
    expect(r.applied.map((a) => a.id)).toEqual(['upgrade_vehicle_to_4wd']);
  });

  it('clarify_transport_endpoints_v1: comma splits origin and destination', () => {
    const trip = { ...baseTrip(), origin: '起点', destination: '冰岛' } as TripPlanRequest;
    const r = svc.applyRelaxationsFromAnswers(trip, [
      { questionId: 'clarify_transport_endpoints_v1', value: '北京，雷克雅未克' },
    ]);
    expect(r.transportClarificationApplied).toBe(true);
    expect(r.didPatch).toBe(true);
    expect(r.tripPlanRequest.origin).toBe('北京');
    expect(r.tripPlanRequest.destination).toBe('雷克雅未克');
  });

  it('clarify_transport_endpoints_v1: single string updates origin only', () => {
    const trip = { ...baseTrip(), origin: '起点', destination: 'Akureyri' } as TripPlanRequest;
    const r = svc.applyRelaxationsFromAnswers(trip, [
      { questionId: 'clarify_transport_endpoints_v1', value: '  Reykjavik  ' },
    ]);
    expect(r.transportClarificationApplied).toBe(true);
    expect(r.tripPlanRequest.origin).toBe('Reykjavik');
    expect(r.tripPlanRequest.destination).toBe('Akureyri');
  });
});
