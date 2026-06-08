// src/skills/decision/decision-explain-for-human.skill.ts
/**
 * skill.decision.explainForHuman
 *
 * 用途：把 DecisionLog + DecisionSource 变成用户可读的解释，是三人格的「翻译官」。
 * Phase 2：经 unified-explainability@v1 信封投影，reasonCodes / evidenceRefs 为 SSOT。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import type { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import type { OptimizationHints } from '../../decision/kernel/decision-state.types';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';
import type { DecisionLogEntry as AgentDecisionLogEntry } from '../../agent/interfaces/trip-plan.interface';
import { mapOrchestrationDecisionLogToTrips } from '../../agent/utils/orchestration-to-trips-decision-log.util';
import { buildUnifiedExplainabilityEnvelope } from '../../trips/decision/explainability/build-unified-explainability-envelope.util';
import {
  buildDeterministicNarrativeFromEnvelope,
  projectExplainForHumanFromEnvelope,
} from '../../trips/decision/explainability/project-explain-for-human-from-envelope.util';

export interface DecisionExplainForHumanInput extends SkillInput {
  tripId?: string;
  /** orchestration decision_log（与 route_and_run 同源，经 forExplain 映射） */
  orchestrationDecisionLog?: AgentDecisionLogEntry[];
  decisionLog?: DecisionLogEntry[];
  world?: WorldModelContext;
  optimizationHints?: OptimizationHints;
  requestId?: string;
}

export interface DecisionExplainForHumanOutput extends SkillOutput {
  userFacingNarrative: {
    abuSection: string;
    drdreSection: string;
    neptuneSection: string;
  };
  riskHighlights: Array<{
    risk: string;
    severity: 'high' | 'medium' | 'low';
    explanation: string;
    reason_codes?: string[];
    evidence_refs?: string[];
    anchored_factor_ids?: string[];
  }>;
  tradeOffs: Array<{
    what: string;
    why: string;
    impact: string;
    reason_codes?: string[];
    evidence_refs?: string[];
  }>;
  explanation?: string;
  summary?: string;
  keyPoints?: Array<{ point: string; category: string }>;
  /** unified-explainability@v1 完整信封（可选透出给 Decision Cockpit） */
  unified?: ReturnType<typeof buildUnifiedExplainabilityEnvelope>;
}

@Injectable()
export class DecisionExplainForHumanSkill implements Skill<DecisionExplainForHumanInput, DecisionExplainForHumanOutput> {
  private readonly logger = new Logger(DecisionExplainForHumanSkill.name);

  metadata = {
    name: 'decision.explainForHuman',
    description:
      'decision.explainForHuman：经 unified-explainability@v1 将决策日志转换为用户可读解释（三人格、风险、取舍，锚定 reasonCodes/evidenceRefs）',
    version: '2.0.0',
    category: 'decision' as const,
  };

  constructor(
    private readonly decisionLogStorage: DecisionLogStorageService,
    private readonly worldBuildContext: WorldBuildContextSkill,
  ) {}

  async execute(input: DecisionExplainForHumanInput): Promise<DecisionExplainForHumanOutput> {
    this.logger.debug(`执行 decision.explainForHuman: tripId=${input.tripId || 'none'}`);

    try {
      let decisionLog: DecisionLogEntry[] | undefined = input.decisionLog;
      let world: WorldModelContext | undefined = input.world;

      if (input.orchestrationDecisionLog?.length) {
        decisionLog = mapOrchestrationDecisionLogToTrips(input.orchestrationDecisionLog, {
          forExplain: true,
        });
      } else if (input.tripId) {
        decisionLog = await this.decisionLogStorage.queryLogs({
          tripId: input.tripId,
          limit: 100,
        });

        if (!world) {
          const contextResult = await this.worldBuildContext.execute({
            tripId: input.tripId,
          });
          world = contextResult.world;
        }
      }

      if (!decisionLog) {
        throw new Error('必须提供 tripId、decisionLog 或 orchestrationDecisionLog');
      }

      if (decisionLog.length === 0) {
        return this.emptyOutput();
      }

      const requestId = input.requestId ?? input.tripId ?? `explain-${Date.now()}`;
      const baseEnvelope = buildUnifiedExplainabilityEnvelope({
        requestId,
        traceId: requestId,
        decisionLogs: decisionLog,
        optimizationHints: input.optimizationHints,
      });
      const narrative = buildDeterministicNarrativeFromEnvelope(baseEnvelope, world);
      const envelope = buildUnifiedExplainabilityEnvelope({
        requestId,
        traceId: requestId,
        decisionLogs: decisionLog,
        optimizationHints: input.optimizationHints,
        narrative,
        generatedAt: baseEnvelope.generated_at,
      });

      const projection = projectExplainForHumanFromEnvelope(envelope, world);

      return {
        ...projection,
        unified: envelope,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`生成用户解释失败: ${message}`, stack);
      throw error;
    }
  }

  private emptyOutput(): DecisionExplainForHumanOutput {
    return {
      userFacingNarrative: {
        abuSection: '暂无决策记录',
        drdreSection: '暂无节奏调整记录',
        neptuneSection: '暂无路段替换记录',
      },
      riskHighlights: [],
      tradeOffs: [],
      explanation: '暂无决策记录',
      summary: '暂无决策记录',
      keyPoints: [],
    };
  }
}
