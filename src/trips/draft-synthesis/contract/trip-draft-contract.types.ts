import type { ContextBlock } from '../../../agent/context-engine/types/context-package.types';
import type { CreateTripDraftDto } from '../../dto/trip-draft.dto';
import type { TripDraftState } from '../state/trip-draft-state.types';
import type { UserIntentState } from '../user-intent/user-intent-state.types';
import type { TravelPersona } from '../persona-policy/travel-persona.types';
import type { ExecutionPolicy } from '../persona-policy/execution-policy.types';

/**
 * L0 EXPLORATION：`/trips/draft` 纯预览，不落 Trip。
 * L1 BOOTSTRAP：NL create 后异步草案，带 tripId。
 * L2 RUNTIME：已有 Trip 上再编排（regenerate / 修复回路等）。
 */
export type DraftContractMode = 'EXPLORATION' | 'BOOTSTRAP' | 'RUNTIME';

/** 请求侧「主引擎」语义；HYBRID 表示 LLM×Algo 双跑 + 槽位仲裁（实现细节见 TripDraftService）。 */
export type DraftContractEngineKind = 'LLM' | 'ALGO' | 'HYBRID';

/**
 * NONE：不做仿真/门控（预留）。
 * SIMULATED：仅执行仿真（预留）。
 * VALIDATED：校验 + 仿真 + 门控（当前默认）。
 */
export type DraftExecutionLevel = 'NONE' | 'SIMULATED' | 'VALIDATED';

/** 与 Solver / 区域策略相关的契约剖面，用于观测与后续插件化。 */
export interface DraftConstraintProfile {
  /** 上游已注入 Solver skeleton（CONSTRAINTS ContextBlock） */
  solverContextInjected: boolean;
  /** 使用了 region anchor / POI 规划切片 */
  regionAnchorPlanning: boolean;
}

/**
 * 草案契约：所有入口（/draft、NL async、runtime）统一先收敛到此结构，再进入同一 Draft Engine。
 */
export interface TripDraftContract {
  /** 已存在行程时携带；纯探索草案为空 */
  tripId?: string;

  mode: DraftContractMode;

  input: CreateTripDraftDto;

  /**
   * 可选初始 SSOT；缺省时由管线从 input + tripId 构造。
   */
  state?: TripDraftState;

  engine: DraftContractEngineKind;

  context?: ContextBlock[];

  constraintsProfile: DraftConstraintProfile;

  executionLevel: DraftExecutionLevel;

  /** 用户意图演化模型（长期画像 + 行为记忆），注入规划 / 仿真偏好轴 */
  userIntent?: UserIntentState;

  /** 推断的旅行人格（Persona Engine） */
  persona?: TravelPersona;

  /** Policy Engine：仲裁权重 / 门控 / 仿真强度 / 修复侵略性 */
  executionPolicy?: ExecutionPolicy;
}
