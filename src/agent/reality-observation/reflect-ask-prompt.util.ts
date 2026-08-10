/**
 * Reflect 缺口 → ASK 话术闭环：
 * 1) 为 unknowns 生成中文追问卡片
 * 2) FETCH 耗尽后，将用户可补的 REQUIRED 缺口提升为 ASK_USER
 * 3) DAY_PACE 过载时，把疲劳确认纳入追问
 */

import { getObservationCapability } from './observation-capability.registry';
import type {
  DerivedFact,
  ObservedFact,
  ObservationNeed,
  ObservationPlan,
  ObservationReflection,
  ObservationUnknown,
  RorObservationTask,
} from './reality-observation.types';

/** 避免与 observation-executor 循环依赖 */
export type AskLoopState = {
  plan: ObservationPlan;
  observedFacts: ObservedFact[];
  derivedFacts: DerivedFact[];
  unknowns: ObservationUnknown[];
  reflectRoundsUsed: number;
  lastReflection: ObservationReflection | null;
};

export type RorAskCard = {
  key: string;
  promptZh: string;
  whyZh: string;
  suggestedAnswers?: string[];
  impact: ObservationUnknown['impact'];
  gapKind: ObservationUnknown['gapKind'];
  blocking: boolean;
  promotedFromFetch?: boolean;
};

/** 用户口头可补、值得闭环追问的键（天气/路况等系统源不追问） */
export const USER_ANSWERABLE_OBSERVATION_KEYS = new Set([
  'user.currentFatigue',
  'user.earlyStartWillingness',
  'targetDay.activities',
  'targetDay.accommodation',
  'targetDay.date',
  'page.focusDay',
  'trip.destination',
  'participants',
  'team.memberCapability',
  'vehicle.profile',
  'vehicle.driveType',
  'vehicle.rentalRestriction',
  'experience.product',
  'experience.physicalIntensity',
  'booking.fixedCommitments',
  'booking.availability',
  'activity.ref',
  'travelMode',
  'route.travelTimeMatrix',
]);

const ASK_COPY: Record<
  string,
  { prompt: string; why: string; answers?: string[] }
> = {
  'user.currentFatigue': {
    prompt: '今天走完这些安排后，你更接近哪种体感？',
    why: '「是否太赶」需要结合你的疲劳感确认，不能只靠行程密度推断。',
    answers: ['还很轻松', '有点累但能接受', '已经偏累', '明显过载'],
  },
  'user.earlyStartWillingness': {
    prompt: '如果把出发时间提前约 1 小时，你能接受吗？',
    why: '早出发会换日照与缓冲，但也可能更累。',
    answers: ['可以', '勉强可以', '不太想', '完全不行'],
  },
  'targetDay.activities': {
    prompt: '这一天已经定下来的活动有哪些？（名称+大概时长即可）',
    why: '没有活动清单就无法判断节奏，也无法评估能不能再加一项。',
  },
  'targetDay.accommodation': {
    prompt: '当晚住在哪里？入住/退房时间有硬限制吗？',
    why: '住宿是日程硬锚点，会影响可驾驶窗口。',
  },
  'route.travelTimeMatrix': {
    prompt: '活动之间大概要开多久？或告诉我相邻两点名称。',
    why: '段间车程是可执行性与「是否太赶」的关键输入。',
  },
  'vehicle.driveType': {
    prompt: '你的车是 2WD 还是 4WD/AWD？租约允许走 F-road 吗？',
    why: '高地 / F 路是否可执行取决于车辆与租约限制。',
    answers: ['2WD，不走 F 路', '4WD，可谨慎走 F 路', '还没租车 / 不清楚'],
  },
  'vehicle.profile': {
    prompt: '请补充车辆类型（2WD/4WD）和主要租约限制（如不能走 F 路）。',
    why: '路线合规需要车辆档案。',
  },
  'vehicle.rentalRestriction': {
    prompt: '租约是否禁止 F-road / 高地 / 涉水？',
    why: '租约限制会直接否决部分路段。',
    answers: ['禁止 F-road', '禁止高地', '无特殊限制', '不清楚'],
  },
  'participants': {
    prompt: '同行几人？有没有老人、小孩或明显体能限制？',
    why: '体验强度与日程密度需要匹配团队。',
  },
  'team.memberCapability': {
    prompt: '团队整体体能更接近轻松游、普通强度，还是高强度户外？',
    why: '用于判断活动强度是否匹配。',
    answers: ['轻松游', '普通强度', '高强度户外', '成员差异大'],
  },
  'experience.product': {
    prompt: '你想加/替换的具体体验叫什么？（或贴官方名称）',
    why: '需要明确产品才能核对时长、强度与是否需预订。',
  },
  'experience.physicalIntensity': {
    prompt: '这个体验你预期的强度是轻、中，还是高？',
    why: '强度会影响当日是否过载。',
    answers: ['轻', '中', '高'],
  },
  'booking.availability': {
    prompt: '这项体验现在是已预订、占位，还是还没订？',
    why: '固定订单会锁时间锚点；未订则需评估可订性。',
    answers: ['已确认预订', '占位/待付', '还没订', '不清楚'],
  },
  'booking.fixedCommitments': {
    prompt: '这一天有哪些已经付钱/确认、不能改期的订单？',
    why: '硬锚点决定哪些活动不能挪。',
  },
  'activity.ref': {
    prompt: '要替换/调整的是哪一个活动？（名称或行程里的条目）',
    why: '需要先定位对象才能给替代方案。',
  },
  'trip.destination': {
    prompt: '这次行程的主要目的地是哪里？',
    why: '目的地决定天气、道路与体验目录范围。',
  },
  'travelMode': {
    prompt: '这一天主要是自驾，还是公共交通/跟团？',
    why: '出行方式决定是否需要车辆与路况观察。',
    answers: ['自驾', '公共交通', '跟团/接驳', '混合'],
  },
  'targetDay.date': {
    prompt: '你说的是哪一天？（日期或「第 N 天」）',
    why: '目标日不明就无法装载当日现实。',
  },
  'page.focusDay': {
    prompt: '请确认要看的是第几天？',
    why: '焦点日用于对齐行程种子。',
  },
};

