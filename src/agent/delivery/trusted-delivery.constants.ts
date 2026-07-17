/**
 * 前端可信交付 — 公共阶段标签（不暴露内部节点名）。
 */

export const TRUSTED_DELIVERY_VERSION = '1.0.0' as const;
export const TRUSTED_DELIVERY_SCHEMA_ID = 'tripnara.trusted_delivery@v1' as const;

export type TrustedPublicPhase =
  | 'understanding'
  | 'researching'
  | 'selecting_places'
  | 'checking_rules'
  | 'planning'
  | 'validating'
  | 'fixing'
  | 'narrating'
  | 'quality_check'
  | 'done'
  | 'blocked'
  | 'unknown';

/** 内部 step / node → 公共 phase（不下发内部 ID） */
export const INTERNAL_STEP_TO_PUBLIC_PHASE: Record<string, TrustedPublicPhase> = {
  INTAKE: 'understanding',
  STATE_UPDATE: 'understanding',
  RESEARCH: 'researching',
  research: 'researching',
  POI_SELECTION: 'selecting_places',
  poi_selection: 'selecting_places',
  GATE_EVAL: 'checking_rules',
  gate_eval: 'checking_rules',
  CONTEXT_BUILD: 'planning',
  context_build: 'planning',
  PLAN_GEN: 'planning',
  plan_gen: 'planning',
  TRAVEL_COMPILE: 'planning',
  OPTIMIZE: 'validating',
  optimize: 'validating',
  VERIFY: 'validating',
  verify: 'validating',
  REPAIR: 'fixing',
  repair: 'fixing',
  NARRATE: 'narrating',
  narrate: 'narrating',
  FEEDBACK: 'narrating',
  feedback: 'narrating',
  HALLUCINATION_DETECTION: 'quality_check',
  hallucination: 'quality_check',
  DONE: 'done',
  FAILED: 'blocked',
  TIMEOUT: 'blocked',
};

export const PUBLIC_PHASE_LABEL_ZH: Record<TrustedPublicPhase, string> = {
  understanding: '理解需求',
  researching: '调研中',
  selecting_places: '筛选地点',
  checking_rules: '规则检查',
  planning: '生成行程',
  validating: '校验行程',
  fixing: '修复调整',
  narrating: '生成说明',
  quality_check: '质量校验',
  done: '已完成',
  blocked: '需处理',
  unknown: '处理中',
};

export function mapInternalStepToPublicPhase(step: string | undefined | null): TrustedPublicPhase {
  const k = String(step ?? '').trim();
  if (!k) return 'unknown';
  return INTERNAL_STEP_TO_PUBLIC_PHASE[k] ?? INTERNAL_STEP_TO_PUBLIC_PHASE[k.toUpperCase()] ?? 'unknown';
}
