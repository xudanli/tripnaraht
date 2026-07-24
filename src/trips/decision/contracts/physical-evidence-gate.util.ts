/**
 * TD-04 扩展：PHYSICAL 决策 evidenceRefs 分级门禁。
 *
 * | PHYSICAL_EVIDENCE_GATE | 行为 |
 * |------------------------|------|
 * | warn（默认）           | 缺 evidenceRefs → warnings |
 * | error                  | 任意 PHYSICAL → errors |
 * | error_critical_stages  | DEM_EVIDENCE / ABU_GATE / SPATIAL_REPAIR + critical action → errors |
 */

import type { DecisionLogEntry } from '../shared/decision-result.types';
import { isCriticalDecisionActionValue } from '../shared/decision-log-metadata-prd.types';

export type PhysicalEvidenceGateMode = 'warn' | 'error' | 'error_critical_stages';

const CRITICAL_PHYSICAL_STAGES = new Set<DecisionLogEntry['decisionStage']>([
  'DEM_EVIDENCE',
  'ABU_GATE',
  'SPATIAL_REPAIR',
]);

export function parsePhysicalEvidenceGateMode(raw: string | undefined): PhysicalEvidenceGateMode {
  const v = (raw ?? 'warn').trim().toLowerCase();
  if (v === 'error' || v === 'error_critical_stages') return v;
  return 'warn';
}

/** 读取 `PHYSICAL_EVIDENCE_GATE`（默认 warn）。 */
export function getPhysicalEvidenceGateMode(): PhysicalEvidenceGateMode {
  return parsePhysicalEvidenceGateMode(process.env.PHYSICAL_EVIDENCE_GATE);
}

export function hasPhysicalEvidenceRefs(entry: Pick<DecisionLogEntry, 'evidenceRefs'>): boolean {
  return Array.isArray(entry.evidenceRefs) && entry.evidenceRefs.length > 0;
}

/**
 * 当前 gate 模式下，该条目是否必须带 evidenceRefs（否则应升级为 error）。
 */
export function requiresPhysicalEvidenceRefs(
  entry: Pick<DecisionLogEntry, 'decisionSource' | 'decisionStage' | 'action'>,
  mode: PhysicalEvidenceGateMode,
): boolean {
  if (entry.decisionSource !== 'PHYSICAL') return false;
  if (mode === 'warn') return false;
  if (mode === 'error') return true;
  return (
    CRITICAL_PHYSICAL_STAGES.has(entry.decisionStage) &&
    isCriticalDecisionActionValue(entry.action)
  );
}

export function physicalEvidenceGateErrorMessage(index: number, mode: PhysicalEvidenceGateMode): string {
  return (
    `entry [${index}]: PHYSICAL decisionSource requires evidenceRefs ` +
    `(PHYSICAL_EVIDENCE_GATE=${mode})`
  );
}
