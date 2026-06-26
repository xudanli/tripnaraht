/**
 * Apply P5 counterfactual closure onto TripWorldState for the next decision tick.
 */

import type { TripWorldState } from '../../decision/world-model';
import type { DecisionCausalityRecord } from '../decision-causality-v1.types';
import { isDecisionCausalityRecordV1 } from '../decision-causality-v1.types';
import { attachOutcomeToCausalityRecord } from '../../reality-kernel/decision-causality';
import { buildCausalPersonaProjection } from '../persona/build-causal-persona-projection';
import type { CausalCounterfactualReport, CausalCounterfactualSnapshot } from './causal-counterfactual.types';
import { CAUSAL_COUNTERFACTUAL_SNAPSHOT_SCHEMA } from './causal-counterfactual.types';
import {
  buildMinimalReflectiveModelFromHypothesis,
  reviseReflectiveModelFromCounterfactual,
} from './run-causal-counterfactual-closure';

export function attachActualOutcomeToCausalityRecord(
  record: DecisionCausalityRecord,
  report: CausalCounterfactualReport,
): void {
  if (!isDecisionCausalityRecordV1(record) || !record.causal_decision) return;
  record.causal_decision.actualOutcome = report.actualOutcome;
  record.causal_decision.confidenceAfter = report.confidenceAfter;
}

export function applyCounterfactualClosureToWorldState(
  state: TripWorldState,
  report: CausalCounterfactualReport,
): void {
  attachOutcomeToCausalityRecord(state, report.causality_id, {
    decision_outcome_id: `cf_${report.causality_id}`,
    linked_at: report.recorded_at,
  });

  const chain = state.signals.decisionCausalityChain;
  const row = chain?.find((r) => r.causality_id === report.causality_id);
  if (row) {
    attachActualOutcomeToCausalityRecord(row, report);
  }

  if (report.icelandCalibration) {
    state.signals.icelandCausalCalibration = report.icelandCalibration;
  }

  const snapshot: CausalCounterfactualSnapshot = {
    schema: CAUSAL_COUNTERFACTUAL_SNAPSHOT_SCHEMA,
    lastCausalityId: report.causality_id,
    report,
    icelandCalibration: report.icelandCalibration,
  };
  state.signals.causalCounterfactualSnapshot = snapshot;

  const modelBefore =
    state.signals.reflectiveCausalModel ??
    (row ? buildMinimalReflectiveModelFromHypothesis(row) : undefined);
  const modelAfter = reviseReflectiveModelFromCounterfactual(modelBefore, report);
  if (modelAfter) {
    state.signals.reflectiveCausalModel = modelAfter;
  }

  state.signals.causalPersonaProjection =
    buildCausalPersonaProjection({
      worldState: state,
      icelandAssessment: state.signals.icelandSelfDriveCausalAssessment,
      causalityRecord: row,
    }) ?? state.signals.causalPersonaProjection;

  if (!state.signals.alerts) state.signals.alerts = [];
  state.signals.alerts.push({
    code: 'CAUSAL_COUNTERFACTUAL_CLOSED',
    severity: report.drift.severity === 'HIGH' ? 'critical' : 'warn',
    message: report.userFacingAssessment,
  });
}
