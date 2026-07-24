import {
  CAUSAL_EXPLANATION_KEYS,
  resolveCausalExplanation,
} from '../causal-explanation.registry';
import type { CausalStoryChainNodeType, CausalStoryView } from '../causal-story-view.types';
import type { CausalEffectV1, CausalFactRef } from '../causal-trace-node.types';
import type { CanonicalCausalTraceV1 } from '../causal-trace.types';

function windFactContext(facts: CausalFactRef[]): Record<string, unknown> {
  const wind = facts.find((f) => f.factType === 'WEATHER_WIND_GUST');
  return (wind?.attributes as Record<string, unknown> | undefined) ?? {};
}

function p90DeltaMinutes(effect: CausalEffectV1 | undefined): number | undefined {
  if (!effect) return undefined;
  const prev = Number(effect.previousValue);
  const next = Number(effect.predictedValue);
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return undefined;
  return Math.max(0, Math.round(next - prev));
}

export function projectNeutralCausalStoryView(trace: CanonicalCausalTraceV1): CausalStoryView {
  const ctx = windFactContext(trace.facts);
  const routeLabel = String(ctx.routeLabel ?? '路段');
  const windMps = Number(ctx.windMps ?? 0);

  const p90Effect = trace.effects.find((e) => e.effectType === 'SEGMENT_TRAVEL_TIME_P90');
  const missEffect = trace.effects.find((e) => e.effectType === 'APPOINTMENT_MISS_PROBABILITY');
  const p90Delta = p90DeltaMinutes(p90Effect);
  const missProbability = missEffect ? Number(missEffect.predictedValue) : undefined;

  const problem = trace.problems[0];
  const chain: CausalStoryView['chain'] = [];

  if (windMps > 0) {
    chain.push({
      nodeId: 'world_wind',
      type: 'WORLD_CHANGE',
      title: '天气影响',
      description: resolveCausalExplanation(CAUSAL_EXPLANATION_KEYS.ICELAND_WIND_GUST, {
        windMps,
        routeLabel,
      }),
      sourceRefs: trace.facts.filter((f) => f.factType === 'WEATHER_WIND_GUST').map((f) => f.factId),
    });
  }

  if (p90Effect && p90Delta != null && p90Delta > 0) {
    chain.push({
      nodeId: p90Effect.effectId,
      type: 'IMPACT',
      title: '通行耗时',
      description: resolveCausalExplanation(
        CAUSAL_EXPLANATION_KEYS.ICELAND_SEGMENT_P90_INCREASE,
        { deltaMinutes: p90Delta, routeLabel },
      ),
      sourceRefs: [p90Effect.effectId],
    });
  }

  if (missEffect && missProbability != null && missProbability >= 0.1) {
    chain.push({
      nodeId: missEffect.effectId,
      type: 'IMPACT',
      title: '预约风险',
      description: resolveCausalExplanation(
        CAUSAL_EXPLANATION_KEYS.ICELAND_APPOINTMENT_MISS_RISK,
        { missProbability },
      ),
      sourceRefs: [missEffect.effectId],
    });
  }

  if (problem) {
    chain.push({
      nodeId: `problem_${problem.problemId}`,
      type: 'CONFLICT',
      title: '决策冲突',
      description:
        problem.assessmentKey?.trim() ||
        resolveCausalExplanation(CAUSAL_EXPLANATION_KEYS.TRAVEL_BUFFER_TIGHT),
      sourceRefs: [problem.problemId],
    });
  }

  const selected =
    trace.options.find((o) => o.optionId === trace.selectedOptionId) ?? trace.options[0];
  if (selected) {
    const before = selected.metricsBefore?.timeMinutes;
    const after = selected.metricsAfter?.timeMinutes;
    const improvement =
      before != null && after != null && before > after
        ? `预计节省约 ${Math.round(before - after)} 分钟`
        : '改善抵达缓冲';
    chain.push({
      nodeId: `option_${selected.optionId}`,
      type: 'OPTION',
      title: '可选方案',
      description: `方案 ${selected.optionId}`,
      sourceRefs: [selected.optionId],
    });
  }

  if (trace.calibration) {
    const err = trace.calibration.predictionErrorMinutes;
    const actual = trace.calibration.actualMinutes;
    chain.push({
      nodeId: `outcome_${trace.calibration.outcomeRef}`,
      type: 'OUTCOME',
      title: '执行结果',
      description:
        err != null
          ? `实际与预测相差 ${err > 0 ? '+' : ''}${err} 分钟${actual != null ? `（实际约 ${Math.round(actual)} 分钟）` : ''}`
          : actual != null
            ? `实际通行约 ${Math.round(actual)} 分钟`
            : '方案已执行并完成校验',
      sourceRefs: [trace.calibration.outcomeRef],
    });
  }

  const severity = problem?.severity ?? 'WARNING';
  const hasWindCausal = windMps > 0 || trace.facts.some((f) => f.factType === 'WEATHER_WIND_GUST');
  const headline = hasWindCausal
    ? severity === 'BLOCKER'
      ? `${routeLabel}：强风导致预约高风险`
      : severity === 'WARNING'
        ? `${routeLabel}：通行缓冲偏紧`
        : `${routeLabel}：天气需留意`
    : problem?.assessmentKey?.trim() ||
      (inputSemanticHeadline(trace) ?? '决策依据待确认');

  const assessment =
    problem?.assessmentKey?.trim() ||
    (hasWindCausal && missProbability != null && missProbability >= 0.1
      ? resolveCausalExplanation(CAUSAL_EXPLANATION_KEYS.ICELAND_APPOINTMENT_MISS_RISK, {
          missProbability,
        })
      : hasWindCausal
        ? resolveCausalExplanation(CAUSAL_EXPLANATION_KEYS.TRAVEL_BUFFER_TIGHT)
        : problem?.assessmentKey?.trim() || '请根据选项与写回目标完成确认。');

  return {
    traceId: trace.traceId,
    worldStateVersion: trace.worldStateVersion,
    headline,
    assessment,
    chain,
    recommendedOption: selected
      ? {
          optionId: selected.optionId,
          summary: `选择 ${selected.optionId}`,
          expectedImprovement:
            selected.metricsBefore?.timeMinutes != null && selected.metricsAfter?.timeMinutes != null
              ? `通行时间 ${Math.round(selected.metricsBefore.timeMinutes)} → ${Math.round(selected.metricsAfter.timeMinutes)} 分钟`
              : hasWindCausal
                ? '改善预约可达性'
                : '确认后写回行程约束',
        }
      : undefined,
    technicalTraceRef: trace.traceId,
  };
}

