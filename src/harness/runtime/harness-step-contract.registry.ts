import { Injectable } from '@nestjs/common';
import {
  HarnessStepContract,
  HarnessStepName,
} from '../contracts/harness-step.types';

const DEFAULT_ON_FAILURE: HarnessStepContract['onFailure'] = {
  level1: 'RETRY',
  level2: 'RETURN_TO_RESEARCH',
  level3: 'BLOCK',
};

@Injectable()
export class HarnessStepContractRegistryService {
  private readonly contracts: Map<HarnessStepName, HarnessStepContract> =
    new Map([
      [
        HarnessStepName.GATE_EVAL,
        {
          name: HarnessStepName.GATE_EVAL,
          allowedTools: [],
          requiredInputPaths: ['userIntent', 'systemState'],
          requiredOutputPaths: [],
          readableStatePaths: ['userIntent', 'tripState', 'environmentState', 'systemState', 'harnessRuntime'],
          writableStatePaths: ['constraints', 'tripState', 'systemState'],
          deterministicValidators: [
            'research-snapshot-present.validator',
            'system-request-id.validator',
          ],
          onFailure: DEFAULT_ON_FAILURE,
        },
      ],
      [
        HarnessStepName.RESEARCH,
        {
          name: HarnessStepName.RESEARCH,
          allowedTools: [],
          requiredInputPaths: ['userIntent', 'systemState'],
          requiredOutputPaths: [],
          readableStatePaths: ['userIntent', 'tripState', 'environmentState', 'systemState'],
          writableStatePaths: ['harnessRuntime'],
          deterministicValidators: [
            'idempotency-key.validator',
            'user-intent-budget.validator',
            'system-request-id.validator',
          ],
          requireIdempotencyKey: true,
          onFailure: DEFAULT_ON_FAILURE,
        },
      ],
      [
        HarnessStepName.PLAN_GEN,
        {
          name: HarnessStepName.PLAN_GEN,
          allowedTools: [],
          requiredInputPaths: ['userIntent', 'constraints'],
          requiredOutputPaths: [],
          readableStatePaths: ['userIntent', 'tripState', 'constraints', 'systemState'],
          writableStatePaths: ['tripState'],
          deterministicValidators: [
            'idempotency-key.validator',
            'user-intent-budget.validator',
            'gate-before-plan.validator',
            'system-request-id.validator',
          ],
          inferentialGraders: ['pacing-heuristic.grader'],
          requireIdempotencyKey: true,
          onFailure: DEFAULT_ON_FAILURE,
        },
      ],
      [
        HarnessStepName.VERIFY,
        {
          name: HarnessStepName.VERIFY,
          allowedTools: [],
          requiredInputPaths: ['tripState'],
          requiredOutputPaths: [],
          readableStatePaths: ['userIntent', 'tripState', 'constraints', 'harnessRuntime', 'systemState'],
          writableStatePaths: ['tripState'],
          deterministicValidators: [
            'evidence-version-binding.validator',
            'system-request-id.validator',
            'itinerary-date-continuity.validator',
            'budget-overrun.validator',
          ],
          inferentialGraders: ['stub-pass.grader'],
          evidenceVersion: {
            statePath: 'harnessRuntime.researchEvidenceSnapshotId',
            bindToProducerStep: HarnessStepName.RESEARCH,
          },
          onFailure: DEFAULT_ON_FAILURE,
        },
      ],
      [
        HarnessStepName.INTAKE,
        {
          name: HarnessStepName.INTAKE,
          allowedTools: [],
          requiredInputPaths: ['userIntent', 'systemState'],
          requiredOutputPaths: [],
          readableStatePaths: ['userIntent', 'tripState', 'environmentState', 'systemState'],
          writableStatePaths: ['userIntent', 'systemState'],
          deterministicValidators: [
            'idempotency-key.validator',
            'user-intent-budget.validator',
            'system-request-id.validator',
          ],
          requireIdempotencyKey: true,
          onFailure: DEFAULT_ON_FAILURE,
        },
      ],
      [
        HarnessStepName.REPAIR,
        {
          name: HarnessStepName.REPAIR,
          allowedTools: [],
          requiredInputPaths: ['tripState', 'systemState'],
          requiredOutputPaths: [],
          readableStatePaths: ['userIntent', 'tripState', 'constraints', 'harnessRuntime', 'systemState'],
          writableStatePaths: ['tripState', 'systemState'],
          deterministicValidators: ['idempotency-key.validator', 'system-request-id.validator'],
          requireIdempotencyKey: true,
          onFailure: DEFAULT_ON_FAILURE,
        },
      ],
      [
        HarnessStepName.NARRATE,
        {
          name: HarnessStepName.NARRATE,
          allowedTools: [],
          requiredInputPaths: ['tripState'],
          requiredOutputPaths: [],
          readableStatePaths: ['userIntent', 'tripState', 'constraints', 'harnessRuntime', 'systemState'],
          writableStatePaths: [],
          deterministicValidators: ['idempotency-key.validator', 'system-request-id.validator'],
          requireIdempotencyKey: true,
          onFailure: DEFAULT_ON_FAILURE,
        },
      ],
    ]);

  getContract(step: HarnessStepName): HarnessStepContract | undefined {
    return this.contracts.get(step);
  }

  listRegisteredSteps(): HarnessStepName[] {
    return [...this.contracts.keys()];
  }
}
