/**
 * PD-8.3 — Feature flag matrix for Proactive Decision canary.
 * Write chains stay closed until explicit sign-off.
 */

import { isProactiveDecisionV1Enabled } from '../config/proactive-decision-feature-flags.util';
import {
  isProactiveDecisionCgusSearchEnabled,
  isProactiveDecisionSynthesisEnabled,
} from '../config/proactive-decision-synthesis-flags.util';

export type ProactiveDecisionFlagMatrixV1 = {
  schemaId: 'nara.proactive_decision_flag_matrix@v1';
  version: 1;
  proactiveV1Enabled: boolean;
  synthesisEnabled: boolean;
  cgusSearchEnabled: boolean;
  /** ERC may show PD projections */
  ercProjectionEnabled: boolean;
  /** Confirm/Apply write via RFC001 — default false */
  confirmApplyWriteEnabled: boolean;
  pushNotifyEnabled: false;
  autoApplyEnabled: false;
};

export function resolveProactiveDecisionFlagMatrix(
  env: NodeJS.ProcessEnv = process.env,
): ProactiveDecisionFlagMatrixV1 {
  const proactiveV1Enabled = isProactiveDecisionV1Enabled(env);
  const synthesisEnabled = isProactiveDecisionSynthesisEnabled(env);
  const cgusSearchEnabled = isProactiveDecisionCgusSearchEnabled(env);

  const ercRaw = env.PROACTIVE_DECISION_ERC_PROJECTION_ENABLED?.trim().toLowerCase();
  // Default: follow PD V1 (projection is read-only / safe)
  const ercProjectionEnabled =
    proactiveV1Enabled &&
    !(ercRaw === '0' || ercRaw === 'false' || ercRaw === 'no');

  const writeRaw =
    env.PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED?.trim().toLowerCase();
  const confirmApplyWriteEnabled =
    proactiveV1Enabled &&
    (writeRaw === '1' || writeRaw === 'true' || writeRaw === 'yes');

  return {
    schemaId: 'nara.proactive_decision_flag_matrix@v1',
    version: 1,
    proactiveV1Enabled,
    synthesisEnabled,
    cgusSearchEnabled,
    ercProjectionEnabled,
    confirmApplyWriteEnabled,
    pushNotifyEnabled: false,
    autoApplyEnabled: false,
  };
}
