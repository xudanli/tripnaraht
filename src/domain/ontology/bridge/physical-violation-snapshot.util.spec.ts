import {
  buildTripPhysicalValidationSnapshot,
  extractTripPhysicalValidationSnapshot,
  mergeTripPhysicalValidationSnapshot,
} from './physical-violation-snapshot.util';
import { ViolationCode } from '../validator/physical-validator.constants';

describe('physical-violation-snapshot', () => {
  it('builds and extracts snapshot from trip metadata', () => {
    const snapshot = buildTripPhysicalValidationSnapshot(
      {
        validator_version: 'v1',
        rule_bundle_id: 'bundle',
        violations: [{ code: ViolationCode.SEGMENT_ROAD_CLOSED, severity: 'BLOCK', detail: 'closed' }],
        evaluated_at: '2026-06-15T10:00:00.000Z',
        blocking: true,
      },
      {
        actionInput: { physical_domain: { segment_id: 'seg-1' } },
        source: 'action_preview',
      },
    );

    const merged = mergeTripPhysicalValidationSnapshot({}, snapshot);
    const extracted = extractTripPhysicalValidationSnapshot(merged);
    expect(extracted?.violations).toHaveLength(1);
    expect(extracted?.context?.segmentId).toBe('seg-1');
    expect(extracted?.source).toBe('action_preview');
  });
});
