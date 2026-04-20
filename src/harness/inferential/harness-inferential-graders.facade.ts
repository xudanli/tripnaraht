import { Injectable } from '@nestjs/common';
import type { HarnessExecutionContext } from '../runtime/execution-context.types';
import type { HarnessGraderResult, HarnessInferentialGrader } from './harness-inferential-grader.interface';
import { HarnessStubPassInferentialGrader } from './stub-pass.inferential-grader';
import { HarnessPacingHeuristicInferentialGrader } from './pacing-heuristic.inferential-grader';

/**
 * Phase 1 占位：注册 grader 后在此聚合调用；与 executor 模型解耦（见文档 7.4.1）。
 */
@Injectable()
export class HarnessInferentialGradersFacade {
  private readonly byName = new Map<string, HarnessInferentialGrader>();

  constructor(
    stubPass: HarnessStubPassInferentialGrader,
    pacingHeuristic: HarnessPacingHeuristicInferentialGrader,
  ) {
    this.register(stubPass);
    this.register(pacingHeuristic);
  }

  register(grader: HarnessInferentialGrader): void {
    this.byName.set(grader.name, grader);
  }

  async runAll(
    names: string[],
    input: unknown,
    context: HarnessExecutionContext,
  ): Promise<HarnessGraderResult[]> {
    const out: HarnessGraderResult[] = [];
    for (const n of names) {
      const g = this.byName.get(n);
      if (!g) {
        out.push({
          passed: false,
          score: 0,
          label: 'MISSING_GRADER',
          explanation: `Inferential grader not registered: ${n}`,
          severity: 'L2',
        });
        continue;
      }
      out.push(await g.grade(input, context));
    }
    return out;
  }
}
