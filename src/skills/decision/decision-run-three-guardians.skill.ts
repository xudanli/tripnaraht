// src/skills/decision/decision-run-three-guardians.skill.ts
/**
 * skill.decision.runThreeGuardians
 * 
 * 用途：一次性跑三人格，并给出结构化裁决。
 * 按顺序执行 Abu → Dr.Dre → Neptune；Neptune 修改 plan 后 Abu 复核 → Dr.Dre 再平衡。
 * 
 * 输入：tripId 或已构建的 WorldModelContext + planCandidate
 * 输出：abuResult / drdreResult / neptuneResult + finalPlan + decisionSummary
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import {
  WorldModelContext,
  RoutePlanDraft,
  RouteSegment,
} from '../../trips/decision/shared/world-model.types';
import { StrategyOrchestratorService } from '../../trips/decision/services/strategy-orchestrator.service';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import {
  isPersonaClosureLoopEnabled,
  type PersonaClosureAudit,
} from '../../trips/decision/shared/persona-closure.types';

export interface DecisionRunThreeGuardiansInput extends SkillInput {
  /** 行程 ID（如果有） */
  tripId?: string;
  /** 或已构建的 WorldModelContext */
  world?: WorldModelContext;
  /** 候选计划；缺省时若提供 tripId，将从 Trip/TripDay 行程项合成最小草案 */
  planCandidate?: RoutePlanDraft;
}

export interface DecisionRunThreeGuardiansOutput extends SkillOutput {
  /** Abu 检查结果 */
  abuResult: {
    allowed: boolean;
    violations: any[];
    decisionLog: any[];
  };
  /** Dr.Dre 调整结果 */
  drdreResult: {
    adjusted: boolean;
    adjustedPlan?: RoutePlanDraft;
    changes: any[];
    decisionLog: any[];
    /** P2 E(U) 显式化：期望效用 [0,1] */
    expectedUtility?: number;
    expectedUtilityWeights?: Record<string, number>;
  };
  /** Neptune 修复结果 */
  neptuneResult: {
    repaired: boolean;
    repairedPlan?: RoutePlanDraft;
    replacements: any[];
    decisionLog: any[];
  };
  /** 最终计划 */
  finalPlan: RoutePlanDraft | null;
  /** 决策摘要（给 Agent 用的结构化摘要） */
  decisionSummary: {
    finalAction: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    allowed: boolean;
    summary: string;
    keyDecisions: Array<{
      persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
      action: string;
      reason: string;
    }>;
  };
  /** 所有决策日志 */
  allLogs: DecisionLogEntry[];
  /** Neptune REPLACE 后 Abu 有界重验审计（TRIP_PERSONA_CLOSURE_LOOP=1） */
  personaClosureAudit?: PersonaClosureAudit;
}

@Injectable()
export class DecisionRunThreeGuardiansSkill implements Skill<DecisionRunThreeGuardiansInput, DecisionRunThreeGuardiansOutput> {
  private readonly logger = new Logger(DecisionRunThreeGuardiansSkill.name);

  metadata = {
    name: 'decision.runThreeGuardians',
    description: 'decision.runThreeGuardians：一次性执行三人格策略编排（Abu → Dr.Dre → Neptune），返回结构化决策结果和最终计划',
    version: '1.0.0',
    category: 'decision' as const,
    inputSchema: {
      dependencies: [
        { param: 'world', alternatives: ['tripId'] },
        { param: 'tripId', alternatives: ['world'] },
      ],
      extractors: {
        tripId: 'tripId',
      },
    },
  };

  constructor(
    private readonly worldBuildContext: WorldBuildContextSkill,
    private readonly prisma: PrismaService,
    @Optional() private readonly strategyOrchestrator?: StrategyOrchestratorService,
  ) {}

