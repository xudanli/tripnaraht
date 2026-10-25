/**
 * Assemble Mobile Proactive Decision surface from trip metadata snapshot + canary.
 * L1 = passive banner；L2 = High-Value interrupt；未达 High-Value 时 L2 降级为 L1。
 */

import type { MobileProactiveDecisionSurfaceDto } from '../../../mobile/dto/mobile-proactive-decision.types';
import { MOBILE_PROACTIVE_DECISION_SURFACE_SCHEMA } from '../../../mobile/dto/mobile-proactive-decision.types';
import {
  resolveProactiveCanaryConfig,
  shouldSurfaceProactiveL1Passive,
  shouldSurfaceProactiveL2Interrupt,
} from '../config/proactive-canary-config.util';
import { evaluateProactiveL2HighValue } from '../config/proactive-l2-high-value-gate.util';
import { resolveProactiveDecisionFlagMatrix } from '../config/proactive-decision-flag-matrix.util';
import { readProactiveDecisionSurfaceSnapshot } from './proactive-decision-surface-snapshot.util';
import { buildProactiveL1PassiveBanner } from './build-proactive-l1-passive-banner.util';

export function assembleMobileProactiveDecisionSurface(input: {
  tripId: string;
  metadata: unknown;
  env?: NodeJS.ProcessEnv;
}): MobileProactiveDecisionSurfaceDto {
  const env = input.env ?? process.env;
  const canary = resolveProactiveCanaryConfig(env);
  const flags = resolveProactiveDecisionFlagMatrix(env);
  const snap = readProactiveDecisionSurfaceSnapshot(input.metadata);

  const gate = snap?.intervention?.gate ?? null;
  const notifyOk = gate === 'NOTIFY_CARD';

  const highValue = evaluateProactiveL2HighValue({
    interventionValue: snap?.intervention?.value.interventionValue ?? 0,
    confidence: snap?.synthesis?.confidence ?? 0,
    actionability: snap?.synthesis?.actionability ?? 0,
    env,
  });

  const gateInput = {
    config: canary,
    tripId: input.tripId,
    gate: (gate ?? 'SILENT_LEARNING') as 'NOTIFY_CARD' | 'SILENT_LEARNING',
  };

  const shouldL2 =
    notifyOk &&
    shouldSurfaceProactiveL2Interrupt({
      ...gateInput,
      highValueOk: highValue.ok,
    });

  /** L1 stage，或 L2 未达 High-Value 时降级为被动条带（不强打断） */
  const shouldL1 =
    notifyOk &&
    (shouldSurfaceProactiveL1Passive(gateInput) ||
      (canary.stage === 'L2_IN_APP_INTERRUPT' &&
        !shouldL2 &&
        shouldSurfaceProactiveL2Interrupt({
          ...gateInput,
          highValueOk: true, // audience+stage only
        })));

  const l1PassiveBanner = shouldL1
    ? buildProactiveL1PassiveBanner({
        tripId: input.tripId,
        caseId: snap?.impact.caseId ?? null,
        decisionProblemId: snap?.decisionProblemId ?? null,
        card: snap?.intervention?.card ?? null,
        decisionTrace: snap?.decisionTrace ?? null,
      })
    : null;

  return {
    schemaId: MOBILE_PROACTIVE_DECISION_SURFACE_SCHEMA,
    version: 1,
    tripId: input.tripId,
    canaryStage: canary.stage,
    shouldRenderL1Passive: shouldL1,
    shouldRenderCard: shouldL2,
    l1PassiveBanner,
    reminderCard: shouldL2 ? snap?.intervention?.card ?? null : null,
    changeDraft:
      shouldL1 || shouldL2 ? snap?.changeDraft ?? null : null,
    ercProjection:
      flags.ercProjectionEnabled && snap?.ercProjection
        ? snap.ercProjection
        : null,
    decisionProblemId: snap?.decisionProblemId ?? null,
    interventionGate: gate,
    decisionTrace: snap?.decisionTrace ?? null,
    l2HighValue: notifyOk
      ? {
          ok: highValue.ok,
          interventionValue: highValue.interventionValue,
          confidence: highValue.confidence,
          actionability: highValue.actionability,
          reasonsZh: highValue.reasonsZh,
        }
      : null,
    flags: {
      pushEnabled: false,
      autoApplyEnabled: false,
      confirmApplyWriteEnabled: flags.confirmApplyWriteEnabled,
      ercProjectionEnabled: flags.ercProjectionEnabled,
    },
    updatedAt: snap?.updatedAt ?? null,
  };
}
