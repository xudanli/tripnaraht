/**
 * P0 Emotional Narrator — 情绪矩阵契约（Data Projector SSOT）。
 * 只读投影层：不写入 DB，供 NARRATE 前合成与 DPO 回放审计。
 */

import type { DecisionMetaMode } from '../../../decision/kernel/decision-state.types';
import type { AgentMemoryNarrateSnapshot } from '../../memory/utils/agent-memory-snapshot.util';
import type { AgentMemoryContext } from '../../memory/interfaces/agent-memory-context.interface';
import type { UserEmotionalAccount } from '../../memory/emotional-resonance/user-emotional-account.types';
import type { ExperienceFlowModel } from '../../../trips/decision/models/experience-flow.model';

/** 跨 Trip 回忆锚点（L2/L4 投影） */
export interface SharedMilestoneAnchor {
  pastTripId: string;
  locationName: string;
  legacyPreferenceToken: string;
  emotionalPolarity: 'POSITIVE_HIGH' | 'NEGATIVE_TRAUMA' | 'NEUTRAL';
}

/** 情绪层语气 Stance（可映射至 NarrationVoiceToneModifier 子集） */
export type EmotionalVoiceToneModifier =
  | 'empathetic_reassurance'
  | 'professional_authoritative'
  | 'relaxed_buddy'
  | 'silent_observant';

/** P1 预备：主动触达门控（JourneyAssistant / push 消费） */
export type ProactivityGate = 'SILENT' | 'GENTLE' | 'ACTIVE';

/** 运行时传感器子集（对齐 InterventionEngine.RealtimeState + 客户端扩展） */
export type EmotionalRealtimeSignals = Readonly<{
  continuousDrivingSeconds?: number;
  speedMs?: number;
  delayMinutes?: number;
  /** 目的地本地时间 HH:mm */
  localTime?: string;
  decisionMetaMode?: DecisionMetaMode;
  weatherWindLockActive?: boolean;
  /** 无位移分钟数（P1 静默阈值输入） */
  stationaryMinutes?: number;
}>;

export interface EmotionalAudioProsodyPreference {
  pitch: 'low' | 'medium' | 'high';
  speedFactor: number;
}

export interface EmotionalRecommendedVoiceStance {
  toneModifier: EmotionalVoiceToneModifier;
  audioProsodyPreference: EmotionalAudioProsodyPreference;
}

export interface EmotionalAmbienceSignals {
  isGoldenHour: boolean;
  isRomancePacingActive: boolean;
  weatherWindLockActive: boolean;
}

/** NARRATE 前只读情绪上下文（schema tripnara.emotional_context@v1） */
export interface EmotionalContext {
  schemaVersion: 'tripnara.emotional_context@v1';
  userId: string;
  tripId: string;

  fatigueIndex: number;
  anxietyLevel: number;
  anxietyTriggered: boolean;

  ambienceSignals: EmotionalAmbienceSignals;
  sharedMilestones: SharedMilestoneAnchor[];

  recommendedVoiceStance: EmotionalRecommendedVoiceStance;
  proactivityGate: ProactivityGate;
}

/** Orchestrator.build() 输入 — 多源只读，禁止在此层 mutate 业务 SSOT */
export interface EmotionNarratorBuildInputs {
  userId: string;
  tripId: string;
  agentMemory?: AgentMemoryContext | AgentMemoryNarrateSnapshot | null;
  experienceFlow?: ExperienceFlowModel | null;
  userEmotionalAccount?: UserEmotionalAccount | null;
  realtimeState?: EmotionalRealtimeSignals | null;
  lastUserMessage?: string;
  decisionMetaMode?: DecisionMetaMode;
  weatherWindLockActive?: boolean;
  isRomancePacingActive?: boolean;
}