function findNeedForKey(plan: ObservationPlan, key: string): ObservationNeed | undefined {
  return plan.needs.find((n) => n.contextKeys.includes(key));
}

export function buildAskCardForUnknown(
  u: ObservationUnknown,
  plan: ObservationPlan,
): RorAskCard {
  const cap = getObservationCapability(u.key);
  const copy = ASK_COPY[u.key];
  const need = findNeedForKey(plan, u.key);
  const promptZh =
    copy?.prompt ||
    need?.question ||
    (cap?.labelZh ? `还需要确认：${cap.labelZh}？` : `还需要确认：${u.key}？`);
  const whyZh =
    copy?.why ||
    need?.reason ||
    u.question ||
    '补齐后才能继续可靠决策。';
  return {
    key: u.key,
    promptZh,
    whyZh,
    suggestedAnswers: copy?.answers,
    impact: u.impact,
    gapKind: u.gapKind,
    blocking: u.blocking,
    promotedFromFetch: u.promotedFromFetch,
  };
}

export function enrichUnknownWithAskPrompt(
  u: ObservationUnknown,
  plan: ObservationPlan,
): ObservationUnknown {
  const card = buildAskCardForUnknown(u, plan);
  return {
    ...u,
    question: card.promptZh,
    askPromptZh: card.promptZh,
    askWhyZh: card.whyZh,
    suggestedAnswers: card.suggestedAnswers,
  };
}

function scheduleDensity(state: AskLoopState): string | null {
  const d = state.derivedFacts.find((x) => x.key === 'derived.day.scheduleDensity');
  return d?.value != null ? String(d.value) : null;
}

function hasFact(state: AskLoopState, key: string): boolean {
  return (
    state.observedFacts.some((f) => f.key === key && f.value != null) ||
    state.derivedFacts.some((d) => d.key === key && d.value != null)
  );
}

/**
 * FETCH 已无法继续时：把 REQUIRED + 用户可答的缺口提升为 ASK_USER。
 */
