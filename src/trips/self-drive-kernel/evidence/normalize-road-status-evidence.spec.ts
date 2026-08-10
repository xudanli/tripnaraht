import type { RoadStatus } from '../../../data-contracts/interfaces/road-status.interface';
import { normalizeRoadStatusEvidence } from './normalize-road-status-evidence';

describe('normalizeRoadStatusEvidence', () => {
  it('marks CN seasonal advisory as PARTIAL and not strong-judgment', () => {
    const road: RoadStatus = {
      isOpen: true,
      riskLevel: 2,
      reason: '雨季塌方风险',
      lastUpdated: new Date('2026-07-01T00:00:00Z'),
      source: 'cn.seasonal-advisory',
      metadata: {
        roadStatus: 'RESTRICTED',
        evidenceGrade: 'seasonal_static',
        realtime: false,
      },
    };

    const ev = normalizeRoadStatusEvidence({
      road,
      segmentId: 'seg:cn.route.g318:d1:a-b-0',
      nowMs: Date.parse('2026-07-01T12:00:00Z'),
    });

    expect(ev.status).toBe('RESTRICTED');
    expect(ev.freshness).toBe('PARTIAL');
    expect(ev.strongJudgmentAllowed).toBe(false);
    expect(ev.confidence).toBe(0.55);
  });

  it('marks road.is open as FRESH strong-judgment eligible', () => {
    const road: RoadStatus = {
      isOpen: true,
      riskLevel: 0,
      lastUpdated: new Date('2026-07-01T11:30:00Z'),
      source: 'road.is',
    };

    const ev = normalizeRoadStatusEvidence({
      road,
      segmentId: 'seg-is-f208',
      nowMs: Date.parse('2026-07-01T12:00:00Z'),
    });

    expect(ev.status).toBe('OPEN');
    expect(ev.freshness).toBe('FRESH');
    expect(ev.strongJudgmentAllowed).toBe(true);
    expect(ev.confidence).toBeGreaterThanOrEqual(0.85);
  });
});
