import { Test } from '@nestjs/testing';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { HarnessModule } from '../harness.module';
import { HarnessStepName } from '../contracts/harness-step.types';
import { HarnessStepContractRegistryService } from './harness-step-contract.registry';
import { HarnessStateProjectionService } from './state-projection.service';

function minimalDso(over?: Partial<DecisionState>): DecisionState {
  return {
    userIntent: {},
    tripState: {},
    environmentState: {},
    systemState: { requestId: 'req-proj-1' },
    ...over,
  } as DecisionState;
}

describe('HarnessStateProjectionService', () => {
  let projection: HarnessStateProjectionService;
  let registry: HarnessStepContractRegistryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    projection = moduleRef.get(HarnessStateProjectionService);
    registry = moduleRef.get(HarnessStepContractRegistryService);
  });

  it('VERIFY visibleState only exposes contract paths + boundResearchSnapshotId（方案三.2 隔离）', () => {
    const full = minimalDso({
      userIntent: { destination: 'IS' },
      tripState: { planVersion: 1 },
      environmentState: { shouldNotLeak: true },
      constraints: { feasible: true, violations: [], gateOutcome: 'ALLOW' },
      harnessRuntime: { researchEvidenceSnapshotId: 'snap-v1' },
      confidence: 0.95,
    });
    const contract = registry.getContract(HarnessStepName.VERIFY)!;
    const ctx = projection.project(HarnessStepName.VERIFY, full, contract, {
      traceId: 't-proj',
      requestId: 'req-proj-1',
    });
    const keys = Object.keys(ctx.visibleState as object).sort();
    expect(keys).toEqual(
      [
        'boundResearchSnapshotId',
        'constraints',
        'harnessRuntime',
        'systemState',
        'tripState',
        'userIntent',
      ].sort(),
    );
    expect((ctx.visibleState as Record<string, unknown>).environmentState).toBeUndefined();
    expect((ctx.visibleState as Record<string, unknown>).confidence).toBeUndefined();
    expect((ctx.visibleState as Record<string, unknown>).boundResearchSnapshotId).toBe('snap-v1');
  });

  it('metadata carries graderModel and executorModel from params', () => {
    const full = minimalDso({
      harnessRuntime: { researchEvidenceSnapshotId: 's' },
    });
    const contract = registry.getContract(HarnessStepName.VERIFY)!;
    const ctx = projection.project(HarnessStepName.VERIFY, full, contract, {
      traceId: 't-meta',
      requestId: 'req-proj-1',
      graderModel: 'grader-test',
      executorModel: 'executor-test',
    });
    expect(ctx.metadata.graderModel).toBe('grader-test');
    expect(ctx.metadata.executorModel).toBe('executor-test');
  });
});
