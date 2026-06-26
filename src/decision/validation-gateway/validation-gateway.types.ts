import type { DecisionState, VerificationIssue } from '../kernel/decision-state.types';
import type { PhaseExecutorContext } from '../kernel/interfaces/phase-executor.interface';
import type { ValidationRunMetric, ValidationStageMetric } from '../slo/decision-os-slo.types';

export interface ValidationGatewayRunInput {
  dso: DecisionState;
  ctx: PhaseExecutorContext;
  /** 默认 true：写入 DecisionOsSloService */
  recordSlo?: boolean;
}

export interface ValidationGatewayRunResult {
  issues: VerificationIssue[];
  confidenceDelta: number;
  passed: boolean;
  hasFatal: boolean;
  hasConflict: boolean;
  stages: ValidationStageMetric[];
  durationMs: number;
  metric?: ValidationRunMetric;
}

export type ValidationStageRunner = (input: {
  dso: DecisionState;
  ctx: PhaseExecutorContext;
  issues: VerificationIssue[];
  confidenceDelta: number;
}) => Promise<{
  issues: VerificationIssue[];
  confidenceDelta: number;
  skipped?: boolean;
  error?: string;
}>;
