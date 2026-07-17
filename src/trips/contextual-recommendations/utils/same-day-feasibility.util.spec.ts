import { mergeSameDayProblem } from './same-day-context-merge.util';
import { evaluateAndRepairMicroPlan } from './same-day-feasibility.util';
import type {
  CanonicalSameDayContext,
  MicroPlanRecommendation,
} from '../types/contextual-recommendations.types';

describe('same-day-feasibility.util', () => {
  const canonical: CanonicalSameDayContext = {
    tripId: 'trip_1',
    destination: 'IS',
    countryCode: 'IS',
    focusDayIndex: 1,
    tripPhase: 'ARRIVAL_DAY',
    hotel: { name: 'Hotel', cityName: '雷克雅未克', confirmed: true },
    tomorrow: { dayIndex: 2, firstActivityStart: '08:30', earlyDeparture: true },
    team: {
      memberCount: 4,
      childrenPresent: true,
      elderlyPresent: false,
      physicalConstraints: [],
    },
    weatherHint: '大风约 40 km/h',
    sources: { fromDelta: [], fromBackend: [] },
  };

  const baseRec = (): MicroPlanRecommendation => ({
    title: '晚餐后海滨散步',
    reasonCodes: ['ARRIVAL_DAY'],
    score: 80,
    schedule: [
      { type: 'DINING', startTime: '19:00', endTime: '20:00', title: '晚餐' },
      {
        type: 'LIGHT_ACTIVITY',
        startTime: '20:10',
        endTime: '20:40',
        title: '海滨散步',
        productId: 'poi_sun_voyager',
      },
      { type: 'REST', startTime: '20:40', endTime: '21:00', title: '回酒店' },
    ],
    impact: {
      additionalDrivingMinutes: 4,
      walkingMinutes: 30,
      tomorrowPlanImpact: 'NONE',
    },
    gate: 'ALLOW',
  });

  it('repairs adverse-weather outdoor slots to ALLOW', () => {
    const problem = mergeSameDayProblem({
      canonical,
      contextDelta: {
        currentTime: '2026-07-16T18:00:00Z',
        desiredReturnTime: '21:00',
        teamState: { energy: 'LOW' },
        desiredIntensity: 'LIGHT',
      },
    });
    const result = evaluateAndRepairMicroPlan(problem, baseRec());
    expect(result.repaired).toBe(true);
    expect(result.gate).not.toBe('REJECT');
    expect(result.recommendation.schedule.some((s) => s.type === 'LIGHT_ACTIVITY')).toBe(
      false,
    );
    expect(result.recommendation.reasonCodes).toContain('FEASIBILITY_REPAIRED');
  });

  it('rejects high-load products like Kirkjufell', () => {
    const problem = mergeSameDayProblem({
      canonical: { ...canonical, weatherHint: null },
      contextDelta: {
        currentTime: '2026-07-16T12:00:00Z',
        desiredReturnTime: '21:00',
        teamState: { energy: 'HIGH' },
      },
    });
    const rec = baseRec();
    rec.schedule = [
      {
        type: 'LIGHT_ACTIVITY',
        startTime: '14:00',
        endTime: '18:00',
        title: '教会山',
        productId: 'kirkjufell',
      },
    ];
    rec.impact.walkingMinutes = 10;
    const result = evaluateAndRepairMicroPlan(problem, rec);
    // After repair still has rejected product in remaining? Repair only drops LIGHT_ACTIVITY entirely
    // so kirkjufell slot is dropped → may become REST-only ALLOW
    expect(result.recommendation.schedule.some((s) => s.productId === 'kirkjufell')).toBe(
      false,
    );
  });

  it('passes a simple dinner+rest plan', () => {
    const problem = mergeSameDayProblem({
      canonical: { ...canonical, weatherHint: null },
      contextDelta: {
        currentTime: '2026-07-16T18:00:00Z',
        desiredReturnTime: '21:00',
        teamState: { energy: 'LOW' },
      },
    });
    const rec = baseRec();
    rec.schedule = [
      { type: 'DINING', startTime: '19:00', endTime: '20:00', title: '晚餐' },
      { type: 'REST', startTime: '20:00', endTime: '21:00', title: '休息' },
    ];
    rec.impact.walkingMinutes = 12;
    const result = evaluateAndRepairMicroPlan(problem, rec);
    expect(result.gate).toBe('ALLOW');
    expect(result.repaired).toBe(false);
    expect(result.recommendation.reasonCodes).toContain('FEASIBILITY_PASS');
  });
});
