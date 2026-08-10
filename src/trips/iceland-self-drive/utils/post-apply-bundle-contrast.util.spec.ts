/**
 * Post-Apply buildBundle contrast util — unit tests.
 */

import { contrastPostApplyBundle } from './post-apply-bundle-contrast.util';
import type { UnifiedConstraintAssessmentBundle } from '../../../decision-runtime/constraints/contracts/unified-constraint-assessment.types';

function emptyBundle(
  items: UnifiedConstraintAssessmentBundle['items'] = [],
): UnifiedConstraintAssessmentBundle {
  return {
    schemaId: 'tripnara.unified_constraint_assessment_bundle@v1',
    tripId: 't1',
    generatedAt: new Date().toISOString(),
    contextVersion: {
      tripId: 't1',
      revision: '1',
      countryCode: 'IS',
    } as any,
    items,
    meta: { itemCount: items.length },
  };
}

describe('contrastPostApplyBundle', () => {
  it('aligns when shadow allowConfirm and bundle has no blocks', () => {
    const report = contrastPostApplyBundle({
      prismaTripId: 't1',
      proposalId: 'p1',
      shadowAllowConfirmAtVerify: true,
      bundle: emptyBundle([
        {
          constraintKey: 'MAX_DAILY_DRIVE',
          contextVersion: {} as any,
          evaluatedAt: new Date().toISOString(),
          lanes: { planning: null, executability: null, runtime: null },
          aggregateStatus: 'PASS',
        },
      ]),
    });
    expect(report.bundle.allowConfirmProjection).toBe(true);
    expect(report.gateAlignedWithShadow).toBe(true);
    expect(report.doesNotAffectCapabilities).toBe(true);
  });

  it('detects drift when shadow allowed confirm but bundle has PLANNING_BLOCK', () => {
    const report = contrastPostApplyBundle({
      prismaTripId: 't1',
      proposalId: 'p1',
      shadowAllowConfirmAtVerify: true,
      bundle: emptyBundle([
        {
          constraintKey: 'OFFICIAL_IS_FROAD_2WD',
          contextVersion: {} as any,
          evaluatedAt: new Date().toISOString(),
          lanes: { planning: null, executability: null, runtime: null },
          aggregateStatus: 'PLANNING_BLOCK',
        },
      ]),
    });
    expect(report.bundle.allowConfirmProjection).toBe(false);
    expect(report.gateAlignedWithShadow).toBe(false);
    expect(report.bundle.blockingKeys).toContain('OFFICIAL_IS_FROAD_2WD');
  });
});
