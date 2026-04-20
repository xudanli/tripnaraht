import { Injectable } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import {
  HarnessStepName,
  type HarnessStepContract,
} from '../contracts/harness-step.types';
import type { HarnessExecutionContext } from './execution-context.types';
import { getAtPath } from '../lib/dso-path.util';

export interface HarnessProjectParams {
  traceId: string;
  requestId: string;
  idempotencyKey?: string;
  attempt?: number;
  actor?: string;
  model?: string;
  executorModel?: string;
  graderModel?: string;
}

@Injectable()
export class HarnessStateProjectionService {
  project(
    step: HarnessStepName,
    fullState: DecisionState,
    contract: HarnessStepContract,
    params: HarnessProjectParams,
  ): HarnessExecutionContext {
    const visible: Record<string, unknown> = {};
    for (const p of contract.readableStatePaths) {
      const key = p.includes('.') ? p.replace(/\./g, '_') : p;
      visible[key] = getAtPath(fullState, p);
    }
    /** VERIFY：显式绑定 RESEARCH 冻结的快照 id（P0 evidence-version-binding） */
    if (step === HarnessStepName.VERIFY) {
      visible.boundResearchSnapshotId =
        fullState.harnessRuntime?.researchEvidenceSnapshotId;
    }
    return {
      traceId: params.traceId,
      requestId: params.requestId,
      step,
      visibleState: visible,
      visibleEvidence: [],
      allowedTools: contract.allowedTools,
      writableStatePaths: contract.writableStatePaths,
      metadata: {
        startedAt: new Date().toISOString(),
        actor: params.actor ?? 'harness',
        model: params.model,
        executorModel: params.executorModel,
        graderModel: params.graderModel,
        idempotencyKey: params.idempotencyKey,
        attempt: params.attempt,
      },
    };
  }
}
