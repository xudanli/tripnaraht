/**
 * Narrative Synthesizer — 语义视图 + 因果图 + 反事实 + 意图 → 体验叙事
 */

import type { TripPlan } from '../decision/plan-model';
import type { ISODate } from '../decision/world-model';
import type { UnifiedExecutionSemanticView } from '../decision/execution/unified-execution-semantic-view';
import type { CausalGraph, CausalTraceNode } from '../explain/causal-trace.model';
import type { ExecutionSemanticCounterfactualOverlay } from '../counterfactual/counterfactual.model';
import type { CompiledIntent } from '../intent/intent.compiler';
import type { EmotionalArc, ItineraryNarrative, NarrativeDay } from './narrative.model';
import {
  buildDayStory,
  buildOpeningLineForWeather,
} from './story.builder';

export interface SynthesizeNarrativeContext {
  readonly semanticView: UnifiedExecutionSemanticView;
  readonly causalGraph: CausalGraph;
  readonly counterfactualOverlay?: ExecutionSemanticCounterfactualOverlay;
  readonly compiledIntent?: CompiledIntent;
  readonly tripPlan?: TripPlan;
}

function slotDate(plan: TripPlan, slotId: string): ISODate | undefined {
  for (const d of plan.days) {
    if (d.timeSlots.some((s) => s.id === slotId)) {
      return d.date;
    }
  }
  return undefined;
}

function hazardsForDate(
  graph: CausalGraph,
  date: ISODate,
  plan: TripPlan,
): CausalTraceNode[] {
  const seen = new Set<string>();
  const out: CausalTraceNode[] = [];

  for (const n of graph.nodes) {
    const parts = n.target
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const targets = parts.length > 0 ? parts : [n.target];
    let hit = false;
    for (const t of targets) {
      if (slotDate(plan, t) === date) {
        hit = true;
        break;
      }
    }
    if (hit && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
    }
  }

  return out;
}

function inferArcFromDays(days: readonly NarrativeDay[]): EmotionalArc {
  if (days.length === 0) {
    return 'CALM';
  }
  const rank: Record<EmotionalArc, number> = {
    CALM: 0,
    DISCOVERY: 1,
    ADVENTURE: 2,
    CHAOTIC: 3,
  };
  let best: EmotionalArc = 'CALM';
  let score = -1;
  for (const d of days) {
    const r = rank[d.emotionalTone];
    if (r > score) {
      score = r;
      best = d.emotionalTone;
    }
  }
  return best;
}

function generateTitle(ctx: SynthesizeNarrativeContext): string {
  if (ctx.compiledIntent?.priorities.includes('minimize_daily_drive')) {
    return '更慢的油门，更深的风景';
  }
  if (ctx.compiledIntent?.priorities.includes('minimize_fatigue')) {
    return '把力气留给走路与抬头';
  }
  return '一趟会被记住的行程（而不只是日程表）';
}

function generateSummary(ctx: SynthesizeNarrativeContext): string {
  const parts: string[] = [];
  const expl = ctx.semanticView.explanation?.summary;
  if (expl) {
    parts.push(expl);
  }
  if (ctx.compiledIntent?.priorities.length) {
    parts.push(
      `我们在编排里偏向：${ctx.compiledIntent.priorities.join('、')}。`,
    );
  }
  if (parts.length === 0) {
    return '世界在流动：下面是把它翻译成「走过的一天」的讲述方式。';
  }
  return parts.join(' ');
}

function buildTradeoffNarratives(
  overlay?: ExecutionSemanticCounterfactualOverlay,
): string[] {
  if (!overlay) {
    return [];
  }
  const lines: string[] = [];
  if (overlay.bestAlternative === 'Switch to alternative plan') {
    lines.push(
      '如果约束稍退一步，还存在一条更顺滑的分支——我们已经替你模拟过那条「平行旅程」。',
    );
  }
  for (const s of overlay.scenarios) {
    lines.push(`设想：${s.assumption}`);
  }
  return lines;
}

function intentDayHint(compiled?: CompiledIntent): string | undefined {
  if (!compiled) return undefined;
  if (compiled.constraints.preferScenicRoutes) {
    return '偏好把视野让给自然肌理';
  }
  return undefined;
}

export function synthesizeNarrative(
  ctx: SynthesizeNarrativeContext,
): ItineraryNarrative {
  const dates = Object.keys(ctx.semanticView.byDate ?? {}).sort() as ISODate[];
  const tradeoffNarratives = buildTradeoffNarratives(ctx.counterfactualOverlay);

  if (dates.length === 0 && ctx.causalGraph.nodes.length === 0) {
    return {
      title: generateTitle(ctx),
      summary: generateSummary(ctx),
      storyByDay: [],
      emotionalArc: 'CALM',
      tradeoffNarratives,
    };
  }

  const storyByDay: NarrativeDay[] = [];

  if (dates.length === 0) {
    const built = buildDayStory({
      date: '—',
      dayIndex: 1,
      hazards: ctx.causalGraph.nodes,
      weatherLine: undefined,
      intentHint: intentDayHint(ctx.compiledIntent),
    });
    storyByDay.push({
      dayIndex: 1,
      story: built.story,
      keyMoments: built.keyMoments,
      emotionalTone: built.emotionalTone,
    });
  } else {
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]!;
      const wx = ctx.semanticView.byDate?.[date]?.weather;
      const weatherLine = buildOpeningLineForWeather(wx);
      const hazards =
        ctx.tripPlan !== undefined
          ? hazardsForDate(ctx.causalGraph, date, ctx.tripPlan)
          : [];

      const built = buildDayStory({
        date,
        dayIndex: i + 1,
        hazards,
        weatherLine,
        intentHint: intentDayHint(ctx.compiledIntent),
      });

      storyByDay.push({
        dayIndex: i + 1,
        date,
        story: built.story,
        keyMoments: built.keyMoments,
        emotionalTone: built.emotionalTone,
      });
    }
  }

  return {
    title: generateTitle(ctx),
    summary: generateSummary(ctx),
    storyByDay,
    emotionalArc: inferArcFromDays(storyByDay),
    tradeoffNarratives,
  };
}
