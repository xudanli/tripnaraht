import {
  buildMarathonIntakeClarificationQuestion,
  buildMarathonSafetyRhythmZh,
  buildPhysicalLowerBoundClarificationQuestion,
  dedupeRepeatedClarificationParagraphs,
  inferNlMarathonCalendarDays,
  resolveMarathonDayClarificationContext,
  resolvePlanningDaysForUserClarification,
  scrubInternalAgentLeakage,
} from './structured-intake-clarification.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

describe('structured-intake-clarification.util', () => {
  it('inferNlMarathonCalendarDays returns 1 for 24h ring road message', () => {
    expect(inferNlMarathonCalendarDays('6月5日想利用极昼，24小时不间断自驾环岛')).toBe(1);
  });

  it('resolvePlanningDaysForUserClarification prefers NL over trip.days=7', () => {
    const trip = { days: 7, destination: '冰岛' } as TripPlanRequest;
    expect(
      resolvePlanningDaysForUserClarification(trip, '6月5日想利用极昼，24小时不间断自驾环岛'),
    ).toBe(1);
  });

  it('scrubInternalAgentLeakage removes persona and verdict tokens', () => {
    const s = scrubInternalAgentLeakage(
      '合议摘要：Neptune REPLACE 为分段；Dr.Dre REJECT；L3-DEFER|x',
    );
    expect(s).not.toMatch(/REPLACE|合议摘要|L3-DEFER/i);
  });

  it('scrubInternalAgentLeakage preserves paragraph newlines', () => {
    const s = scrubInternalAgentLeakage('段落一\n\n段落二');
    expect(s).toBe('段落一\n\n段落二');
  });

  it('dedupeRepeatedClarificationParagraphs removes duplicate paragraphs', () => {
    const line = '用户希望利用极昼进行长时段连续自驾环岛一号公路';
    const out = dedupeRepeatedClarificationParagraphs(`${line}\n\n${line}`);
    expect(out.split('\n').filter(Boolean).length).toBe(1);
  });

  it('buildPhysicalLowerBoundClarificationQuestion is concise and structured', () => {
    const q = buildPhysicalLowerBoundClarificationQuestion(
      { days: 1, destination: '冰岛' } as TripPlanRequest,
      undefined,
      '24小时不间断自驾环岛',
    );
    expect(q.question).toContain('1332');
    expect(q.question).not.toMatch(/Abu|Neptune|三人格/i);
    expect(q.metadata?.structured_clarification).toBeDefined();
    expect((q.options ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('buildMarathonIntakeClarificationQuestion aligns NL 24h with trip calendar days', () => {
    const q = buildMarathonIntakeClarificationQuestion(
      { days: 7, destination: '冰岛' } as TripPlanRequest,
      '6月5日想利用极昼，24小时不间断自驾环岛',
    );
    expect(q.question).toMatch(/1\s*个出行日/);
    expect(q.question).toMatch(/绑定行程档案为\s*7\s*天/);
    expect(q.question).toMatch(/2\.7|日均约\s*2\.7/i);
    expect(q.question).not.toMatch(/按您当前表述.*7\s*个出行日/);
  });

  it('buildMarathonSafetyRhythmZh explains trip 7 vs NL 24h', () => {
    const ctx = resolveMarathonDayClarificationContext(
      { days: 7, destination: '冰岛' } as TripPlanRequest,
      '6月2日24小时不间断自驾环岛',
    );
    const line = buildMarathonSafetyRhythmZh(ctx);
    expect(ctx.calendarsDiverge).toBe(true);
    expect(line).toMatch(/24\s*小时不间断/);
    expect(line).toMatch(/绑定行程档案为\s*7\s*天/);
    expect(line).toMatch(/2\.7/);
  });
});
