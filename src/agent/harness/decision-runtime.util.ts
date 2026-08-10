/**
 * Decision Runtime — Options → Gate → Compare → Recommend → Select → Commit（不 Apply Plan）。
 * @see CASE-D01 / D02 in nara-agent-harness-golden-cases-v1.md
 */

import type { AgentTaskContractV1 } from './agent-task-contract.types';
import { assertCapability } from './assert-task-capability.util';

export const DECISION_PROBLEM_SCHEMA = 'nara.decision_problem.v1' as const;

export type DecisionProblemKind =
  | 'LODGING_NIGHT'
  | 'ROUTE_SEGMENT'
  | 'ACTIVITY_SLOT'
  | 'TRANSPORT_MODE'
  | 'VEHICLE_ROAD_FIT'
  | 'GENERIC_CHOICE';

export type DecisionOptionV1 = {
  optionId: string;
  labelZh: string;
  summaryZh?: string;
  evidenceRefs?: string[];
  gateHints?: string[];
  /** 比较用原始分（越高越好）；Gate 失败后不计推荐 */
  scoreHint?: number;
  /** 维度分（Compare） */
  dimensions?: Record<string, number>;
};

export type DecisionProblemV1 = {
  schemaId: typeof DECISION_PROBLEM_SCHEMA;
  version: 1;
  decisionId: string;
  tripId?: string;
  taskId: string;
  kind: DecisionProblemKind;
  decisionKey?: string;
  questionZh: string;
  constraintKeys: string[];
  options: DecisionOptionV1[];
  status: 'OPEN' | 'NEED_SELECT' | 'COMMITTED' | 'CANCELLED';
  recommendedOptionId?: string;
  selectedOptionId?: string;
  commitAuthority: 'DECISION_ONLY';
};

export type DecisionRuntimePhase =
  | 'PROBLEM'
  | 'OPTIONS'
  | 'GATE'
  | 'COMPARE'
  | 'RECOMMEND'
  | 'SELECT'
  | 'COMMIT';

export type DecisionRuntimeTraceV1 = {
  phase: DecisionRuntimePhase;
  decisionId: string;
  taskId: string;
  allowCreateDecision: boolean;
  denyApplyPlan: boolean;
};

export type DecisionGateResult = {
  optionId: string;
  passed: boolean;
  reasonsZh: string[];
};

export type DecisionCompareRow = {
  optionId: string;
  score: number;
  dimensions: Record<string, number>;
  eliminatedByGate: boolean;
};

export type DecisionPipelineResultV1 = {
  problem: DecisionProblemV1;
  phasesCompleted: DecisionRuntimePhase[];
  gateResults: DecisionGateResult[];
  compareRows: DecisionCompareRow[];
  recommendationZh: string;
  /** 用户尚未 Select 时为 NEED_SELECT */
  awaitingSelect: boolean;
};

/**
 * 从 TaskContract 进入 Decision Runtime：仅当 contract 允许 CREATE_DECISION 且禁止 APPLY。
 */
export function assertDecisionRuntimeEntry(contract: AgentTaskContractV1): DecisionRuntimeTraceV1 {
  const gate = assertCapability(contract, 'CREATE_DECISION');
  if (gate.ok === false) {
    throw new Error(`[DecisionRuntime] ${gate.reason}`);
  }
  if (contract.capabilities.allow.includes('APPLY')) {
    throw new Error(
      `[DecisionRuntime] APPLY is forbidden in Decision Runtime (taskType=${contract.taskType})`,
    );
  }
  return {
    phase: 'PROBLEM',
    decisionId: `dec_${contract.taskId}`,
    taskId: contract.taskId,
    allowCreateDecision: true,
    denyApplyPlan: contract.capabilities.deny.includes('APPLY'),
  };
}

export function createOpenDecisionProblem(input: {
  contract: AgentTaskContractV1;
  kind: DecisionProblemKind;
  questionZh: string;
  options: DecisionOptionV1[];
  constraintKeys?: string[];
  recommendedOptionId?: string;
  decisionKey?: string;
}): DecisionProblemV1 {
  const trace = assertDecisionRuntimeEntry(input.contract);
  return {
    schemaId: DECISION_PROBLEM_SCHEMA,
    version: 1,
    decisionId: trace.decisionId,
    tripId: input.contract.tripId,
    taskId: input.contract.taskId,
    kind: input.kind,
    decisionKey: input.decisionKey,
    questionZh: input.questionZh,
    constraintKeys: input.constraintKeys ?? [...(input.contract.contextPolicy.required ?? [])],
    options: input.options,
    status: input.options.length > 0 ? 'NEED_SELECT' : 'OPEN',
    recommendedOptionId: input.recommendedOptionId,
    commitAuthority: 'DECISION_ONLY',
  };
}

