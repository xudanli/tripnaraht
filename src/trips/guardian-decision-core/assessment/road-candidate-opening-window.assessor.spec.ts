import {
  assessRoadCandidateOpeningWindow,
  ROAD_OPENING_WINDOW_REASON,
} from './road-candidate-opening-window.assessor';

describe('road-candidate-opening-window.assessor', () => {
  const window = {
    lastEntryAt: '16:00',
    closesAt: '18:00',
    timezone: 'Atlantic/Reykjavik',
  };

  it('skips when no hard window', () => {
    const result = assessRoadCandidateOpeningWindow({
      referenceArrivalIso: '2026-02-15T14:00:00.000Z',
      addedDurationMinutes: 90,
      window: null,
    });
    expect(result.result).toBe('NO_HARD_WINDOW');
    expect(result.infeasible).toBe(false);
    expect(result.reasonCodes).toContain(ROAD_OPENING_WINDOW_REASON.NO_HARD_WINDOW);
  });

  it('PASS when detour still arrives before lastEntryAt', () => {
    const result = assessRoadCandidateOpeningWindow({
      referenceArrivalIso: '2026-02-15T14:00:00.000Z',
      addedDurationMinutes: 60,
      window,
    });
    expect(result.result).toBe('FEASIBLE');
    expect(result.infeasible).toBe(false);
  });

  it('BLOCK when detour ETA misses lastEntryAt', () => {
    const result = assessRoadCandidateOpeningWindow({
      referenceArrivalIso: '2026-02-15T15:30:00.000Z',
      addedDurationMinutes: 45,
      window,
    });
    expect(result.result).toBe('WINDOW_MISSED');
    expect(result.infeasible).toBe(true);
    expect(result.reasonCodes).toContain(ROAD_OPENING_WINDOW_REASON.WINDOW_MISSED);
    expect(result.reasonCodes).toContain('TIME_WINDOW_INFEASIBLE');
  });

  it('AT_RISK when slack ≤ 15 minutes after detour', () => {
    const result = assessRoadCandidateOpeningWindow({
      referenceArrivalIso: '2026-02-15T15:40:00.000Z',
      addedDurationMinutes: 10,
      window,
    });
    expect(result.result).toBe('AT_RISK');
    expect(result.infeasible).toBe(false);
  });
});
