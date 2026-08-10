/**
 * L1 Contract Golden / L2 Scenario Benchmark / L3 Outcome Benchmark。
 */

import type { AgentTaskContractV1 } from '../harness/agent-task-contract.types';
import { isCapabilityAllowed } from '../harness/assert-task-capability.util';
import type { DecisionEvaluationV1 } from './decision-evaluation.util';

export type BenchmarkLevel = 'L1_CONTRACT_GOLDEN' | 'L2_SCENARIO' | 'L3_OUTCOME';

export type BenchmarkCaseResult = {
  caseId: string;
  level: BenchmarkLevel;
  passed: boolean;
  detailZh: string;
  score?: number;
};

export type BenchmarkSuiteResult = {
  level: BenchmarkLevel;
  passed: number;
  failed: number;
  results: BenchmarkCaseResult[];
  passRate: number;
};

/** L1：Contract Golden — Capability / Authority 边界 */
export function runL1ContractGolden(input: {
  cases: Array<{
    caseId: string;
    contract: AgentTaskContractV1;
    mustAllow?: Array<Parameters<typeof isCapabilityAllowed>[1]>;
    mustDeny?: Array<Parameters<typeof isCapabilityAllowed>[1]>;
    mustNotAllowFullPlanning?: boolean;
  }>;
}): BenchmarkSuiteResult {
  const results: BenchmarkCaseResult[] = input.cases.map((c) => {
    const fails: string[] = [];
    for (const cap of c.mustAllow ?? []) {
      if (!isCapabilityAllowed(c.contract, cap)) fails.push(`mustAllow:${cap}`);
    }
    for (const cap of c.mustDeny ?? []) {
      if (isCapabilityAllowed(c.contract, cap)) fails.push(`mustDeny:${cap}`);
    }
    if (c.mustNotAllowFullPlanning && c.contract.allowFullPlanning) {
      fails.push('mustNotAllowFullPlanning');
    }
    return {
      caseId: c.caseId,
      level: 'L1_CONTRACT_GOLDEN',
      passed: fails.length === 0,
      detailZh: fails.length ? fails.join(';') : 'ok',
    };
  });
  return summarize('L1_CONTRACT_GOLDEN', results);
}

/** L2：Scenario Benchmark — 脚本场景期望推荐 */
export function runL2ScenarioBenchmark(input: {
  cases: Array<{
    caseId: string;
    scenarioZh: string;
    productionOptionId: string;
    expectedOptionId: string;
  }>;
}): BenchmarkSuiteResult {
  const results: BenchmarkCaseResult[] = input.cases.map((c) => {
    const passed = c.productionOptionId === c.expectedOptionId;
    return {
      caseId: c.caseId,
      level: 'L2_SCENARIO',
      passed,
      detailZh: passed
        ? `场景「${c.scenarioZh}」命中 ${c.expectedOptionId}`
        : `期望 ${c.expectedOptionId} 实际 ${c.productionOptionId}`,
      score: passed ? 1 : 0,
    };
  });
  return summarize('L2_SCENARIO', results);
}

/** L3：Outcome Benchmark — 基于 DecisionEvaluation */
export function runL3OutcomeBenchmark(input: {
  evaluations: DecisionEvaluationV1[];
  minAcceptableScore?: number;
}): BenchmarkSuiteResult {
  const min = input.minAcceptableScore ?? 0.55;
  const results: BenchmarkCaseResult[] = input.evaluations.map((e) => {
    const passed = e.score >= min && e.grade !== 'POOR';
    return {
      caseId: e.evaluationId,
      level: 'L3_OUTCOME',
      passed,
      detailZh: `${e.outcomeKind} grade=${e.grade} score=${e.score}`,
      score: e.score,
    };
  });
  return summarize('L3_OUTCOME', results);
}

function summarize(
  level: BenchmarkLevel,
  results: BenchmarkCaseResult[],
): BenchmarkSuiteResult {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return {
    level,
    passed,
    failed,
    results,
    passRate: results.length ? passed / results.length : 0,
  };
}