/** Commit：只锁定选项，不产出 Plan Apply */
export function commitDecisionSelection(
  problem: DecisionProblemV1,
  selectedOptionId: string,
): DecisionProblemV1 {
  const opt = problem.options.find((o) => o.optionId === selectedOptionId);
  if (!opt) {
    throw new Error(`[DecisionRuntime] unknown optionId=${selectedOptionId}`);
  }
  return {
    ...problem,
    selectedOptionId,
    status: 'COMMITTED',
    commitAuthority: 'DECISION_ONLY',
  };
}

export function projectDecisionProblemForTrace(problem: DecisionProblemV1): Record<string, unknown> {
  return {
    schema_id: problem.schemaId,
    decision_id: problem.decisionId,
    task_id: problem.taskId,
    kind: problem.kind,
    decision_key: problem.decisionKey ?? null,
    status: problem.status,
    option_count: problem.options.length,
    recommended_option_id: problem.recommendedOptionId ?? null,
    selected_option_id: problem.selectedOptionId ?? null,
    commit_authority: problem.commitAuthority,
  };
}

export type DecisionGatePolicy = (option: DecisionOptionV1, ctx: { message: string }) => DecisionGateResult;

/** 默认 Gate：显式 gateHints 含「不可行」则失败；否则通过 */
export const defaultDecisionGatePolicy: DecisionGatePolicy = (option) => {
  const hints = option.gateHints ?? [];
  const fail = hints.some((h) => /不可行|禁止|阻断|FAIL/i.test(h));
  return {
    optionId: option.optionId,
    passed: !fail,
    reasonsZh: fail ? hints.filter((h) => /不可行|禁止|阻断|FAIL/i.test(h)) : ['通过预检'],
  };
};

function sumDimensions(dims: Record<string, number> | undefined, scoreHint?: number): number {
  if (dims && Object.keys(dims).length > 0) {
    return Object.values(dims).reduce((a, b) => a + b, 0);
  }
  return typeof scoreHint === 'number' ? scoreHint : 0;
}

/**
 * Options → Gate → Compare → Recommend（停在 NEED_SELECT，除非传入 selectedOptionId）。
 */
export function runDecisionSupportPipeline(input: {
  contract: AgentTaskContractV1;
  kind: DecisionProblemKind;
  questionZh: string;
  options: DecisionOptionV1[];
  message?: string;
  decisionKey?: string;
  constraintKeys?: string[];
  gatePolicy?: DecisionGatePolicy;
  /** 若调用方已选，则走完 SELECT+COMMIT */
  selectedOptionId?: string;
}): DecisionPipelineResultV1 {
  const phasesCompleted: DecisionRuntimePhase[] = ['PROBLEM', 'OPTIONS'];
  const problem0 = createOpenDecisionProblem({
    contract: input.contract,
    kind: input.kind,
    questionZh: input.questionZh,
    options: input.options,
    constraintKeys: input.constraintKeys,
    decisionKey: input.decisionKey,
  });
  phasesCompleted.push('GATE');
  const gatePolicy = input.gatePolicy ?? defaultDecisionGatePolicy;
  const msg = input.message ?? input.questionZh;
  const gateResults = input.options.map((o) => gatePolicy(o, { message: msg }));

  phasesCompleted.push('COMPARE');
  const compareRows: DecisionCompareRow[] = input.options.map((o) => {
    const g = gateResults.find((r) => r.optionId === o.optionId);
    const eliminatedByGate = g ? !g.passed : false;
    const dimensions = o.dimensions ?? { score: o.scoreHint ?? 0 };
    return {
      optionId: o.optionId,
      score: eliminatedByGate ? -Infinity : sumDimensions(o.dimensions, o.scoreHint),
      dimensions,
      eliminatedByGate,
    };
  });

  phasesCompleted.push('RECOMMEND');
  const viable = compareRows
    .filter((r) => !r.eliminatedByGate)
    .sort((a, b) => b.score - a.score);
  const recommendedOptionId = viable[0]?.optionId;
  const recommended = input.options.find((o) => o.optionId === recommendedOptionId);
  const eliminated = gateResults.filter((g) => !g.passed);
  const recommendationZh = recommended
    ? `建议选择「${recommended.labelZh}」` +
      (eliminated.length
        ? `（已排除：${eliminated.map((e) => e.optionId).join('、')}）`
        : '') +
      '。确认后仅 Commit Decision，不会自动改行程。'
    : '当前无可用选项通过 Gate；请补充约束或放宽条件。';

  let problem: DecisionProblemV1 = {
    ...problem0,
    recommendedOptionId,
    status: recommendedOptionId ? 'NEED_SELECT' : 'OPEN',
  };

  let awaitingSelect = true;
  if (input.selectedOptionId) {
    phasesCompleted.push('SELECT', 'COMMIT');
    problem = commitDecisionSelection(problem, input.selectedOptionId);
    awaitingSelect = false;
  }

  return {
    problem,
    phasesCompleted,
    gateResults,
    compareRows,
    recommendationZh,
    awaitingSelect,
  };
}