export function promoteFetchGapsToAskUser(
  state: AskLoopState,
): ObservationUnknown[] {
  const out = state.unknowns.map((u) => ({ ...u }));
  const byKey = new Map(out.map((u) => [u.key, u]));

  for (const need of state.plan.needs) {
    if (need.necessity !== 'REQUIRED') continue;
    for (const key of need.contextKeys) {
      if (hasFact(state, key)) continue;
      if (!USER_ANSWERABLE_OBSERVATION_KEYS.has(key)) continue;
      const existing = byKey.get(key);
      const base: ObservationUnknown = existing ?? {
        key,
        question: need.question,
        gapKind: 'ASK_USER',
        impact: need.blocking ? 'HIGH' : 'MEDIUM',
        blocking: need.blocking === true || need.necessity === 'REQUIRED',
        canFetch: false,
        canDerive: false,
        mustAskUser: true,
        promotedFromFetch: true,
      };
      const promoted: ObservationUnknown = {
        ...base,
        gapKind: 'ASK_USER',
        mustAskUser: true,
        canFetch: false,
        promotedFromFetch: true,
        blocking:
          base.blocking ||
          need.blocking === true ||
          need.necessity === 'REQUIRED',
        impact: base.impact === 'LOW' ? 'MEDIUM' : base.impact,
      };
      byKey.set(key, enrichUnknownWithAskPrompt(promoted, state.plan));
    }
  }

  return [...byKey.values()].map((u) => enrichUnknownWithAskPrompt(u, state.plan));
}

/**
 * 节奏过载闭环：密度高且用户在问「太赶/太累」时，追问疲劳确认。
 */
export function ensurePaceFatigueAsk(
  state: AskLoopState,
  message?: string,
): ObservationUnknown[] {
  const unknowns = state.unknowns.map((u) => ({ ...u }));
  if (state.plan.operation !== 'DAY_PACE') return unknowns;
  if (hasFact(state, 'user.currentFatigue')) return unknowns;

  const density = scheduleDensity(state);
  const msg = message ?? state.plan.scope.message ?? '';
  const paceTalk = /太赶|太累|轻松|节奏|疲劳|pace|density|过载/i.test(msg);
  if (!(density === 'HIGH' || (density === 'MEDIUM' && paceTalk) || paceTalk)) {
    return unknowns;
  }

  /**
   * 「会不会太赶」诊断：先用密度/驾驶分钟作答，疲劳确认为软缺口，不阻断主链。
   * 「太赶了，轻松一点」改排：仍阻断，先确认体感。
   */
  const assessmentOnly =
    /会不会太赶|是不是太赶|会不会很赶|会不会过赶|太赶了吗|安排得?太赶吗|是不是安排得太赶/i.test(
      msg,
    ) && !/轻松一点|改轻松|松一点|放缓|帮我(?:松|减|删|改)/i.test(msg);

  const idx = unknowns.findIndex((u) => u.key === 'user.currentFatigue');
  const fatigue: ObservationUnknown = enrichUnknownWithAskPrompt(
    {
      key: 'user.currentFatigue',
      question: ASK_COPY['user.currentFatigue'].prompt,
      gapKind: 'ASK_USER',
      impact: density === 'HIGH' ? 'HIGH' : 'MEDIUM',
      blocking: !assessmentOnly,
      canFetch: false,
      canDerive: false,
      mustAskUser: true,
      promotedFromFetch: false,
    },
    state.plan,
  );
  if (idx >= 0) unknowns[idx] = { ...unknowns[idx], ...fatigue };
  else unknowns.push(fatigue);
  return unknowns;
}

function shouldForceAskUser(
  unknowns: ObservationUnknown[],
  reflection: ObservationReflection | null,
): boolean {
  if (reflection?.nextAction === 'ASK_USER') return true;
  return unknowns.some((u) => u.mustAskUser && u.blocking);
}

/**
 * 「会不会太赶」诊断：缺事实/疲劳确认为软缺口，不阻断主链作答。
 */
function isPaceAssessmentMessage(msg: string): boolean {
  const m = String(msg ?? '');
  if (!m.trim()) return false;
  if (/轻松一点|改轻松|松一点|放缓|帮我(?:松|减|删|改)|不要太赶.*(?:改|调)|太赶了[，,].*(?:轻松|改)/i.test(m)) {
    return false;
  }
  return /会不会太赶|是不是太赶|会不会很赶|会不会过赶|太赶了吗|安排得?太赶吗|是不是安排得太赶/i.test(
    m,
  );
}

