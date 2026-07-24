/**
 * CompilationResult — Travel Compiler 统一返回契约（v0）
 */

import type { CanonicalTravelGraph } from './canonical-travel-graph.types';
import type { CompilePhase } from './travel-compiler.types';

export const COMPILATION_RESULT_SCHEMA_ID = 'tripnara.compilation_result@v0';

export type CompilationStatus = 'success' | 'partial' | 'failed';

export type CompileIssueSeverity = 'error' | 'warning' | 'info';

export interface CompileIssue {
  issueId: string;
  severity: CompileIssueSeverity;
  phase: CompilePhase;
  code: string;
  message: string;
  dayIndex?: number;
  nodeId?: string;
  slotId?: string;
  evidenceRefs?: string[];
  metadata?: Record<string, unknown>;
}

export interface PhaseReport {
  phase: CompilePhase;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  /** UI 进度条：如 POI 18/18 */
  counters?: Record<string, { done: number; total: number }>;
  summary?: string;
}

export interface CompilationResult {
  schemaId: typeof COMPILATION_RESULT_SCHEMA_ID;
  compileId: string;
  status: CompilationStatus;
  graph?: CanonicalTravelGraph;
  phaseReports: PhaseReport[];
  warnings: CompileIssue[];
  errors: CompileIssue[];
  /** 结构完整度 0–100；非「好不好玩」评分 */
  score: number;
  evidenceRefs: string[];
  createdAt: string;
  finishedAt: string;
  /** 对外产品模块标识（CTRE = Travel Compiler 编排层） */
  engine?: 'CTRE';
  compileTrigger?: 'plan_gen' | 'repair';
  incremental?: {
    affectedDayIndices: number[];
    previousCompileId?: string;
    merged: boolean;
  };
}