/** CASE-D01：两驱 vs 四驱 */
export function buildVehicleRoadFitOptions(message: string): DecisionOptionV1[] {
  const highland =
    /高地|F-?road|内陆|斯普林斯|Springs|Kjölur|Sprengisandur|四驱才|必须四驱/i.test(message);
  return [
    {
      optionId: '2wd',
      labelZh: '两驱',
      summaryZh: '铺装公路与大众观光环线成本更低',
      gateHints: highland ? ['高地/F-road 场景下两驱不可行'] : ['铺装主路可行'],
      dimensions: { cost: 80, simplicity: 85, highland_access: highland ? 0 : 40 },
      scoreHint: highland ? 20 : 70,
    },
    {
      optionId: '4wd',
      labelZh: '四驱',
      summaryZh: '高地与砂石路冗余更高，租金更高',
      gateHints: ['高地可选', '铺装路同样可行'],
      dimensions: { cost: 45, simplicity: 55, highland_access: 90 },
      scoreHint: highland ? 90 : 65,
    },
  ];
}

export function runVehicleRoadFitDecision(input: {
  contract: AgentTaskContractV1;
  message: string;
  selectedOptionId?: string;
}): DecisionPipelineResultV1 {
  return runDecisionSupportPipeline({
    contract: input.contract,
    kind: 'VEHICLE_ROAD_FIT',
    decisionKey: 'VEHICLE_ROAD_FIT',
    questionZh: '我们租两驱还是四驱？',
    options: buildVehicleRoadFitOptions(input.message),
    message: input.message,
    selectedOptionId: input.selectedOptionId,
    constraintKeys: ['VEHICLE', 'ROAD_CLASS', 'TRIP_CONSTRAINTS'],
  });
}

/** CASE-D02：环岛 vs 南岸 */
export function buildRouteScopeOptions(message: string): DecisionOptionV1[] {
  const shortTrip = /[456]\s*天|不到一周|时间紧|轻松/.test(message);
  return [
    {
      optionId: 'ring_road',
      labelZh: '环岛',
      summaryZh: '覆盖面广，驾驶强度高',
      gateHints: shortTrip ? ['短行程环岛节奏过满，建议慎重'] : ['行程天数足够时可考虑'],
      dimensions: { coverage: 90, pacing: shortTrip ? 30 : 60, cost: 50 },
      scoreHint: shortTrip ? 40 : 75,
    },
    {
      optionId: 'south_coast',
      labelZh: '只跑南岸',
      summaryZh: '经典密度高、折返少',
      gateHints: ['短中行程友好'],
      dimensions: { coverage: 55, pacing: 85, cost: 70 },
      scoreHint: shortTrip ? 85 : 70,
    },
  ];
}

export function runRouteScopeDecision(input: {
  contract: AgentTaskContractV1;
  message: string;
  selectedOptionId?: string;
}): DecisionPipelineResultV1 {
  return runDecisionSupportPipeline({
    contract: input.contract,
    kind: 'ROUTE_SEGMENT',
    decisionKey: 'ROUTE_SCOPE_RING_VS_SOUTH',
    questionZh: '环岛还是只跑南岸？',
    options: buildRouteScopeOptions(input.message),
    message: input.message,
    selectedOptionId: input.selectedOptionId,
    constraintKeys: ['TRIP_DATE_RANGE', 'PACING', 'TRIP_CONSTRAINTS'],
  });
}

export function tryRunDecisionFromMessage(input: {
  contract: AgentTaskContractV1;
  message: string;
  selectedOptionId?: string;
}): DecisionPipelineResultV1 | null {
  const msg = String(input.message ?? '').trim();
  if (/两驱还是四驱|四驱还是两驱|\b(2wd|4wd)\b/i.test(msg)) {
    return runVehicleRoadFitDecision(input);
  }
  if (/环岛还是|只跑南岸|南岸还是环岛/.test(msg)) {
    return runRouteScopeDecision(input);
  }
  return null;
}
