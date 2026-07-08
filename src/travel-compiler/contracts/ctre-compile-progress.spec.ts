import { buildCtreCompileProgressView } from '../contracts/ctre-compile-progress.types';
import { COMPILE_PHASE_ORDER } from '../contracts/travel-compiler.types';
import type { CompilationResult } from '../contracts/compilation-result.types';

describe('buildCtreCompileProgressView', () => {
  it('projects phaseReports into frontend CTRE progress view', () => {
    const result: CompilationResult = {
      schemaId: 'tripnara.compilation_result@v0',
      compileId: 'c1',
      status: 'partial',
      score: 88,
      engine: 'CTRE',
      compileTrigger: 'plan_gen',
      phaseReports: COMPILE_PHASE_ORDER.map((phase) => ({
        phase,
        status: phase === 'VALIDATION' ? 'done' : 'done',
        counters:
          phase === 'VALIDATION'
            ? {
                POI: { done: 2, total: 2 },
                Route: { done: 1, total: 1 },
              }
            : phase === 'ROUTE_RESOLUTION'
              ? { Route: { done: 1, total: 1 } }
              : undefined,
      })),
      warnings: [],
      errors: [],
      evidenceRefs: [],
      createdAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };

    const view = buildCtreCompileProgressView(result);
    expect(view.schemaId).toBe('tripnara.ctre_compile_progress@v0');
    expect(view.phases.length).toBe(COMPILE_PHASE_ORDER.length);
    expect(view.counters.POI).toEqual({ done: 2, total: 2 });
    expect(view.counters.Route).toEqual({ done: 1, total: 1 });
  });
});
