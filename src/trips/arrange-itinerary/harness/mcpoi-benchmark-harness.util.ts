/**
 * Multi-Constraint POI Arrangement Benchmark — Harness runner.
 */
import {
  MCPOI_BENCHMARK_HARNESS_CASES,
  MCPOI_BENCHMARK_PLAN_VARIANTS,
  type McpoiHarnessCase,
  type McpoiMemberId,
  type McpoiPlanVariant,
  type McpoiScheduledItem,
} from '../fixtures/multi-constraint-poi-arrangement-benchmark.fixture';
import {
  affectedMembersFromEval,
  buildDownstreamImpacts,
  diffConstraintStates,
  evaluateMcpoiPlanDay,
  evaluateMcpoiPlanVariant,
  type McpoiPlanEvaluation,
  type McpoiPlanStatus,
} from './mcpoi-benchmark-evaluator.util';

export interface McpoiHarnessCaseExpectation {
  caseId: string;
  planStatusBefore?: McpoiPlanStatus;
  planStatusAfter?: McpoiPlanStatus;
  hardViolationBefore?: string[];
  hardViolationAfter?: string[];
  mustImproveHardConstraints?: boolean;
  mustHaveSplitAfter?: boolean;
  mustLosePhotographyAfter?: boolean;
  mustViolateConstraintAfter?: string[];
  mustSatisfyConstraintAfter?: string[];
}

export interface McpoiHarnessCaseResult {
  caseId: string;
  pass: boolean;
  errors: string[];
  before: McpoiPlanEvaluation;
  after: McpoiPlanEvaluation;
  decision: {
    planStatusBefore: McpoiPlanStatus;
    planStatusAfter: McpoiPlanStatus;
    directImpacts: ReturnType<typeof diffConstraintStates>;
    downstreamImpacts: ReturnType<typeof buildDownstreamImpacts>;
    affectedMembers: McpoiMemberId[];
    recommendation: string;
    reason: string;
  };
}

function cloneItems(items: McpoiScheduledItem[]): McpoiScheduledItem[] {
  return items.map((i) => ({ ...i }));
}

function variantById(id: 'A' | 'B' | 'C' | 'D'): McpoiPlanVariant {
  const v = MCPOI_BENCHMARK_PLAN_VARIANTS.find((x) => x.variantId === id);
  if (!v) throw new Error(`Unknown variant ${id}`);
  return v;
}

