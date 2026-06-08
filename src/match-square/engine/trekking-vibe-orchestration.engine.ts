import { isPremiumTrekkingScriptId } from '../config/premium-trekking.config';
import {
  TREKKING_OFFLINE_PRELOAD_CHIP_IDS,
  resolveTrekkingWorldModelBinding,
} from '../config/trekking-vibe-world-model.config';
import type { VibeLlmParsePayload } from '../types/vibe-llm.types';
import type { TrekkingVibeOrchestrationPlan } from '../types/trekking-vibe-orchestration.types';
import { TREKKING_ORCHESTRATION_VERSION } from '../types/trekking-vibe-orchestration.types';

/**
 * 从 Vibe LLM 解析结果生成 TripNARA 徒步模块编排计划（纯函数，无 IO）。
 * 供 parse 响应、发帖快照、未来 spawn-trip / generate-plan 编排器消费。
 */
export function buildTrekkingVibeOrchestrationPlan(
  payload: VibeLlmParsePayload,
): TrekkingVibeOrchestrationPlan | null {
  const scriptId = payload.recruitment_script_id;
  if (!isPremiumTrekkingScriptId(scriptId)) return null;

  const binding = resolveTrekkingWorldModelBinding(scriptId);
  if (!binding) return null;

  const chipIds = new Set(payload.vibe_chips.map((c) => c.id));
  const offlineFromChips = payload.vibe_chips.some((c) => TREKKING_OFFLINE_PRELOAD_CHIP_IDS.has(c.id));
  const offlineDataPreloadRequired = binding.offlineDataPreloadRequired || offlineFromChips;

  const physicalConstraints = [...binding.physicalConstraints];
  if (chipIds.has('elite_silence')) {
    physicalConstraints.push('zero_social_itinerary');
  }
  if (chipIds.has('burnwash_full') || chipIds.has('dyl_life_design')) {
    physicalConstraints.push('psychological_retreat');
  }

  return {
    version: TREKKING_ORCHESTRATION_VERSION,
    scriptId,
    sceneCategory: 'premium_trekking',
    worldModel: {
      profile: binding.profile,
      routeDirectionCandidates: [...binding.routeDirectionCandidates],
      offlineDataPreloadRequired,
      demGridMetres: binding.demGridMetres,
      physicalConstraints,
    },
    sharedGearDeficits: [...binding.sharedGearDeficits],
    eventStreamMilestones: [...binding.eventStreamMilestones],
    toolchain: [...binding.toolchain],
    dnaEvolution: {
      ...binding.dnaEvolution,
      odysseyWeightAdjustments: binding.dnaEvolution.odysseyWeightAdjustments
        ? [...binding.dnaEvolution.odysseyWeightAdjustments]
        : undefined,
    },
    structuralMatch: {
      filterNegativeTags: [...binding.structuralMatch.filterNegativeTags],
      preferSlotMbtiTypes: binding.structuralMatch.preferSlotMbtiTypes,
      requireHighSecurity: binding.structuralMatch.requireHighSecurity,
    },
  };
}

export function attachTrekkingOrchestrationSnapshot<T extends object>(
  snapshot: T,
  plan: TrekkingVibeOrchestrationPlan | null,
): T & { _trekkingOrchestration?: TrekkingVibeOrchestrationPlan } {
  if (!plan) return snapshot;
  return { ...snapshot, _trekkingOrchestration: plan };
}

export function readTrekkingOrchestrationFromSnapshot(
  raw: unknown,
): TrekkingVibeOrchestrationPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const plan = (raw as Record<string, unknown>)._trekkingOrchestration;
  if (!plan || typeof plan !== 'object') return null;
  const version = (plan as TrekkingVibeOrchestrationPlan).version;
  if (version !== TREKKING_ORCHESTRATION_VERSION) return null;
  return plan as TrekkingVibeOrchestrationPlan;
}
