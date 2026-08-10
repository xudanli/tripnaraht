/**
 * Gateway + peer ingress wiring for contrast (Nest TestingModule).
 */

import { Test } from '@nestjs/testing';
import { IcelandShadowUnifiedAssessmentService } from './iceland-shadow-unified-assessment.service';
import { IcelandShadowVsPlatformContrastService } from './iceland-shadow-vs-platform-contrast.service';
import { ConstraintEvaluationGatewayService } from '../../../decision-runtime/constraints/constraint-evaluation.gateway.service';
import { ConstraintFailurePolicyService } from '../../../decision-runtime/constraints/failure-policy.service';
import { LegacyConstraintCheckerAdapter } from '../../../decision-runtime/constraints/providers/legacy-checker.provider';
import { GuardianConstraintProvider } from '../../../decision-runtime/constraints/providers/guardian-constraint.provider';
import { DestinationPackConstraintProvider } from '../../../decision-runtime/constraints/providers/destination-pack.provider';
import { OntologyConstraintProvider } from '../../../decision-runtime/constraints/providers/ontology-constraint.provider';
import { fixtureGoldenCirclePass, fixtureHighlandsFroad2wdBlock } from '../fixtures/golden-contrast.fixtures';

describe('IcelandShadowVsPlatformContrastService + Gateway', () => {
  let svc: IcelandShadowVsPlatformContrastService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        IcelandShadowUnifiedAssessmentService,
        IcelandShadowVsPlatformContrastService,
        ConstraintEvaluationGatewayService,
        ConstraintFailurePolicyService,
        GuardianConstraintProvider,
        DestinationPackConstraintProvider,
        {
          provide: LegacyConstraintCheckerAdapter,
          useValue: { evaluate: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: OntologyConstraintProvider,
          useValue: { evaluate: jest.fn().mockReturnValue([]) },
        },
      ],
    }).compile();

    svc = module.get(IcelandShadowVsPlatformContrastService);
  });

  it('golden_circle: Gateway FEASIBLE; no false Confirm drift', async () => {
    const { fixtureId, snapshot } = fixtureGoldenCirclePass();
    const report = await svc.contrastAsync({ snapshot, fixtureId });

    expect(report.gateAligned).toBe(true);
    expect(report.iceland.allowConfirm).toBe(true);
    expect(report.platform.gateway).toBeDefined();
    expect(report.platform.gateway!.overallStatus).toBe('FEASIBLE');
    expect(report.platform.gateway!.gateCompareSkipped).toBe(false);
    expect(report.platform.gateway!.allowConfirm).toBe(true);
    expect(report.gateAlignedWithGateway).toBe(true);
  });

  it('contrastAsync attaches gateway leg with peer ingress on F-road block', async () => {
    const { fixtureId, snapshot } = fixtureHighlandsFroad2wdBlock();
    const report = await svc.contrastAsync({ snapshot, fixtureId });

    expect(report.gateAligned).toBe(true);
    expect(report.iceland.allowConfirm).toBe(false);
    expect(report.platform.gateway).toBeDefined();
    expect(report.platform.gateway!.peerIngressAssertionCount).toBeGreaterThan(0);
    expect(report.platform.gateway!.allowConfirm).toBe(false);
    expect(report.platform.gateway!.gateCompareSkipped).toBe(false);
    expect(report.gateAlignedWithGateway).toBe(true);
    expect(report.platform.gateway!.overallStatus).toBe('INFEASIBLE');
  });
});