function shiftTime(hhmm: string, deltaMinutes: number): string {
  const total = hhmm
    .split(':')
    .map(Number)
    .reduce((acc, part, idx) => acc + part * (idx === 0 ? 60 : 1), 0);
  const next = Math.max(0, total + deltaMinutes);
  const h = Math.floor(next / 60);
  const m = next % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function applyDelay(
  items: McpoiScheduledItem[],
  poiId: string,
  delayMinutes: number,
): McpoiScheduledItem[] {
  const idx = items.findIndex((i) => i.poiId === poiId);
  if (idx < 0) return items;
  const out = cloneItems(items);
  for (let i = idx; i < out.length; i++) {
    out[i] = {
      ...out[i],
      startTime: shiftTime(out[i].startTime, delayMinutes),
      endTime: shiftTime(out[i].endTime, delayMinutes),
    };
  }
  return out;
}

function removePoi(items: McpoiScheduledItem[], poiId: string): McpoiScheduledItem[] {
  return items.filter((i) => i.poiId !== poiId);
}

function replacePoi(
  items: McpoiScheduledItem[],
  fromPoiId: string,
  toPoiId: string,
): McpoiScheduledItem[] {
  return items.map((i) =>
    i.poiId === fromPoiId
      ? {
          ...i,
          poiId: toPoiId,
          label:
            toPoiId === 'POI-LAVA-SHOW'
              ? 'Lava Show'
              : toPoiId === 'POI-VISITOR-CENTER'
                ? 'Visitor Center'
                : i.label,
        }
      : i,
  );
}

function addSkogafossSummit(items: McpoiScheduledItem[]): McpoiScheduledItem[] {
  const out = cloneItems(items);
  const skoga = out.find((i) => i.poiId === 'POI-SKOGAFOSS');
  if (skoga) {
    skoga.note = '含登顶';
    skoga.endTime = shiftTime(skoga.endTime, 30);
  }
  out.push({
    itemId: 'mcpoi-add-summit',
    poiId: 'POI-SKOGAFOSS',
    label: 'Skógafoss 登顶附加',
    startTime: skoga ? shiftTime(skoga.endTime, 15) : '15:00',
    endTime: skoga ? shiftTime(skoga.endTime, 75) : '16:00',
    type: 'ACTIVITY',
  });
  return out;
}

function buildVariantCUnifiedGlacier(): McpoiPlanVariant {
  const c = variantById('C');
  return {
    ...c,
    variantId: 'C',
    title: '全员冰川（不可行基线）',
    items: c.items.map((i) =>
      i.poiId === 'POI-GLACIER-HIKE'
        ? { ...i, memberIds: ['M1', 'M2', 'M3', 'M4', 'M5'] as McpoiMemberId[] }
        : i,
    ),
  };
}

function moveJokulsarlonLater(items: McpoiScheduledItem[]): McpoiScheduledItem[] {
  const out = cloneItems(items);
  const jok = out.find((i) => i.poiId === 'POI-JOKULSARLON');
  if (!jok) return out;
  jok.startTime = '16:30';
  jok.endTime = '17:45';
  const diamond = out.find((i) => i.poiId === 'POI-DIAMOND-BEACH');
  if (diamond) {
    diamond.startTime = '18:00';
    diamond.endTime = '18:45';
  }
  const hotel = out.find((i) => i.type === 'HOTEL');
  if (hotel) {
    hotel.startTime = '21:05';
    hotel.endTime = '21:35';
  }
  return out;
}

export function resolveHarnessCasePlans(
  harnessCase: McpoiHarnessCase,
): { before: McpoiPlanVariant; after: McpoiPlanVariant; extraDriveAfter?: number } {
  switch (harnessCase.caseId) {
    case 'POI-ORDER-001':
      return { before: variantById('A'), after: variantById('B'), extraDriveAfter: 35 };
    case 'POI-INSERT-002':
      return {
        before: variantById('D'),
        after: { ...variantById('C'), variantId: 'C' },
      };
    case 'POI-REMOVE-003': {
      const a = variantById('A');
      return {
        before: a,
        after: {
          ...a,
          variantId: 'A',
          title: '删除 Lava Show',
          items: removePoi(a.items, 'POI-LAVA-SHOW'),
        },
      };
    }
    case 'POI-ADD-004': {
      const b = variantById('B');
      return {
        before: b,
        after: {
          ...b,
          variantId: 'B',
          title: '增加 Skógafoss 登顶',
          items: addSkogafossSummit(b.items),
        },
      };
    }
    case 'POI-SPLIT-005':
      return {
        before: buildVariantCUnifiedGlacier(),
        after: variantById('D'),
      };
    case 'POI-REPLACE-006': {
      const a = variantById('A');
      return {
        before: a,
        after: {
          ...a,
          variantId: 'A',
          title: 'Dyrhólaey 替换 Lava Show',
          items: replacePoi(a.items, 'POI-DYRHOLAEY', 'POI-LAVA-SHOW'),
        },
      };
    }
    case 'POI-SWAP-007': {
      const d = variantById('D');
      return {
        before: d,
        after: {
          ...d,
          variantId: 'D',
          title: '冰河湖后移',
          items: moveJokulsarlonLater(d.items),
        },
      };
    }
    case 'POI-CHAIN-008': {
      const a = variantById('A');
      return {
        before: a,
        after: {
          ...a,
          variantId: 'A',
          title: 'Seljalandsfoss 延迟 50 分钟',
          items: applyDelay(a.items, 'POI-SELJALANDSFOSS', 50),
        },
      };
    }
    default: {
      const base = harnessCase.baseVariant ?? 'A';
      const v = variantById(base);
      return { before: v, after: v };
    }
  }
}

const CASE_EXPECTATIONS: Record<string, McpoiHarnessCaseExpectation> = {
  'POI-ORDER-001': {
    caseId: 'POI-ORDER-001',
    planStatusBefore: 'INFEASIBLE',
    planStatusAfter: 'FEASIBLE_WITH_TRADEOFF',
    mustImproveHardConstraints: true,
    mustSatisfyConstraintAfter: ['H-07'],
  },
  'POI-INSERT-002': {
    caseId: 'POI-INSERT-002',
    planStatusAfter: 'INFEASIBLE',
    mustViolateConstraintAfter: ['H-05'],
  },
  'POI-REMOVE-003': {
    caseId: 'POI-REMOVE-003',
    mustViolateConstraintAfter: ['S-03'],
  },
  'POI-ADD-004': {
    caseId: 'POI-ADD-004',
    mustViolateConstraintAfter: ['H-03'],
  },
  'POI-SPLIT-005': {
    caseId: 'POI-SPLIT-005',
    planStatusBefore: 'INFEASIBLE',
    planStatusAfter: 'FEASIBLE_WITH_SPLIT',
    mustHaveSplitAfter: true,
    mustSatisfyConstraintAfter: ['H-04', 'H-05'],
  },
  'POI-REPLACE-006': {
    caseId: 'POI-REPLACE-006',
    mustSatisfyConstraintAfter: ['H-07'],
    mustLosePhotographyAfter: true,
  },
  'POI-SWAP-007': {
    caseId: 'POI-SWAP-007',
    mustViolateConstraintAfter: ['S-06'],
  },
  'POI-CHAIN-008': {
    caseId: 'POI-CHAIN-008',
    planStatusAfter: 'INFEASIBLE',
    mustViolateConstraintAfter: ['H-06', 'S-06'],
  },
};

function buildRecommendation(before: McpoiPlanEvaluation, after: McpoiPlanEvaluation): {
  recommendation: string;
  reason: string;
} {
  if (after.status === 'INFEASIBLE') {
    return {
      recommendation: 'REJECT_CHANGE',
      reason: `变更后仍存在硬约束冲突：${after.hardViolations.join(', ')}`,
    };
  }
  if (before.status === 'INFEASIBLE') {
    return {
      recommendation: 'ACCEPT_CHANGE',
      reason: '消除硬约束冲突，整体可执行性提升',
    };
  }
  if (after.metrics.hasSplit) {
    return {
      recommendation: 'ACCEPT_SPLIT',
      reason: '分流以同时满足年龄、体力与核心体验约束',
    };
  }
  return {
    recommendation: 'REVIEW_TRADEOFF',
    reason: '存在软约束代价，需权衡',
  };
}

function assertCase(
  expectation: McpoiHarnessCaseExpectation,
  before: McpoiPlanEvaluation,
  after: McpoiPlanEvaluation,
): string[] {
  const errors: string[] = [];

  if (expectation.planStatusBefore && before.status !== expectation.planStatusBefore) {
    errors.push(
      `planStatusBefore: expected ${expectation.planStatusBefore}, got ${before.status}`,
    );
  }
  if (expectation.planStatusAfter && after.status !== expectation.planStatusAfter) {
    errors.push(`planStatusAfter: expected ${expectation.planStatusAfter}, got ${after.status}`);
  }
  if (expectation.mustImproveHardConstraints && after.hardViolations.length >= before.hardViolations.length) {
    errors.push('expected fewer hard violations after change');
  }
  if (expectation.mustHaveSplitAfter && !after.metrics.hasSplit) {
    errors.push('expected split after change');
  }
  if (expectation.mustLosePhotographyAfter && after.metrics.photographyScore >= before.metrics.photographyScore) {
    errors.push('expected photography score to decrease');
  }
  for (const c of expectation.mustViolateConstraintAfter ?? []) {
    if (!after.hardViolations.includes(c) && !after.softViolations.includes(c)) {
      const state = after.assessments.find((a) => a.constraintId === c)?.state;
      if (state !== 'VIOLATED' && state !== 'WARN') {
        errors.push(`expected ${c} violated after, state=${state}`);
      }
    }
  }
  for (const c of expectation.mustSatisfyConstraintAfter ?? []) {
    const state = after.assessments.find((a) => a.constraintId === c)?.state;
    if (state === 'VIOLATED') {
      errors.push(`expected ${c} satisfied after, still violated`);
    }
  }
  return errors;
}

export function runMcpoiHarnessCase(harnessCase: McpoiHarnessCase): McpoiHarnessCaseResult {
  const { before: beforePlan, after: afterPlan, extraDriveAfter } = resolveHarnessCasePlans(harnessCase);
  const before = evaluateMcpoiPlanVariant(beforePlan);
  const after = evaluateMcpoiPlanDay({
    items: afterPlan.items,
    dayIndex: afterPlan.dayIndex,
    variantId: afterPlan.variantId,
    extraDriveMinutes: extraDriveAfter,
  });

  const directImpacts = diffConstraintStates(before, after);
  const downstreamImpacts = buildDownstreamImpacts(before, after);
  const { recommendation, reason } = buildRecommendation(before, after);

  const expectation = CASE_EXPECTATIONS[harnessCase.caseId];
  const errors = expectation ? assertCase(expectation, before, after) : [];

  return {
    caseId: harnessCase.caseId,
    pass: errors.length === 0,
    errors,
    before,
    after,
    decision: {
      planStatusBefore: before.status,
      planStatusAfter: after.status,
      directImpacts,
      downstreamImpacts,
      affectedMembers: [
        ...new Set([...affectedMembersFromEval(before), ...affectedMembersFromEval(after)]),
      ],
      recommendation,
      reason,
    },
  };
}

export interface McpoiBenchmarkHarnessGateResult {
  pass: boolean;
  caseCount: number;
  passedCount: number;
  variantGatePass: boolean;
  cases: McpoiHarnessCaseResult[];
  errors: string[];
}

export function runMcpoiBenchmarkHarnessGate(): McpoiBenchmarkHarnessGateResult {
  const errors: string[] = [];
  const cases = MCPOI_BENCHMARK_HARNESS_CASES.map(runMcpoiHarnessCase);

  let variantGatePass = true;
  for (const variant of MCPOI_BENCHMARK_PLAN_VARIANTS) {
    const evalResult = evaluateMcpoiPlanVariant(variant);
    if (evalResult.status !== variant.expectedStatus) {
      variantGatePass = false;
      errors.push(
        `variant ${variant.variantId}: expected ${variant.expectedStatus}, got ${evalResult.status}`,
      );
    }
    for (const c of variant.expectedViolations ?? []) {
      const violated =
        evalResult.hardViolations.includes(c) || evalResult.softViolations.includes(c);
      if (!violated) {
        variantGatePass = false;
        errors.push(`variant ${variant.variantId}: expected violation ${c} not found`);
      }
    }
  }

  for (const c of cases) {
    if (!c.pass) {
      errors.push(`${c.caseId}: ${c.errors.join('; ')}`);
    }
  }

  const passedCount = cases.filter((c) => c.pass).length;

  return {
    pass: variantGatePass && passedCount === cases.length,
    caseCount: cases.length,
    passedCount,
    variantGatePass,
    cases,
    errors,
  };
}

export function expectMcpoiBenchmarkHarnessPass(result: McpoiBenchmarkHarnessGateResult): void {
  if (!result.pass) {
    throw new Error(
      `MCPOI benchmark harness failed (${result.passedCount}/${result.caseCount} cases, variantGate=${result.variantGatePass}):\n${result.errors.join('\n')}`,
    );
  }
}