function inputSemanticHeadline(trace: CanonicalCausalTraceV1): string | undefined {
  const pid = trace.problems[0]?.problemId ?? '';
  if (pid.startsWith('dc_vehicle')) return '车型与路况匹配待确认';
  if (pid.startsWith('dc_insurance')) return '租车保险覆盖待确认';
  if (pid.startsWith('dc_froad')) return '车型与 F-road 不匹配';
  if (pid.startsWith('dc_landing')) return '落地后首日长驾风险';
  if (pid.startsWith('dc_ring')) return '环岛范围与天数冲突';
  if (pid.startsWith('dc_glacier')) return '冰川体验取舍';
  if (pid.startsWith('dc_exp_')) return '高影响体验取舍';
  if (pid.startsWith('dc_drive')) return '单日驾驶负荷过高';
  return undefined;
}

export function projectCausalStoryView(
  trace: CanonicalCausalTraceV1,
  persona: 'neutral' | 'abu' = 'neutral',
): CausalStoryView {
  const neutral = projectNeutralCausalStoryView(trace);
  if (persona === 'neutral') return neutral;
  return projectAbuCausalStoryView(neutral, trace);
}

function projectAbuCausalStoryView(
  neutral: CausalStoryView,
  trace: CanonicalCausalTraceV1,
): CausalStoryView {
  const ctx = windFactContext(trace.facts);
  const windMps = Number(ctx.windMps ?? 0);
  const hasWindCausal =
    windMps > 0 || trace.facts.some((f) => f.factType === 'WEATHER_WIND_GUST');
  const routeLabel = String(ctx.routeLabel ?? '路段');
  const missEffect = trace.effects.find((e) => e.effectType === 'APPOINTMENT_MISS_PROBABILITY');
  const missProbability = missEffect ? Number(missEffect.predictedValue) : 0;

  // 非强风行程缓冲问题：Abu 只改措辞，不伪造「强风不建议出发」
  if (!hasWindCausal) {
    return {
      ...neutral,
      headline: neutral.headline.startsWith('安全')
        ? neutral.headline
        : `安全提示：${neutral.headline}`,
      chain: neutral.chain.map((node) => ({
        ...node,
        title: abuChainTitle(node.type, node.title),
      })),
    };
  }

  const safetyHeadline =
    windMps >= 20 || missProbability >= 0.5
      ? `安全提示：${routeLabel} 强风下不建议按原计划出发`
      : windMps >= 14
        ? `安全提示：${routeLabel} 侧风较大，请预留额外缓冲`
        : neutral.headline;

  const safetyAssessment =
    missProbability >= 0.35
      ? `以安全为先：错过预约风险约 ${Math.round(missProbability * 100)}%，建议提前出发或改约。`
      : neutral.assessment;

  return {
    ...neutral,
    headline: safetyHeadline,
    assessment: safetyAssessment,
    chain: neutral.chain.map((node) => ({
      ...node,
      title: abuChainTitle(node.type, node.title),
    })),
  };
}

function abuChainTitle(type: CausalStoryChainNodeType, neutralTitle: string): string {
  switch (type) {
    case 'WORLD_CHANGE':
      return '环境风险';
    case 'IMPACT':
      return neutralTitle === '预约风险' ? '安全风险' : '行程影响';
    case 'CONFLICT':
      return '安全冲突';
    case 'OPTION':
      return '安全方案';
    default:
      return neutralTitle;
  }
}
