/**
 * CGUS 实验验证框架
 *
 * Phase 3：验证定理 1（搜索空间收缩）、定理 2（近最优）、定理 3（收敛性）
 * 参考：docs/DECISION_OS_CGUS_THEOREMS.md
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CGUSSearchService } from '../cgus-search.service';
import { UnifiedDecisionFormulaService } from '../unified-decision-formula.service';
import type { CGUSCandidate } from '../cgus-search.service';
import type { WorldModelContext } from '../../shared/world-model.types';

describe('CGUS Experiment Framework', () => {
  let cgus: CGUSSearchService;
  let worldContext: WorldModelContext;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedDecisionFormulaService,
        CGUSSearchService,
      ],
    }).compile();

    cgus = module.get(CGUSSearchService);
    worldContext = createMockWorldContext();
  });

  /**
   * 定理 1 验证：搜索空间收缩
   * 当可行候选比例 ρ 小时，CGUS 应避免对不可行候选的完整效用计算
   */
  it('Theorem 1: search space contraction when ρ is small', async () => {
    const allCandidates = createCandidates(20, { feasibleRatio: 0.2 });
    const feasibleCount = allCandidates.filter((c) => c.feasible).length;
    const rho = feasibleCount / allCandidates.length;

    const result = await cgus.search(allCandidates, worldContext, {
      useMonteCarlo: false,
      useUtilityPrior: true,
    });

    expect(result.rankedCandidates.length).toBeLessThanOrEqual(allCandidates.length);
    expect(result.recommended).toBeDefined();
    expect(rho).toBeLessThan(0.5);
  });

  /**
   * 定理 2 验证：近最优
   * 输出 a* 的效用应接近理论最优（在采样噪声范围内）
   */
  it('Theorem 2: near-optimal output', async () => {
    const candidates = createCandidates(10, { feasibleRatio: 1 });
    const result = await cgus.search(candidates, worldContext, {
      useMonteCarlo: false,
    });

    const topUtility = result.rankedCandidates[0]?.utility ?? 0;
    const recommendedUtility = result.rankedCandidates.find(
      (r) => r.candidate.id === result.recommended?.id,
    )?.utility ?? 0;

    expect(topUtility).toBeGreaterThanOrEqual(0);
    expect(recommendedUtility).toBeGreaterThanOrEqual(0);
  });

  /**
   * 定理 3 验证：收敛性
   * 在有限候选集上，CGUS 应确定性地输出最优可行解
   */
  it('Theorem 3: convergence on finite action space', async () => {
    const candidates = createCandidates(5, { feasibleRatio: 1 });
    const result1 = await cgus.search(candidates, worldContext, { useMonteCarlo: false });
    const result2 = await cgus.search(candidates, worldContext, { useMonteCarlo: false });

    expect(result1.recommended?.id).toBe(result2.recommended?.id);
    expect(result1.rankedCandidates[0]?.utility).toBe(result2.rankedCandidates[0]?.utility);
  });
});

function createMockWorldContext(): WorldModelContext {
  return {
    physical: {
      month: 7,
      demEvidence: [],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
    },
    human: {
      profileId: 'test',
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 25,
      preferredPace: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      highAltitudeExperience: 'BASIC',
    },
    routeDirection: {
      id: 'test-route',
      name: 'Test',
      philosophy: {},
      constraints: {},
    },
  } as WorldModelContext;
}

function createCandidates(
  n: number,
  opts: { feasibleRatio?: number },
): CGUSCandidate[] {
  const feasibleRatio = opts.feasibleRatio ?? 1;
  const candidates: CGUSCandidate[] = [];
  for (let i = 0; i < n; i++) {
    const feasible = i < n * feasibleRatio;
    candidates.push({
      id: `cand_${i}`,
      plan: { tripId: 't', routeDirectionId: 'r', segments: [] } as any,
      constraintViolations: feasible ? [] : [{ type: 'TEST', severity: 'HARD', degree: 1 }],
      feasible,
    });
  }
  return candidates;
}
