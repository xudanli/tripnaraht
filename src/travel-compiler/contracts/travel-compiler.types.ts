/**
 * Travel Compiler — 阶段枚举与服务契约（v0）
 */

import type { CompilationResult } from './compilation-result.types';
import type { PlannerDraftIR } from './planner-draft-ir.types';

/** 九阶段编译流水线（PRD v1 + Route Resolution / Linking） */
export type CompilePhase =
  | 'LEXICAL'
  | 'CANONICALIZATION'
  | 'GRAPH_CONSTRUCTION'
  | 'ROUTE_RESOLUTION'
  | 'SEMANTIC'
  | 'LINKING'
  | 'VALIDATION'
  | 'OPTIMIZATION';

export const COMPILE_PHASE_ORDER: readonly CompilePhase[] = [
  'LEXICAL',
  'CANONICALIZATION',
  'GRAPH_CONSTRUCTION',
  'ROUTE_RESOLUTION',
  'SEMANTIC',
  'LINKING',
  'VALIDATION',
  'OPTIMIZATION',
] as const;

export interface TravelCompilerOptions {
  /** 遇 hard validation error 是否仍产出 partial graph */
  allowPartialGraph?: boolean;
  /** 跳过 OPTIMIZATION（调试 / 对照） */
  skipOptimization?: boolean;
  /** 跳过 Constraint Gateway 只读评估 */
  skipConstraintGateway?: boolean;
  /** 国家 Pack 约束（默认从 destination.countryCode 推断） */
  countryCode?: string;
  /** 绑定 TripContextSnapshot.constraintsVersion */
  constraintsVersion?: number;
  locale?: string;
  /** 编译触发来源（plan_gen / repair） */
  compileTrigger?: 'plan_gen' | 'repair';
}

export interface TravelCompilerProgressEvent {
  compileId: string;
  phase: CompilePhase;
  report: import('./compilation-result.types').PhaseReport;
}

/**
 * Facade 契约：编排 CPRE / RouteTemplate / Constraint assertion，不生成攻略或做 Runtime 决策。
 */
export interface TravelCompilerService {
  compile(
    input: PlannerDraftIR,
    options?: TravelCompilerOptions,
  ): Promise<CompilationResult>;

  /** SSE / Hub 用；实现可参考 GuideParseProgressHub */
  onProgress?(
    compileId: string,
    listener: (event: TravelCompilerProgressEvent) => void,
  ): () => void;
}
