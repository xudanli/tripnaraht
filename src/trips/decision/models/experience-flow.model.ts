/**
 * Experience Flow — 世界模型第四投影：情绪与节奏的显式状态向量。
 *
 * 将 frictionScore、narrative_track、behavior_signals 收敛为可序列化 SSOT，
 * 供 Decision Trace / DPO 飞轮 / NarratorAgent 基调对齐。
 */

import type { BehaviorSignal } from '../../draft-synthesis/user-intent/behavior-signal.types';
import type { DraftContractMode } from '../../draft-synthesis/contract/trip-draft-contract.types';

export const EXPERIENCE_FLOW_SCHEMA_V1 = 'experience-flow/v1' as const;

/** 节奏状态机：决定路由权重与叙事调性 */
export type ExperienceFlowTempo = 'ACCELERATED' | 'BALANCED' | 'EMPATHY_RECOVERY';

export interface ExperienceFlowModel {
  schemaVersion: typeof EXPERIENCE_FLOW_SCHEMA_V1;
  tempo: ExperienceFlowTempo;
  /** 0–1：异质性指数，越高越强调品类/体验多样性（防审美疲劳） */
  heterogeneityIndex: number;
  /** 0–1：探索/惊喜度预留配额（E&E exploitation 余量） */
  surpriseBuffer: number;
  /** 0–1：用户当前摩擦力耐受剩余值（高 = 可承受复杂转场） */
  currentFrictionCapacity: number;
  /** 映射至 NarratorAgent 语言基调 */
  narrativeTone: string;
}

export const EXPERIENCE_FLOW_RESEARCH_KEY = '__experience_flow' as const;

/** 与 `ResearchTraceSignalsV1` 对齐的最小输入（避免 agent ↔ trips 循环依赖） */
export type ExperienceFlowTraceInput = {
  narrative_track: 'EMPATHY_RECOVERY' | 'EXPERIENCE_FIRST';
  frustration_circuit_triggered: boolean;
  stability_mode_active: boolean;
};

const CLAMP01 = (x: number) => Math.max(0, Math.min(1, x));

function narrativeToneForTempo(tempo: ExperienceFlowTempo): string {
  switch (tempo) {
    case 'EMPATHY_RECOVERY':
      return 'empathetic_reassurance';
    case 'ACCELERATED':
      return 'curious_discovery';
    default:
      return 'balanced_warm';
  }
}

function tempoFromTraceSignals(trace: ExperienceFlowTraceInput): ExperienceFlowTempo {
  if (trace.narrative_track === 'EMPATHY_RECOVERY' || trace.frustration_circuit_triggered) {
    return 'EMPATHY_RECOVERY';
  }
  return trace.stability_mode_active ? 'BALANCED' : 'ACCELERATED';
}

function baseFlowFromTempo(tempo: ExperienceFlowTempo): Omit<ExperienceFlowModel, 'schemaVersion'> {
  switch (tempo) {
    case 'EMPATHY_RECOVERY':
      return {
        tempo,
        heterogeneityIndex: 0.35,
        surpriseBuffer: 0.05,
        currentFrictionCapacity: 0.2,
        narrativeTone: narrativeToneForTempo(tempo),
      };
    case 'ACCELERATED':
      return {
        tempo,
        heterogeneityIndex: 0.75,
        surpriseBuffer: 0.35,
        currentFrictionCapacity: 0.72,
        narrativeTone: narrativeToneForTempo(tempo),
      };
    default:
      return {
        tempo,
        heterogeneityIndex: 0.55,
        surpriseBuffer: 0.2,
        currentFrictionCapacity: 0.58,
        narrativeTone: narrativeToneForTempo(tempo),
      };
  }
}

/**
 * 由研究轨 trace 信号投影 ExperienceFlow（纯函数，无 IO）。
 */
export function projectExperienceFlowFromTraceSignals(
  trace: ExperienceFlowTraceInput,
): ExperienceFlowModel {
  const tempo = tempoFromTraceSignals(trace);
  return {
    schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
    ...baseFlowFromTempo(tempo),
  };
}

/**
 * 根据 draft 契约模式调整 surpriseBuffer（EXPLORATION 加大 β 对应配额）。
 */
export function adjustExperienceFlowForDraftMode(
  flow: ExperienceFlowModel,
  mode: DraftContractMode | undefined,
): ExperienceFlowModel {
  if (mode !== 'EXPLORATION' || flow.tempo === 'EMPATHY_RECOVERY') {
    return flow;
  }
  return {
    ...flow,
    surpriseBuffer: CLAMP01(flow.surpriseBuffer + 0.15),
    heterogeneityIndex: CLAMP01(flow.heterogeneityIndex + 0.1),
  };
}

/**
 * 行为信号微调：将隐式 dwell/skip/fatigue 映射到摩擦与异质性向量。
 */
export function applyBehaviorSignalsToExperienceFlow(
  flow: ExperienceFlowModel,
  signals: readonly BehaviorSignal[],
): ExperienceFlowModel {
  if (!signals.length) {
    return flow;
  }

  let heterogeneityIndex = flow.heterogeneityIndex;
  let surpriseBuffer = flow.surpriseBuffer;
  let currentFrictionCapacity = flow.currentFrictionCapacity;
  let tempo = flow.tempo;

  for (const sig of signals) {
    if (sig.type === 'fatigue_rejection' || sig.type === 'pace_complaint') {
      currentFrictionCapacity = CLAMP01(currentFrictionCapacity - 0.4 * sig.confidence);
      heterogeneityIndex = CLAMP01(heterogeneityIndex - 0.1 * sig.confidence);
      if (currentFrictionCapacity < 0.4) {
        tempo = 'EMPATHY_RECOVERY';
      }
    }
    if (sig.type === 'implicit_skip') {
      surpriseBuffer = CLAMP01(surpriseBuffer + 0.08 * sig.confidence);
      heterogeneityIndex = CLAMP01(heterogeneityIndex + 0.05 * sig.confidence);
    }
    if (sig.type === 'implicit_dwell') {
      currentFrictionCapacity = CLAMP01(currentFrictionCapacity + 0.05 * sig.confidence);
    }
  }

  const narrativeTone =
    tempo !== flow.tempo ? narrativeToneForTempo(tempo) : flow.narrativeTone;

  return {
    ...flow,
    tempo,
    heterogeneityIndex,
    surpriseBuffer,
    currentFrictionCapacity,
    narrativeTone,
  };
}

/**
 * 从 research_data 读取已物化的 ExperienceFlow（向后兼容：可由 trace 现场投影）。
 */
export function readExperienceFlowFromResearchData(
  researchData: Record<string, unknown> | undefined | null,
): ExperienceFlowModel | null {
  if (!researchData || typeof researchData !== 'object' || Array.isArray(researchData)) {
    return null;
  }
  const raw = researchData[EXPERIENCE_FLOW_RESEARCH_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const flow = raw as ExperienceFlowModel;
  if (flow.schemaVersion !== EXPERIENCE_FLOW_SCHEMA_V1) {
    return null;
  }
  return flow;
}

/**
 * 将 research_data 中的 ExperienceFlow 注入 WorldModelContext（幂等）。
 */
export function enrichWorldContextWithExperienceFlow(
  world: import('../shared/world-model.types').WorldModelContext,
  researchData?: Record<string, unknown> | null,
): import('../shared/world-model.types').WorldModelContext {
  if (world.experienceFlow) {
    return world;
  }
  const flow = readExperienceFlowFromResearchData(researchData);
  if (!flow) {
    return world;
  }
  return { ...world, experienceFlow: flow };
}
