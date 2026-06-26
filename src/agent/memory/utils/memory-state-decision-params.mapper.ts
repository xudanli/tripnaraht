import {
  createDefaultDecisionParams,
  normalizeDecisionParams,
  type DecisionParams,
} from '../interfaces/decision-params.interface';
import type { KnobApplication } from '../registry/decision-knob.registry';
import type { MemoryFieldValue, MemoryStateV1 } from '../schemas/memory-state.schema.v1';

export type MemoryStateKnobAudit = KnobApplication & { memoryField: string };

const MIN_CONFIDENCE = 0.35;

function effectiveStrength(field: MemoryFieldValue<unknown>, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(field.updatedAt).getTime()) / 86_400_000);
  const halfLife = field.halfLifeDays ?? 365;
  const decay = Math.pow(0.5, ageDays / halfLife);
  return Math.max(0, Math.min(1, field.confidence * decay));
}

function pushAudit(
  audit: MemoryStateKnobAudit[],
  memoryField: string,
  reason: string,
  strength01: number,
): void {
  audit.push({
    memoryField,
    key: 'pacePreference',
    reason,
    strength01,
  });
}

/**
 * MemoryState v1 → DecisionParams overlay（纯函数，可单测）。
 * 冷启动：memory 为空时不改 params。
 */
export function applyMemoryStateV1ToDecisionParams(
  params: DecisionParams,
  memory: MemoryStateV1 | null | undefined,
  now = new Date(),
): { params: DecisionParams; audit: MemoryStateKnobAudit[] } {
  const audit: MemoryStateKnobAudit[] = [];
  if (!memory?.longTerm) {
    return { params, audit };
  }

  const cost = memory.longTerm['preference.cost_sensitivity'] as
    | MemoryFieldValue<'LOW' | 'MEDIUM' | 'HIGH'>
    | undefined;
  if (cost && cost.provenance.signalTier !== 'FORBIDDEN') {
    const s = effectiveStrength(cost, now);
    if (s >= MIN_CONFIDENCE) {
      if (cost.value === 'HIGH') {
        params.strategyPreference.abuWeight += 0.25 * s;
        params.repairPolicy.preferAltRoute = true;
        pushAudit(audit, 'preference.cost_sensitivity', 'DNA_COST_SENSITIVE', s);
      } else if (cost.value === 'LOW') {
        params.routeDirectionBias.adventureWeight += 0.15 * s;
        pushAudit(audit, 'preference.cost_sensitivity', 'DNA_COST_TOLERANT', s);
      }
    }
  }

  const time = memory.longTerm['preference.time_sensitivity'] as
    | MemoryFieldValue<'LOW' | 'MEDIUM' | 'HIGH'>
    | undefined;
  if (time && time.provenance.signalTier !== 'FORBIDDEN') {
    const s = effectiveStrength(time, now);
    if (s >= MIN_CONFIDENCE) {
      if (time.value === 'HIGH') {
        params.constraints.bufferTimeMin = (params.constraints.bufferTimeMin ?? 15) + 30 * s;
        params.strategyPreference.drDreWeight += 0.2 * s;
        pushAudit(audit, 'preference.time_sensitivity', 'DNA_TIME_SENSITIVE', s);
      } else if (time.value === 'LOW') {
        params.constraints.bufferTimeMin = Math.max(
          5,
          (params.constraints.bufferTimeMin ?? 15) - 10 * s,
        );
        pushAudit(audit, 'preference.time_sensitivity', 'DNA_TIME_FLEXIBLE', s);
      }
    }
  }

  const bias = memory.longTerm['decision.bias.dominant_alternative'] as
    | MemoryFieldValue<string>
    | undefined;
  if (bias && bias.provenance.signalTier !== 'FORBIDDEN') {
    const s = effectiveStrength(bias, now);
    if (s >= MIN_CONFIDENCE) {
      const alt = String(bias.value ?? '').trim();
      if (alt === 'UPGRADE_TO_DRIVE') {
        params.strategyPreference.abuWeight += 0.2 * s;
        params.repairPolicy.preferAltRoute = true;
        pushAudit(audit, 'decision.bias.dominant_alternative', 'DNA_BIAS_UPGRADE_DRIVE', s);
      } else if (alt === 'POSTPONE_SCHEDULE') {
        params.constraints.bufferTimeMin = (params.constraints.bufferTimeMin ?? 15) + 20 * s;
        params.repairPolicy.preferSplitDays = true;
        pushAudit(audit, 'decision.bias.dominant_alternative', 'DNA_BIAS_POSTPONE', s);
      }
    }
  }

  return { params: normalizeDecisionParams(params), audit };
}

export function mapMemoryStateToDecisionParams(
  memory: MemoryStateV1 | null | undefined,
  now = new Date(),
): { params: DecisionParams; audit: MemoryStateKnobAudit[] } {
  const base = createDefaultDecisionParams();
  return applyMemoryStateV1ToDecisionParams(base, memory, now);
}
