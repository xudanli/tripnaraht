/**
 * Story Builder — 因果节点 / 天气 / 意图 → 可读叙事片段（规则模板，可换 LLM）
 */

import type { CausalTraceNode } from '../explain/causal-trace.model';
import type { WeatherExecutionSignal } from '../decision/execution/weather-execution-semantic-adapter';
import type { EmotionalArc } from './narrative.model';

export type HazardStoryKind = 'WEATHER' | 'ROUTE_CHANGE' | 'CONSTRAINT' | 'REPAIR' | 'OTHER';

export function classifyHazardKind(node: CausalTraceNode): HazardStoryKind {
  const rc = node.reasonCode.toLowerCase();
  const src = node.source.toLowerCase();
  const tgt = node.target.toLowerCase();

  if (
    rc.includes('weather') ||
    rc.includes('wx') ||
    src.includes('weather')
  ) {
    return 'WEATHER';
  }
  if (
    node.type === 'REPLAN' ||
    node.type === 'MUTATION' ||
    rc.includes('stream') ||
    rc.includes('replan') ||
    rc.includes('semantic_delta')
  ) {
    return 'ROUTE_CHANGE';
  }
  if (node.type === 'REPAIR') {
    return 'REPAIR';
  }
  if (node.type === 'CONSTRAINT' || node.type === 'IMPACT') {
    if (src.includes('road') || tgt.includes('f208') || rc.includes('impass')) {
      return 'ROUTE_CHANGE';
    }
    return 'CONSTRAINT';
  }
  return 'OTHER';
}

function lineForNode(node: CausalTraceNode): string {
  const kind = classifyHazardKind(node);
  const road = node.source.replace(/^road:/i, '').trim();

  switch (kind) {
    case 'WEATHER':
      return `高地气象收紧：风与能见度 shaping 了这一段的节奏（${node.reasonCode}）。`;
    case 'ROUTE_CHANGE':
      return road
        ? `路网变化牵动路线：${road} 一带需要绕行或重排时段，我们在可行走廊里换了走法。`
        : `路线因现实世界约束被重新编织；多出来的转弯往往也意味着新的取景角度。`;
    case 'REPAIR':
      return `行程结构上做了「修复」：在槽位 ${node.source} 上采取 ${node.target}，让日程重新咬合。`;
    case 'CONSTRAINT':
      return `约束从物理世界渗入日程：${node.reasonCode} 标记了需要尊重的边界。`;
    default:
      return `系统在幕后对齐了一项变更（${node.type}）：${node.reasonCode}。`;
  }
}

export function buildOpeningLineForWeather(
  wx: WeatherExecutionSignal | undefined,
): string | undefined {
  if (!wx) return undefined;
  const tier =
    wx.violation === 'HARD' || wx.executionState === 'BLOCKED'
      ? '严峻'
      : wx.violation === 'SOFT'
      ? '多变'
      : '尚可';
  const hazLabels =
    wx.hazards && wx.hazards.length > 0
      ? wx.hazards
          .slice(0, 2)
          .map((h) => h.kind)
          .join('、')
      : (wx.hazardKinds?.slice(0, 2).join('、') ?? '');
  const haz = hazLabels ? `主要关切包括 ${hazLabels}。` : '';
  return `这一天的大气面貌偏${tier}。${haz}`;
}

export function buildDayStory(params: {
  readonly date: string;
  readonly dayIndex: number;
  readonly hazards: readonly CausalTraceNode[];
  readonly weatherLine?: string;
  readonly intentHint?: string;
}): {
  story: string;
  keyMoments: string[];
  emotionalTone: EmotionalArc;
} {
  const moments: string[] = [];
  if (params.weatherLine) {
    moments.push(params.weatherLine);
  }
  for (const h of params.hazards) {
    moments.push(lineForNode(h));
  }

  let story = `第 ${params.dayIndex} 天（${params.date}）`;
  if (params.intentHint) {
    story += `——${params.intentHint}`;
  }
  story += '。';
  if (moments.length > 0) {
    story += `\n${moments.join('\n')}`;
  } else {
    story +=
      '\n这一天相对平整：世界没有抛出新的硬约束，你可以把注意力留给风景与节奏。';
  }

  const hasRouteStress = params.hazards.some(
    h => classifyHazardKind(h) === 'ROUTE_CHANGE',
  );
  const hasConstraint = params.hazards.some(
    h => classifyHazardKind(h) === 'CONSTRAINT',
  );

  let emotionalTone: EmotionalArc = 'CALM';
  if (params.hazards.length >= 4) {
    emotionalTone = 'CHAOTIC';
  } else if (hasRouteStress || hasConstraint) {
    emotionalTone = 'ADVENTURE';
  } else if (params.hazards.some(h => h.type === 'REPLAN')) {
    emotionalTone = 'DISCOVERY';
  }

  return {
    story,
    keyMoments: moments.length > 0 ? moments : ['留白：把日程交给路况与心情'],
    emotionalTone,
  };
}
