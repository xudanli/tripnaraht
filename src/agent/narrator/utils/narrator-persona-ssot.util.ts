import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

/** 默认开启：人格叙事读 SSOT（explain.guardian_personas + decisionContext），不重复注入 LLM 散文 */
export function isNarratorPersonaSsotEnabled(): boolean {
  const v = process.env.NARRATOR_PERSONA_SSOT ?? '1';
  return v === '1' || v === 'true';
}

export function orchestratorHasOpenWorldDecisionContext(state: OrchestratorState): boolean {
  const md = state.metadata as Record<string, unknown> | undefined;
  if (md?.sparse_region_profile || md?.open_world_discovery) return true;
  const rd = state.research_data as Record<string, unknown> | undefined;
  return Boolean(rd?.open_world_discovery);
}

export function decisionStateHasDecisionContextSlice(dso?: DecisionState): boolean {
  const dc = dso?.constraints?.decisionContext;
  return Boolean(
    dc?.sparseProfileId ||
      (dc?.openWorldStubs?.length ?? 0) > 0 ||
      (dc?.intentionalSlack?.length ?? 0) > 0,
  );
}

/**
 * 为 true 时：不在 narration 正文重复 Abu/Dr.Dre/Neptune 散文；
 * 结构化字段（guardian_narrative_zh / explain.guardian_personas）仍保留。
 */
export function shouldSkipGuardianProseInNarration(
  state: OrchestratorState,
  dso?: DecisionState,
): boolean {
  if (!isNarratorPersonaSsotEnabled()) return false;
  if (orchestratorHasOpenWorldDecisionContext(state)) return true;
  if (decisionStateHasDecisionContextSlice(dso)) return true;
  return true;
}

export function buildNarratorSsotPersonaInstructionZh(): string {
  return `
[人格叙事 SSOT]
- 三人格（Abu 安全 / Dr.Dre 节奏 / Neptune 空间）结论已在结构化 gate / decisionContext 中；
- 正文勿逐条复述「Abu 说… Dr.Dre 说…」；用 1–2 句用户友好摘要即可；
- 稀疏区留白、provisional POI 核实提示由 decisionContext 合并层注入，勿在正文重复规则。
`.trim();
}
