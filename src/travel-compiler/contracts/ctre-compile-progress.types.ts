import type { CompilationResult, CompilationStatus, PhaseReport } from './compilation-result.types';
import type { CompilePhase } from './travel-compiler.types';

export const CTRE_COMPILE_PROGRESS_SCHEMA_ID = 'tripnara.ctre_compile_progress@v0';

export interface CtrePhaseProgressView {
  phase: CompilePhase;
  status: PhaseReport['status'];
  summary?: string;
  counters?: PhaseReport['counters'];
  durationMs?: number;
}

export interface CtreCompileCounterView {
  done: number;
  total: number;
}

/** 前端 CTRE 编译进度面板（SSE / metadata 投影） */
export interface CtreCompileProgressView {
  schemaId: typeof CTRE_COMPILE_PROGRESS_SCHEMA_ID;
  engine: 'CTRE';
  compileId: string;
  status: CompilationStatus;
  score: number;
  trigger: 'plan_gen' | 'repair';
  incremental?: CompilationResult['incremental'];
  phases: CtrePhaseProgressView[];
  /** 聚合 counters（VALIDATION / phaseReports 合并，供 §11 UI） */
  counters: {
    POI?: CtreCompileCounterView;
    Route?: CtreCompileCounterView;
    Booking?: CtreCompileCounterView;
    Constraint?: CtreCompileCounterView;
    Dependency?: CtreCompileCounterView;
  };
  updatedAt: string;
}

export function buildCtreCompileProgressView(
  result: CompilationResult,
  trigger: 'plan_gen' | 'repair' = result.compileTrigger ?? 'plan_gen',
): CtreCompileProgressView {
  const phases: CtrePhaseProgressView[] = result.phaseReports.map((p) => ({
    phase: p.phase,
    status: p.status,
    summary: p.summary,
    counters: p.counters,
    durationMs: p.durationMs,
  }));

  const counters: CtreCompileProgressView['counters'] = {};
  for (const report of result.phaseReports) {
    if (!report.counters) continue;
    for (const [key, value] of Object.entries(report.counters)) {
      if (key === 'POI' || key === 'Route' || key === 'Booking' || key === 'Constraint' || key === 'Dependency') {
        counters[key] = value;
      }
    }
  }

  const validation = result.phaseReports.find((p) => p.phase === 'VALIDATION');
  if (validation?.counters) {
    for (const key of ['POI', 'Route', 'Booking', 'Constraint', 'Dependency'] as const) {
      if (validation.counters[key]) counters[key] = validation.counters[key];
    }
  }

  return {
    schemaId: CTRE_COMPILE_PROGRESS_SCHEMA_ID,
    engine: 'CTRE',
    compileId: result.compileId,
    status: result.status,
    score: result.score,
    trigger,
    incremental: result.incremental,
    phases,
    counters,
    updatedAt: result.finishedAt,
  };
}
