/**
 * Unified Intent — 确定性信号抽取。
 * 规则只抽动作 / 否定 / 范围 / 主题；不把「天气/午餐」直接定为意图。
 */

import type {
  IntentScope,
  IntentTopic,
  SemanticIntent,
  UnifiedIntentSignals,
} from './unified-intent.types';
import { parseTripDayNumber } from '../utils/itinerary-item-add.util';
import { stripPlanningModeWrapper } from '../utils/strip-planning-mode-wrapper.util';

function stripScheduleAnchor(message: string): string {
  return stripPlanningModeWrapper(String(message ?? ''))
    .replace(/\n*\[日程\][\s\S]*$/u, '')
    .trim();
}

export function extractDayIndexFromUtterance(message: string): number | undefined {
  const raw = String(message ?? '');
  /** UI `[日程] DayN` 在剥离前先取日锚（住宿偏好跟进句常无正文日序） */
  const fromSchedule = raw.match(/\[日程\]\s*Day\s*[-_]?\s*(\d+)/i);
  if (fromSchedule) {
    const n = Number(fromSchedule[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const m = stripScheduleAnchor(message);
  /** 含「第六天」等中文日序；优先于仅阿拉伯数字的 DayN */
  const fromNl = parseTripDayNumber(m);
  if (fromNl != null && fromNl > 0) return fromNl;
  const dayN = m.match(/\bDay\s*(\d+)\b/i) || m.match(/\bD(\d+)\b/i);
  if (!dayN) return undefined;
  const n = Number(dayN[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function extractIntentTopic(message: string): IntentTopic {
  const raw = String(message ?? '');
  const m = stripScheduleAnchor(message);
  if (/天气|气象|下雨|降雨|刮风|风暴|预报|\bweather\b/i.test(m)) return 'WEATHER';
  if (/路况|封路|道路|通行|\broad\b/i.test(m)) return 'ROAD';
  if (/租车|自驾|车型|四驱|订车|预订车|预定车|\brental\b/i.test(m)) return 'VEHICLE';
  if (/午餐|晚饭|晚餐|早饭|早餐|餐厅|美食|用餐|吃饭|正餐|\blunch\b|\bdining\b/i.test(m)) {
    return 'MEAL';
  }
  if (
    /酒店|住宿|民宿|过夜|\bhotel\b|\blodging\b/i.test(m) ||
    /标间|大床|双床|双人房|套房|厨房|景观|海景|自然景色|房价|可订|空房/i.test(m) ||
    (/预算/.test(m) && /\[日程\]\s*Day\s*[-_]?\s*\d+/i.test(raw))
  ) {
    return 'LODGING';
  }
  if (/太赶|太累|节奏|疲劳|\bpace\b/i.test(m)) return 'PACE';
  if (/路线|车程|F-road|驾驶|\broute\b/i.test(m)) return 'ROUTE';
  if (/活动|景点|徒步|替换|\bpoi\b|\bactivity\b/i.test(m)) return 'ACTIVITY';
  return 'GENERAL';
}

export function extractIntentScope(message: string, dayIndex?: number): IntentScope {
  const raw = String(message ?? '');
  const m = stripScheduleAnchor(message);
  if (/整个行程|全程|整段|重新规划|重做.*行程|优化全程|所有天|整趟/i.test(m)) {
    return 'TRIP';
  }
  if (/第\s*\d+\s*天.{0,8}到.{0,8}第\s*\d+\s*天|Day\s*\d+.{0,8}to.{0,8}Day\s*\d+/i.test(m)) {
    return 'MULTI_DAY';
  }
  if (
    dayIndex != null ||
    /第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天|\bDay\s*\d+\b|今天|今日|明天|明日|后天/i.test(m) ||
    /\[日程\]\s*Day\s*[-_]?\s*\d+/i.test(raw)
  ) {
    return 'DAY';
  }
  if (/这个活动|该活动|这个景点|替换这个/i.test(m)) return 'ACTIVITY';
  if (/这家|附近一家|推荐一家|一个午餐|一家餐厅/i.test(m)) return 'POINT';
  return 'TRIP';
}

/** 咨询动作（问信息，不改稿） */
export function hasConsultAct(message: string): boolean {
  const m = stripScheduleAnchor(message);
  return (
    /怎么样|如何|怎样|有什么|有啥|推荐|告诉我|看看|查一下|查询|为什么|为何|介绍|汇总|概览|总览|是什么|是不是|要不要|需不需要|应该(?:先|吗)|吗[？?]?$|呢[？?]?$/i.test(
      m,
    ) ||
    /** P5：节奏诊断 / 餐饮检索 / 概览复盘（无显式「怎么样」） */
    /会不会太赶|是不是太赶|会不会很赶|会不会过赶|太赶了吗|安排得?太赶吗|是不是安排得太赶/i.test(m) ||
    /帮我找|找附近|附近的?(?:午餐|晚饭|晚餐|早餐|餐厅)|找.{0,8}(?:午餐|餐厅|美食)/i.test(m) ||
    /总体行程|整体行程|行程总览|行程概览|行程进度|行程体检|最大问题|吃住方案|住宿.{0,12}餐饮|餐饮方案/i.test(
      m,
    ) ||
    /** 租车/订车准备类咨询（勿进全量 OPTIMIZE） */
    /(?:先)?(?:去)?(?:预订|预定|租|订)车|要不要租车|需不需要租车|租车吗|订车吗|车是不是要先/i.test(m) ||
    /\b(what|how|why|recommend|tell\s+me|overview|summary|nearby\s+(?:lunch|restaurant)|rent\s+(?:a\s+)?car\s+first)\b/i.test(
      m,
    )
  );
}

/** 影响判断动作 */
export function hasAssessAct(message: string): boolean {
  const m = stripScheduleAnchor(message);
  return (
    /会不会影响|会影响|影响.{0,10}(?:行程|安排|活动|计划)|赶不上|来得及|还能不能|还能去吗|有什么后果|会发生什么|如果.{0,16}会怎样|风险是什么|是否可行/i.test(
      m,
    ) ||
    /\b(affect|impact|disrupt|make\s+it|too\s+late|consequence|what\s+if)\b/i.test(m)
  );
}

/**
 * 局部修改动作。
 * 排除「安排得怎么样 / 怎么安排的」等咨询。
 */
export function hasLocalEditAct(message: string): boolean {
  const m = stripScheduleAnchor(message);
  if (/安排得怎么样|怎么安排的|如何安排|安排如何|安排情况/i.test(m)) return false;
  /**
   * 裸「太赶了」视为节奏诊断（咨询），不抬 LOCAL_EDIT；
   * 仅当伴随轻松/调整/少开等改稿动词时才算局部修改。
   */
  if (
    /太赶了/.test(m) &&
    !/轻松|松一点|放缓|少开|调整|改|删|去掉|减少|优化|重排|换/.test(m)
  ) {
    return false;
  }
  return (
    /我要安排|帮我安排|安排(?:一个|进|到|午餐|晚饭|晚餐|早餐|活动)|加到|加入|加上|增加|排到|换成|替换|删除|去掉|移到|挪到|改成|帮我放|放到第|写进行程|怎么调整|帮我调整|调整(?:行程|安排|路线|南岸)|轻松一点|少开车|太赶了/i.test(
      m,
    ) ||
    /优化.{0,24}(?:第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天|Day\s*\d+|路线顺序|路线)|(?:路线顺序|交通时间).{0,16}(?:优化|调整|重排)|减少交通时间/i.test(
      m,
    ) ||
    /\b(add|insert|replace|remove|delete|move|schedule|put|adjust)\b/i.test(m)
  );
}

/** 全局规划动作 */
export function hasGlobalPlanAct(message: string): boolean {
  const m = stripScheduleAnchor(message);
  return (
    /规划整个|重新规划|重做(?:整个)?行程|优化全程|优化整个|完善整个行程|生成.{0,8}(?:天|日).{0,8}(?:行程|路线)|整体调整|整段重排|从零规划|规划.{0,16}(?:天|日).{0,8}行程|规划.{0,12}冰岛|(?:帮我|请)?.{0,6}规划.{0,20}行程/i.test(
      m,
    ) ||
    /** 目的地+天数出游诉求（勿用「第N天行程」宽匹配，避免误伤局部改稿） */
    /我想去.{0,40}\d+\s*天|去.{0,24}(?:玩|旅游|旅行).{0,8}\d+\s*天|(?:帮我|请)?(?:规划|安排|设计).{0,24}\d+\s*(?:天|日)/i.test(
      m,
    ) ||
    /\b(replan|full\s+plan|plan\s+(?:the\s+)?(?:whole|entire)\s+trip|optimize\s+(?:the\s+)?(?:whole|entire))\b/i.test(
      m,
    )
  );
}

export function hasExplicitNoMutation(message: string): boolean {
  const m = stripScheduleAnchor(message);
  return /先别改|不要改|先不要改|别改行程|只看看|只是问|先不要写入|不要写入|先别动|不要调整|先别调整|先给我看影响|不要执行/i.test(
    m,
  );
}

export function hasExplicitApplyDraft(message: string): boolean {
  const m = stripScheduleAnchor(message);
  return /就按这个|按这个方案|确认写入|执行方案|应用草案|写入行程|按刚才的方案|就这样改/i.test(m);
}

export function extractUnifiedIntentSignals(input: {
  message: string;
  tripId?: string | null;
  entryPoint?: string | null;
  frontendSuggestedIntent?: SemanticIntent | null;
}): UnifiedIntentSignals {
  const raw = String(input.message ?? '');
  const utterance = stripScheduleAnchor(raw);
  /** 日锚 / 住宿主题须看原文（含 `[日程] DayN`），勿只用剥离后正文 */
  const dayIndex = extractDayIndexFromUtterance(raw);
  return {
    utterance,
    hasConsultAct: hasConsultAct(utterance),
    hasAssessAct: hasAssessAct(utterance),
    hasLocalEditAct: hasLocalEditAct(utterance),
    hasGlobalPlanAct: hasGlobalPlanAct(utterance),
    explicitNoMutation: hasExplicitNoMutation(utterance),
    explicitApplyDraft: hasExplicitApplyDraft(utterance),
    topic: extractIntentTopic(raw),
    scope: extractIntentScope(raw, dayIndex),
    dayIndex,
    tripId: input.tripId ?? null,
    entryPoint: input.entryPoint ?? null,
    frontendSuggestedIntent: input.frontendSuggestedIntent ?? null,
  };
}
