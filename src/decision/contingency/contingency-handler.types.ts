import type { ContingencyPathId, SloOutcome } from '../slo/decision-os-slo.types';

export interface ContingencyHandlerResult {
  outcome?: SloOutcome;
  payload?: unknown;
  humanAssisted?: boolean;
}

export interface ContingencyHandler {
  pathId: ContingencyPathId;
  trigger(
    tripId: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<ContingencyHandlerResult | void>;
}

export interface ContingencyTriggerResponse {
  pathId: ContingencyPathId;
  outcome: SloOutcome;
  payload?: unknown;
}
