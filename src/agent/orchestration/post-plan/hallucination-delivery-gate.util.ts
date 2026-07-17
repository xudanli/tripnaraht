/**
 * Hallucination 交付门：硬事实冲突不得进入 DONE。
 */

import type {
  HallucinationDetectionResult,
  HallucinationMarkedClaim,
} from '../../interfaces/hallucination-detection.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

export const HALLUCINATION_DELIVERY_GATE_SCHEMA_ID =
  'tripnara.hallucination_delivery_gate@v1' as const;

export type HallucinationDeliveryVerdict =
  | 'pass'
  | 'soft_ok'
  | 'hard_fact_conflict'
  | 'detector_missing_with_facts'
  | 'detector_error_with_facts';

export interface HallucinationDeliveryGateV1 {
  schemaId: typeof HALLUCINATION_DELIVERY_GATE_SCHEMA_ID;
  version: 1;
  verdict: HallucinationDeliveryVerdict;
  hard_fact_conflicts: Array<{ text: string; action: string; confidenceLevel: string }>;
  soft_flags: number;
  at: string;
}

function isHardFactConflict(c: HallucinationMarkedClaim): boolean {
  if (c.type !== 'FACT') return false;
  if (c.action === 'REMOVE') return true;
  if (c.confidenceLevel === 'NONE' && c.isHallucinationRisk) return true;
  if (c.action === 'FLAG' && c.confidenceLevel === 'NONE') return true;
  return false;
}

export function narrationLikelyContainsFacts(narration: OrchestratorState['narration']): boolean {
  if (!narration) return false;
  const blobs: string[] = [];
  if (narration.user_friendly_summary) blobs.push(String(narration.user_friendly_summary));
  for (const d of narration.day_by_day_narrative ?? []) {
    if (typeof d === 'string') blobs.push(d);
    else if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      if (o.narrative) blobs.push(String(o.narrative));
      if (o.summary) blobs.push(String(o.summary));
    }
  }
  for (const t of narration.tips ?? []) blobs.push(String(t));
  const text = blobs.join('\n');
  if (text.trim().length < 12) return false;
  // 启发式：含具体数字/地名谓词则视为含 FACT 风险，缺检测器时 fail-closed
  return /(\d+\s*(km|小时|分钟|天|°C|公里)|必须|禁止|开放时间|营业|关门|海拔|开车)/i.test(text);
}

export function evaluateHallucinationDeliveryGate(
  result: HallucinationDetectionResult | null | undefined,
): HallucinationDeliveryGateV1 {
  const at = new Date().toISOString();
  if (!result) {
    return {
      schemaId: HALLUCINATION_DELIVERY_GATE_SCHEMA_ID,
      version: 1,
      verdict: 'pass',
      hard_fact_conflicts: [],
      soft_flags: 0,
      at,
    };
  }

  const hard = (result.hallucinationRisks ?? []).filter(isHardFactConflict);
  const soft = (result.hallucinationRisks ?? []).filter((c) => !isHardFactConflict(c));

  if (hard.length > 0) {
    return {
      schemaId: HALLUCINATION_DELIVERY_GATE_SCHEMA_ID,
      version: 1,
      verdict: 'hard_fact_conflict',
      hard_fact_conflicts: hard.map((c) => ({
        text: String(c.text ?? '').slice(0, 160),
        action: c.action,
        confidenceLevel: c.confidenceLevel,
      })),
      soft_flags: soft.length,
      at,
    };
  }

  return {
    schemaId: HALLUCINATION_DELIVERY_GATE_SCHEMA_ID,
    version: 1,
    verdict: soft.length > 0 ? 'soft_ok' : 'pass',
    hard_fact_conflicts: [],
    soft_flags: soft.length,
    at,
  };
}

export function isHallucinationDeliveryBlocking(
  gate: HallucinationDeliveryGateV1,
): boolean {
  return (
    gate.verdict === 'hard_fact_conflict' ||
    gate.verdict === 'detector_missing_with_facts' ||
    gate.verdict === 'detector_error_with_facts'
  );
}
