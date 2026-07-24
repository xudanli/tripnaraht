/**
 * Causal Narrative Compiler — trace → 受控叙事上下文（LLM 仅润色，不编造数值）。
 */

import { Injectable } from '@nestjs/common';
import type { OptimizationHints } from '../../../decision/kernel/decision-state.types';
import type { DecisionLogEntry } from '../shared/decision-result.types';
import type { TimeDrift } from '../temporal/time-drift.types';
import type { CausalNarrativeCompileResult } from './causal-chain.types';
import { extractCausalChain } from './extract-causal-chain.util';

export interface CompileCausalNarrativeInput {
  decisionLogs?: DecisionLogEntry[];
  optimizationHints?: OptimizationHints;
  timeDrifts?: TimeDrift[];
  partyNoteZh?: string;
}

@Injectable()
export class CausalNarrativeCompilerService {
  compile(input: CompileCausalNarrativeInput): CausalNarrativeCompileResult | undefined {
    const chain = extractCausalChain(input);
    if (!chain) return undefined;

    const structuredContext = {
      schema: 'causal-narrative-context/v1',
      instruction:
        '你只能使用 facts 中的数值与因果顺序；不得编造未列出的路况、时间或样本数。语气克制、有人文关怀。',
      protectionHeadlineZh: chain.protectionHeadlineZh,
      monteCarloSampleCount: chain.monteCarloSampleCount,
      chosenPlanId: chain.chosenPlanId,
      causalNodes: chain.nodes.map((n) => ({
        kind: n.kind,
        facts: n.facts,
        persona: n.persona,
        sourceRef: n.sourceRef,
      })),
    };

    return {
      structuredContextJson: JSON.stringify(structuredContext, null, 2),
      deterministicSummaryZh: buildDeterministicSummary(chain),
      chain,
    };
  }
}

function buildDeterministicSummary(chain: NonNullable<ReturnType<typeof extractCausalChain>>): string {
  const lines: string[] = [chain.protectionHeadlineZh];

  for (const node of chain.nodes.slice(0, 6)) {
    switch (node.kind) {
      case 'WEATHER_PERTURBATION':
        lines.push(`气象因素：${node.sourceRef ?? '侧风或恶劣天气'} 已纳入行程推演。`);
        break;
      case 'ROAD_CLOSURE':
        lines.push(`路况：${node.sourceRef ?? '部分路段不可通行'}，已自动规避。`);
        break;
      case 'TIME_DRIFT': {
        const delta = node.facts.deltaMinutes;
        lines.push(
          typeof delta === 'number' && delta > 0
            ? `时间链：因执行扰动，下游行程预留增加约 ${delta} 分钟。`
            : `时间链：${node.sourceRef ?? '已校准时序'}`,
        );
        break;
      }
      case 'DEM_HARD_GATE':
        lines.push(`地形安全：${node.sourceRef ?? '坡度或海拔超出参与者能力上限'}，相关路段已拦截。`);
        break;
      case 'PERSONA_REPAIR':
        lines.push(`自动修正：${node.sourceRef ?? 'Neptune 已替换高风险片段'}。`);
        break;
      case 'MONTE_CARLO_OUTCOME':
        if (node.facts.totalSamples) {
          lines.push(`不确定性：约 ${node.facts.totalSamples} 次抽样后选定当前方案。`);
        }
        break;
      case 'SCHEDULE_ADJUSTMENT':
        lines.push(`节奏优化：${node.sourceRef ?? '已调整出发或停留时段'}。`);
        break;
      case 'SYSTEM_DEGRADATION':
        lines.push(node.sourceRef ?? '系统已在安全前提下降级优化路径。');
        break;
      default:
        break;
    }
  }

  return lines.join('\n');
}

export function compileCausalNarrative(
  input: CompileCausalNarrativeInput,
): CausalNarrativeCompileResult | undefined {
  return new CausalNarrativeCompilerService().compile(input);
}
