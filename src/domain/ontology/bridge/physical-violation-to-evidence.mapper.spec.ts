import { ViolationCode } from '../validator/physical-validator.constants';
import {
  physicalViolationToEvidence,
  resolveCascadeTriggerFromPhysicalViolations,
} from './physical-violation-to-evidence.mapper';

describe('physical-violation-to-evidence', () => {
  const evaluatedAt = '2026-06-15T10:00:00.000Z';

  it('maps SEGMENT_ROAD_CLOSED to ROAD evidence', () => {
    const envelope = physicalViolationToEvidence(
      {
        code: ViolationCode.SEGMENT_ROAD_CLOSED,
        severity: 'BLOCK',
        detail: 'F-road F208 closed at segment seg-1',
      },
      { evaluatedAt, segmentId: 'seg-1' },
    );

    expect(envelope?.factType).toBe('ROAD');
    expect(envelope?.entityRef.id).toBe('seg-1');
    expect((envelope?.value as any)?.isOpen).toBe(false);
    expect((envelope?.value as any)?.metadata?.isFroad).toBe(true);
    expect(envelope?.source).toBe('physical_validator');
    expect(envelope?.createdAt).toBe(evaluatedAt);
  });

  it('maps POI_CLOSED_AT_ETA to OPENING_HOURS evidence', () => {
    const envelope = physicalViolationToEvidence(
      {
        code: ViolationCode.POI_CLOSED_AT_ETA,
        severity: 'WARN',
        detail: 'POI closed at ETA',
      },
      { evaluatedAt, poiId: 'poi-42' },
    );

    expect(envelope?.factType).toBe('OPENING_HOURS');
    expect(envelope?.entityRef.kind).toBe('POI');
  });

  it('returns null for non-cascade violations', () => {
    const envelope = physicalViolationToEvidence({
      code: ViolationCode.TRAVEL_ONTOLOGY_BUDGET,
      severity: 'WARN',
      detail: 'budget exceeded',
    });
    expect(envelope).toBeNull();
  });

  it('resolves highest-priority violation from a list', () => {
    const trigger = resolveCascadeTriggerFromPhysicalViolations(
      [
        {
          code: ViolationCode.TRAVEL_ONTOLOGY_BUDGET,
          severity: 'WARN',
          detail: 'budget',
        },
        {
          code: ViolationCode.SEGMENT_SEASONALLY_CLOSED,
          severity: 'BLOCK',
          detail: 'F-road seasonal closure',
        },
      ],
      { evaluatedAt },
    );

    expect(trigger?.factType).toBe('ROAD');
    expect((trigger?.value as any)?.metadata?.violationCode).toBe(
      ViolationCode.SEGMENT_SEASONALLY_CLOSED,
    );
  });
});
