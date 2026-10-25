/**
 * Raw Input → System1TaskFrame。冻结语义后再进 Runtime，禁止 Fast Path 直接吃正则。
 */

import type { AgentTaskContractV1 } from '../harness/agent-task-contract.types';
import type { UnifiedIntentDecision } from '../intent/unified-intent.types';
import { LIVE_FEASIBILITY_UTTERANCE_RE } from '../utils/live-feasibility-utterance.util';
import type {
  System1ClaimType,
  System1Lifecycle,
  System1QuestionType,
  System1RequestedAction,
  System1RiskLevel,
  System1TargetType,
  System1TaskFrame,
} from './system1-runtime.types';

const WRITE_RE =
  /删除|移除|删掉|去掉|取消预订|取消订单|帮我加到行程|加入行程|添加到行程|加进行程/;
const ADD_WRITE_RE = /(?:添加|加入)\s+\S+/;
const FEASIBILITY_RE = LIVE_FEASIBILITY_UTTERANCE_RE;
const LODGING_RE =
  /哪一天没住宿|哪天没住宿|哪一天没有住宿|哪天没有住宿|还缺住宿|明天住哪里|今晚住哪|有没有订酒店/;
const TODAY_RE = /今天怎么安排|今日行程|今天行程|今天做什么|今天去哪/;
const NEXT_RE = /下一站|下一个景点|接下来去哪|下一程/;
const RECOMMEND_COMPARE_RE =
  /哪个更值得|哪个更好|哪个更推荐|更值得去|二选一|compare|versus|\bvs\.?\b/i;
const TOMORROW_RE = /明天|明日|tomorrow/i;
const TODAY_TEMPORAL_RE = /今天|今日|现在|刚才|\btoday\b|\bnow\b/i;

const POI_HINTS: Array<{ name: string; re: RegExp }> = [
  { name: '斯科加瀑布', re: /斯科加|Skógafoss|Skogafoss/i },
  { name: '冰河湖', re: /冰河湖|Jökulsárlón|Jokulsarlon|冰川湖/i },
  { name: '钻石沙滩', re: /钻石沙滩|Diamond\s*Beach/i },
  { name: '蓝湖', re: /蓝湖|Blue\s*Lagoon/i },
  { name: '维克', re: /维克|V[íi]k\b/i },
  { name: '黄金圈', re: /黄金圈|Golden\s*Circle/i },
];

function resolveLifecycle(raw?: string | null): System1Lifecycle {
  const t = String(raw ?? '').toUpperCase();
  if (t === 'PLANNING' || t === 'TRAVELING' || t === 'COMPLETED') return t;
  return 'PLANNING';
}

function detectTarget(message: string): System1TaskFrame['target'] | undefined {
  for (const hint of POI_HINTS) {
    if (hint.re.test(message)) return { type: 'POI', name: hint.name };
  }
  if (LODGING_RE.test(message)) return { type: 'LODGING', name: '住宿' };
  if (/第\s*\d+\s*天|day\s*\d+/i.test(message)) return { type: 'DAY' };
  return undefined;
}

function detectTemporal(message: string): System1TaskFrame['temporalScope'] | undefined {
  if (TOMORROW_RE.test(message)) return { type: 'TOMORROW' };
  if (TODAY_TEMPORAL_RE.test(message)) {
    return /现在|刚才|\bnow\b/i.test(message) ? { type: 'NOW' } : { type: 'TODAY' };
  }
  return undefined;
}

function isWriteMutation(message: string): boolean {
  const m = String(message ?? '');
  if (WRITE_RE.test(m)) return true;
  if (ADD_WRITE_RE.test(m) && !/建议(?:添加|加入)|可以加|要不要加/.test(m)) return true;
  return false;
}

function fromContractTaskType(taskType: string | undefined): {
  questionType: System1QuestionType;
  requestedAction: System1RequestedAction;
  riskLevel: System1RiskLevel;
} | null {
  if (taskType === 'LIVE_EXECUTION') {
    return { questionType: 'FEASIBILITY', requestedAction: 'ASSESS', riskLevel: 'HIGH' };
  }
  if (taskType === 'TRIP_QUERY') {
    return { questionType: 'STATE_QUERY', requestedAction: 'READ', riskLevel: 'LOW' };
  }
  if (taskType === 'ITINERARY_ADJUST') {
    return { questionType: 'WRITE_MUTATION', requestedAction: 'WRITE', riskLevel: 'HIGH' };
  }
  if (taskType === 'DECISION_SUPPORT') {
    return { questionType: 'RECOMMEND', requestedAction: 'RECOMMEND', riskLevel: 'MEDIUM' };
  }
  if (taskType === 'GENERAL_RESEARCH') {
    return { questionType: 'KNOWLEDGE_QA', requestedAction: 'EXPLAIN', riskLevel: 'LOW' };
  }
  return null;
}

