import { OperationalSeverity } from '../../contracts/operational-severity.contract';
import { sliceFromSafetravelOutput } from './iceland-slice-normalizer';

describe('iceland-slice-normalizer', () => {
  it('maps SafeTravel BLOCK gate to BLOCKED severity', () => {
    const s = sliceFromSafetravelOutput({
      gate_recommendation: 'BLOCK',
      summary: 'x',
      alerts: [],
      rss_refined: [],
      safetravel_alerts: [],
      lastUpdated: 't',
      source: 'safetravel.is/feed',
    });
    expect(s.severity).toBe(OperationalSeverity.BLOCKED);
    expect(s.type).toBe('iceland.safetravel.advisories');
    expect(s.structured.gate_recommendation).toBe('BLOCK');
  });
});
