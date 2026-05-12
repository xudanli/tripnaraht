/**
 * P16-B — Execution economy: unified cost / value envelopes over DAG-shaped executions.
 */

export interface ExecutionResourceState {
  timeCost: number;
  moneyCost: number;
  energyCost: number;
  riskCost: number;
  opportunityCost: number;
}

export interface ExecutionValue {
  auroraValue: number;
  experienceValue: number;
  stabilityValue: number;
  completionValue: number;
}