  async execute(input: DecisionRunThreeGuardiansInput): Promise<DecisionRunThreeGuardiansOutput> {
    this.logger.debug(`执行 decision.runThreeGuardians: tripId=${input.tripId || 'none'}`);

    try {
      // 1. 构建或使用 WorldModelContext
      let world: WorldModelContext;
      if (input.world) {
        world = input.world;
      } else if (input.tripId) {
        const contextResult = await this.worldBuildContext.execute({
          tripId: input.tripId,
        });
        world = contextResult.world;
      } else {
        throw new Error('必须提供 world 或 tripId');
      }

      // 2. 候选路线草案：编排 LLM 常漏传 planCandidate → 从行程表合成最小 RoutePlanDraft（避免 StrategyOrchestrator 抛错）
      let planCandidate = input.planCandidate;
      if (!planCandidate && input.tripId) {
        planCandidate =
          (await this.synthesizeRoutePlanDraftFromTrip(input.tripId)) ?? undefined;
        if (planCandidate) {
          this.logger.debug(
            `decision.runThreeGuardians: 已根据 tripId=${input.tripId} 合成 RoutePlanDraft（${planCandidate.segments.length} segments）`,
          );
        }
      }
      if (!planCandidate) {
        throw new Error(
          'RoutePlanDraft 不能为空：请在编排中传入 planCandidate，或提供可从数据库读取日程的 tripId',
        );
      }

      // 3. 执行策略编排
      if (!this.strategyOrchestrator) {
        throw new Error('StrategyOrchestratorService 未可用，请确保 DecisionModule 已正确加载');
      }
      const result = await this.strategyOrchestrator.run(world, planCandidate, {
        enablePersonaClosureLoop: isPersonaClosureLoopEnabled(),
      });

      // 4. 分离三个守护者的结果
      const abuLogs = result.logs.filter(log => log.persona === 'ABU');
      const drdreLogs = result.logs.filter(log => log.persona === 'DR_DRE');
      const neptuneLogs = result.logs.filter(log => log.persona === 'NEPTUNE');

      // 5. 构建结构化输出
      const abuResult = {
        allowed: result.allowed,
        violations: abuLogs
          .filter(log => log.action === 'REJECT')
          .map(log => ({
            segmentId: log.evidenceRefs?.[0] || 'unknown',
            explanation: log.explanation,
            reasonCodes: log.reasonCodes || [],
          })),
        decisionLog: abuLogs.map(log => ({
          persona: log.persona,
          action: log.action,
          explanation: log.explanation,
          reasonCodes: log.reasonCodes || [],
          timestamp: log.timestamp,
        })),
      };

      const drdreResult = {
        adjusted: drdreLogs.some((log: DecisionLogEntry) => log.action === 'ADJUST'),
        adjustedPlan: result.plan || undefined,
        expectedUtility: result.expectedUtility,
        expectedUtilityWeights: result.expectedUtilityWeights,
        changes: drdreLogs
          .filter((log: DecisionLogEntry) => log.action === 'ADJUST')
          .map((log: DecisionLogEntry) => ({
            type: log.action,
            explanation: log.explanation,
            metadata: log.evidenceRefs ? { evidenceRefs: log.evidenceRefs } : undefined,
          })),
        decisionLog: drdreLogs.map((log: DecisionLogEntry) => ({
          persona: log.persona,
          action: log.action,
          explanation: log.explanation,
          reasonCodes: log.reasonCodes || [],
          timestamp: log.timestamp,
        })),
      };

      const neptuneResult = {
        repaired: neptuneLogs.some((log: DecisionLogEntry) => log.action === 'REPLACE'),
        repairedPlan: result.plan || undefined,
        replacements: neptuneLogs
          .filter((log: DecisionLogEntry) => log.action === 'REPLACE')
          .map((log: DecisionLogEntry) => ({
            from: log.evidenceRefs?.[0],
            to: log.evidenceRefs?.[1],
            explanation: log.explanation,
            metadata: log.evidenceRefs ? { evidenceRefs: log.evidenceRefs } : undefined,
          })),
        decisionLog: neptuneLogs.map((log: DecisionLogEntry) => ({
          persona: log.persona,
          action: log.action,
          explanation: log.explanation,
          reasonCodes: log.reasonCodes || [],
          timestamp: log.timestamp,
        })),
      };

      // 6. 生成决策摘要
      const keyDecisions = result.logs
        .filter(log => log.action !== 'ALLOW')
        .map(log => ({
          persona: log.persona as 'ABU' | 'DR_DRE' | 'NEPTUNE',
          action: log.action,
          reason: log.explanation,
        }));

      const decisionSummary = {
        finalAction: result.finalAction as 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE',
        allowed: result.allowed,
        summary: this.generateSummary(result),
        keyDecisions,
      };

      return {
        abuResult,
        drdreResult,
        neptuneResult,
        finalPlan: result.plan,
        decisionSummary,
        allLogs: result.logs,
        personaClosureAudit: result.personaClosureAudit,
      };
    } catch (error: any) {
      this.logger.error(`执行三人格策略失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 从持久化行程生成最小 RoutePlanDraft，供三人格在无 LLM 结构化 plan 时仍能运行。
   */
  private async synthesizeRoutePlanDraftFromTrip(tripId: string): Promise<RoutePlanDraft | null> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          destination: true,
          TripDay: {
            orderBy: { date: 'asc' },
            select: {
              id: true,
              date: true,
              ItineraryItem: {
                orderBy: { startTime: 'asc' },
                select: { id: true },
              },
            },
          },
        },
      });
      if (!trip) return null;

      const segments: RouteSegment[] = [];
      const days = trip.TripDay ?? [];
      if (days.length > 0) {
        days.forEach((day, dayIdx) => {
          const items = day.ItineraryItem ?? [];
          if (items.length === 0) {
            segments.push({
              segmentId: `trip-${trip.id}-day-${dayIdx}-empty`,
              dayIndex: dayIdx,
              distanceKm: 0,
              ascentM: 0,
              slopePct: 0,
              metadata: { tripDayId: day.id, date: day.date.toISOString().slice(0, 10) },
            });
          } else {
            items.forEach((item, segIdx) => {
              segments.push({
                segmentId: `trip-${trip.id}-item-${item.id}`,
                dayIndex: dayIdx,
                distanceKm: 0,
                ascentM: 0,
                slopePct: 0,
                metadata: {
                  itineraryItemId: item.id,
                  tripDayIndex: dayIdx,
                  segmentOrder: segIdx,
                },
              });
            });
          }
        });
      }

      if (segments.length === 0) {
        segments.push({
          segmentId: `trip-${trip.id}-placeholder`,
          dayIndex: 0,
          distanceKm: 0,
          ascentM: 0,
          slopePct: 0,
          metadata: { synthetic: true, reason: 'no_trip_days' },
        });
      }

      const dest = (trip.destination || 'XX').trim().toUpperCase();
      return {
        tripId: trip.id,
        routeDirectionId: dest.length === 2 ? `synthetic-${dest}` : `synthetic-trip-${trip.id.slice(0, 8)}`,
        segments,
      };
    } catch (e: any) {
      this.logger.warn(`synthesizeRoutePlanDraftFromTrip failed: ${e?.message ?? e}`);
      return null;
    }
  }

  private generateSummary(result: any): string {
    if (!result.allowed) {
      return `Abu 拒绝了计划：${result.logs.find((log: DecisionLogEntry) => log.persona === 'ABU' && log.action === 'REJECT')?.explanation || '安全检查未通过'}`;
    }

    const actions = [];
    if (result.logs.some((log: DecisionLogEntry) => log.persona === 'DR_DRE' && log.action === 'ADJUST')) {
      actions.push('Dr.Dre 调整了行程节奏');
    }
    if (result.logs.some((log: DecisionLogEntry) => log.persona === 'NEPTUNE' && log.action === 'REPLACE')) {
      actions.push('Neptune 替换了部分路段');
    }
    if (actions.length === 0) {
      return '计划通过所有检查，无需调整';
    }

    return `计划已优化：${actions.join('，')}`;
  }
}