/**
 * 在 Reflect 循环结束后调用：丰富话术 + 提升缺口 + 必要时改写 nextAction。
 */
export function finalizeObservationAskLoop(
  state: AskLoopState,
  opts?: { message?: string },
): AskLoopState {
  const reflection = state.lastReflection;
  const fetchExhausted =
    reflection == null ||
    reflection.nextAction === 'FREEZE_SNAPSHOT' ||
    reflection.nextAction === 'ASK_USER' ||
    reflection.nextAction === 'ABORT' ||
    state.reflectRoundsUsed >= state.plan.maxReflectRounds;

  let unknowns = state.unknowns.map((u) =>
    enrichUnknownWithAskPrompt(u, state.plan),
  );

  if (fetchExhausted) {
    unknowns = promoteFetchGapsToAskUser({ ...state, unknowns });
    unknowns = ensurePaceFatigueAsk({ ...state, unknowns }, opts?.message);
  }

  const assessmentOnly = isPaceAssessmentMessage(opts?.message ?? state.plan.scope.message ?? '');
  if (assessmentOnly) {
    unknowns = unknowns.map((u) =>
      u.mustAskUser ? { ...u, blocking: false, impact: u.impact === 'HIGH' ? 'MEDIUM' : u.impact } : u,
    );
  }

  let lastReflection = reflection;
  if (shouldForceAskUser(unknowns, reflection) && reflection?.nextAction !== 'ABORT') {
    const blockingKeys = unknowns
      .filter((u) => u.mustAskUser && u.blocking)
      .map((u) => u.key);
    lastReflection = {
      sufficientlyObserved: false,
      missingFacts: reflection?.missingFacts ?? [],
      conflictingFacts: reflection?.conflictingFacts ?? [],
      blockingUnknowns: [...new Set(blockingKeys)],
      nextAction: 'ASK_USER',
      round: reflection?.round ?? state.reflectRoundsUsed,
    };
  } else if (
    assessmentOnly &&
    lastReflection &&
    lastReflection.nextAction === 'ASK_USER' &&
    !unknowns.some((u) => u.mustAskUser && u.blocking) &&
    !(lastReflection.conflictingFacts?.some((c) => /\[HARD:/i.test(c)) ?? false)
  ) {
    /** 诊断问：无硬冲突时允许冻结继续，由编排作答 */
    lastReflection = {
      ...lastReflection,
      sufficientlyObserved: true,
      blockingUnknowns: [],
      nextAction: 'FREEZE_SNAPSHOT',
    };
  }

  return {
    ...state,
    unknowns,
    lastReflection,
  };
}

export function selectAskCards(
  unknowns: ObservationUnknown[],
  plan: ObservationPlan,
): RorAskCard[] {
  const asks = unknowns.filter((u) => u.mustAskUser);
  const ranked = [...asks].sort((a, b) => {
    const score = (u: ObservationUnknown) =>
      (u.blocking ? 8 : 0) +
      (u.impact === 'HIGH' ? 4 : u.impact === 'MEDIUM' ? 2 : 0) +
      (u.promotedFromFetch ? 1 : 0);
    return score(b) - score(a);
  });
  // 一次最多追问 3 个，避免盘问感
  return ranked.slice(0, 3).map((u) => buildAskCardForUnknown(u, plan));
}

export function formatAskClarificationMessage(input: {
  operation: RorObservationTask;
  cards: RorAskCard[];
  labelZh?: string;
}): string {
  const title = input.labelZh || input.operation;
  if (!input.cards.length) {
    return `观察「${title}」后还需要您补充一点信息，补齐后再继续。`;
  }
  const lines = input.cards.map((c, i) => {
    const answers =
      c.suggestedAnswers?.length
        ? `\n  可选：${c.suggestedAnswers.join(' / ')}`
        : '';
    return `${i + 1}. ${c.promptZh}\n   （原因：${c.whyZh}）${answers}`;
  });
  return (
    `为了把「${title}」看清楚，还需要您确认：\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `您可以直接按序号回复，或补充更具体的说明；补齐后我会继续 Gate/求解。`
  );
}