export function compileSystem1TaskFrame(input: {
  message: string;
  tripId?: string | null;
  lifecycle?: string | null;
  contract?: AgentTaskContractV1 | null;
  unifiedIntent?: string | null;
  creOperation?: string | null;
  actionKind?: string | null;
  taskType?: string | null;
}): System1TaskFrame {
  const message = String(input.message ?? '').trim();
  const contractType = input.contract?.taskType ?? input.taskType ?? undefined;
  const mapped = fromContractTaskType(contractType);
  const write = isWriteMutation(message);

  let questionType: System1QuestionType = mapped?.questionType ?? 'KNOWLEDGE_QA';
  let requestedAction: System1RequestedAction = mapped?.requestedAction ?? 'READ';
  let riskLevel: System1RiskLevel = mapped?.riskLevel ?? 'LOW';

  if (write) {
    questionType = 'WRITE_MUTATION';
    requestedAction = 'WRITE';
    riskLevel = 'HIGH';
  } else if (FEASIBILITY_RE.test(message)) {
    questionType = 'FEASIBILITY';
    requestedAction = 'ASSESS';
    riskLevel = 'HIGH';
  } else if (LODGING_RE.test(message) || TODAY_RE.test(message) || NEXT_RE.test(message)) {
    questionType = 'STATE_QUERY';
    requestedAction = 'READ';
    riskLevel = 'LOW';
  } else if (RECOMMEND_COMPARE_RE.test(message)) {
    /** 软推荐/比较：不是 Decision Support 开卡，也不是 Safety Feasibility */
    questionType = 'RECOMMEND';
    requestedAction = 'RECOMMEND';
    riskLevel = 'LOW';
  }

  let target = detectTarget(message);
  if (!target && (LODGING_RE.test(message) || contractType === 'TRIP_QUERY')) {
    if (LODGING_RE.test(message)) target = { type: 'LODGING' as System1TargetType, name: '住宿' };
    else if (TODAY_RE.test(message) || NEXT_RE.test(message)) {
      target = { type: 'DAY' as System1TargetType };
    } else if (input.tripId?.trim()) {
      target = { type: 'TRIP', id: input.tripId.trim() };
    }
  }

  const temporalScope = detectTemporal(message);
  const lifecycle: System1Lifecycle =
    questionType === 'FEASIBILITY'
      ? 'TRAVELING'
      : resolveLifecycle(input.lifecycle ?? input.contract?.lifecycle);

  const intent =
    input.unifiedIntent?.trim() ||
    (questionType === 'FEASIBILITY'
      ? 'ASSESS_IMPACT'
      : questionType === 'WRITE_MUTATION'
        ? 'LOCAL_EDIT'
        : 'CONSULT');

  return {
    intent,
    questionType,
    target,
    temporalScope,
    requestedAction,
    riskLevel,
    lifecycle,
    sourceSignals: {
      taskType: contractType,
      actionKind: input.actionKind ?? undefined,
      unifiedIntent: input.unifiedIntent ?? undefined,
      creOperation: input.creOperation ?? undefined,
    },
  };
}

export function resolveSystem1RuntimeFamily(
  frame: System1TaskFrame,
  registryKey?: string | null,
  message?: string,
): import('./system1-runtime.types').System1RuntimeFamily | null {
  if (frame.questionType === 'FEASIBILITY' || frame.sourceSignals.taskType === 'LIVE_EXECUTION') {
    return 'LIVE_FEASIBILITY';
  }
  const key = String(registryKey ?? '');
  const msg = String(message ?? '');
  if (key === 'TRIP_QUERY_LODGING' || frame.target?.type === 'LODGING' || LODGING_RE.test(msg)) {
    return 'TRIP_QUERY_LODGING';
  }
  if (key === 'TRIP_QUERY_NEXT' || NEXT_RE.test(msg)) return 'TRIP_QUERY_NEXT';
  if (key === 'TRIP_QUERY_TODAY' || TODAY_RE.test(msg) || frame.temporalScope?.type === 'TODAY') {
    return 'TRIP_QUERY_TODAY';
  }
  if (
    (key === 'TRIP_QUERY_DAY' || frame.target?.type === 'DAY') &&
    frame.requestedAction !== 'WRITE'
  ) {
    return 'TRIP_QUERY_DAY';
  }
  /** Decision Support 开卡仅当合同明确；软推荐走 Knowledge，避免 decision.options 误杀 */
  if (frame.sourceSignals.taskType === 'DECISION_SUPPORT') {
    return 'DECISION_SUPPORT';
  }
  if (
    /天气|气象|气温|路况|封路|forecast|\bweather\b/i.test(msg) &&
    !/租车|自驾|包车|提车|还车|车型|哪个更值得|哪个更好|更值得去/i.test(msg)
  ) {
    return 'WEATHER_ROAD_QA';
  }
  if (
    frame.questionType === 'RECOMMEND' ||
    frame.questionType === 'KNOWLEDGE_QA' ||
    frame.questionType === 'EXPLAIN' ||
    frame.sourceSignals.taskType === 'GENERAL_RESEARCH'
  ) {
    return 'KNOWLEDGE_QA';
  }
  return null;
}

/**
 * Claim-type 候选：驱动 RequiredEvidence，避免推荐题被安全标准拉高。
 */
export function inferSystem1CandidateClaimTypes(
  frame: System1TaskFrame,
): System1ClaimType[] {
  if (frame.questionType === 'FEASIBILITY') return ['FEASIBILITY', 'WORLD_FACT'];
  if (frame.questionType === 'STATE_QUERY') return ['STATE_FACT'];
  if (frame.questionType === 'RECOMMEND') return ['RECOMMENDATION'];
  if (frame.questionType === 'WRITE_MUTATION') return [];
  if (frame.questionType === 'KNOWLEDGE_QA' || frame.questionType === 'EXPLAIN') {
    return ['STATE_FACT'];
  }
  return ['STATE_FACT'];
}
