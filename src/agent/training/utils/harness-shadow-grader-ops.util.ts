import type { ShadowAdapterRegistration } from '../interfaces/shadow-deployment.types';
import { isDecisionTrajectoryCaptureEnabled } from './decision-trajectory-feature.util';
import { parseHarnessShadowGraderEnabled } from './harness-shadow-grader-mode.util';

export interface ShadowGraderOpsReadinessV1 {
  ready: boolean;
  blockers: string[];
  grader_enabled: boolean;
  trajectory_capture_enabled: boolean;
}

export interface ShadowGraderRegistrationSummaryV1 {
  shadow_version: string;
  task_id: string;
  lifecycle: ShadowAdapterRegistration['lifecycle'];
  registered_at: string;
  lora_loaded: boolean;
}

export function buildShadowGraderOpsReadiness(params?: {
  graderEnabled?: boolean;
  trajectoryCaptureEnabled?: boolean;
  activeShadow?: ShadowAdapterRegistration | null;
}): ShadowGraderOpsReadinessV1 {
  const graderEnabled = params?.graderEnabled ?? parseHarnessShadowGraderEnabled();
  const trajectoryCaptureEnabled =
    params?.trajectoryCaptureEnabled ?? isDecisionTrajectoryCaptureEnabled();
  const activeShadow = params?.activeShadow ?? null;

  const blockers: string[] = [];
  if (!graderEnabled) blockers.push('HARNESS_SHADOW_GRADER_off');
  if (!trajectoryCaptureEnabled) blockers.push('DECISION_TRAJECTORY_ENABLED_off');
  if (!activeShadow) {
    blockers.push('no_active_shadow');
  } else if (activeShadow.lifecycle !== 'ACTIVE' && activeShadow.lifecycle !== 'PROMOTION_READY') {
    blockers.push(`shadow_lifecycle_${activeShadow.lifecycle}`);
  }

  return {
    ready: blockers.length === 0,
    blockers,
    grader_enabled: graderEnabled,
    trajectory_capture_enabled: trajectoryCaptureEnabled,
  };
}

export function summarizeShadowRegistrations(
  registrations: ShadowAdapterRegistration[],
): ShadowGraderRegistrationSummaryV1[] {
  return registrations.map((r) => ({
    shadow_version: r.shadowVersion,
    task_id: r.taskId,
    lifecycle: r.lifecycle,
    registered_at: r.registeredAt,
    lora_loaded: r.loraLoaded,
  }));
}
