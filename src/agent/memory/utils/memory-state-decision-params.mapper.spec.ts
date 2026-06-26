import { applyMemoryStateV1ToDecisionParams, mapMemoryStateToDecisionParams } from './memory-state-decision-params.mapper';
import { createDefaultDecisionParams } from '../interfaces/decision-params.interface';
import type { MemoryStateV1 } from '../schemas/memory-state.schema.v1';
import { MEMORY_STATE_SCHEMA_VERSION } from '../schemas/memory-state.schema.v1';

describe('memory-state-decision-params.mapper', () => {
  const baseMemory: MemoryStateV1 = {
    schemaVersion: MEMORY_STATE_SCHEMA_VERSION,
    userId: 'u1',
    longTerm: {
      'preference.cost_sensitivity': {
        value: 'HIGH',
        confidence: 0.8,
        provenance: {
          source: 'ROLLBACK_AGGREGATE',
          signalTier: 'IMPLICIT_WITH_CONSENT',
          capturedAt: '2026-06-01T00:00:00.000Z',
        },
        updatedAt: '2026-06-01T00:00:00.000Z',
        halfLifeDays: 180,
      },
      'decision.bias.dominant_alternative': {
        value: 'UPGRADE_TO_DRIVE',
        confidence: 0.7,
        provenance: {
          source: 'ROLLBACK_AGGREGATE',
          signalTier: 'IMPLICIT_WITH_CONSENT',
          capturedAt: '2026-06-01T00:00:00.000Z',
        },
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    },
    updatedAt: '2026-06-01T00:00:00.000Z',
  };

  it('returns unchanged params when memory is null', () => {
    const params = createDefaultDecisionParams();
    const { audit } = applyMemoryStateV1ToDecisionParams(params, null);
    expect(audit).toHaveLength(0);
    expect(params.strategyPreference.abuWeight).toBe(0.33);
  });

  it('applies cost sensitivity and bias overlays', () => {
    const params = createDefaultDecisionParams();
    const { audit } = applyMemoryStateV1ToDecisionParams(
      params,
      baseMemory,
      new Date('2026-06-15T00:00:00.000Z'),
    );
    expect(audit.length).toBeGreaterThan(0);
    expect(params.strategyPreference.abuWeight).toBeGreaterThan(0.33);
    expect(params.repairPolicy.preferAltRoute).toBe(true);
  });

  it('skips forbidden signal tier fields', () => {
    const memory: MemoryStateV1 = {
      ...baseMemory,
      longTerm: {
        'preference.cost_sensitivity': {
          ...baseMemory.longTerm['preference.cost_sensitivity'],
          provenance: {
            source: 'INFERRED_TRAIT',
            signalTier: 'FORBIDDEN',
            capturedAt: '2026-06-01T00:00:00.000Z',
          },
        },
      },
    };
    const { audit } = mapMemoryStateToDecisionParams(memory);
    expect(audit.find((a) => a.memoryField === 'preference.cost_sensitivity')).toBeUndefined();
  });
});
