import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DECISION_NODE_TO_DOMAIN,
  type DecisionNode,
} from '../types/preference-round.types';
import type { ProcessFairnessOrchestrationHint } from '../types/process-fairness-orchestration.types';
import { PreferenceRoundService } from './preference-round.service';
import { TripPreferenceRoundAccessService } from './trip-preference-round-access.service';
import {
  detectDecisionNodesFromText,
  pickPrimaryDecisionNode,
} from '../utils/decision-node-detection.util';
import { wishCategoryLabel } from '../../wishlist/utils/wish-category.util';

const MIN_GROUP_SIZE = 2;

@Injectable()
export class PreferenceRoundOrchestratorService {
  private readonly logger = new Logger(PreferenceRoundOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roundService: PreferenceRoundService,
    private readonly access: TripPreferenceRoundAccessService,
  ) {}

  /**
   * 在编排器关键决策节点尝试自动发起 Round Robin（仅多人行程、无进行中轮次时）。
   */
  async tryAutoStartForRequest(args: {
    tripId: string;
    userId: string;
    message: string;
    explicitDecisionNode?: DecisionNode;
  }): Promise<ProcessFairnessOrchestrationHint> {
    const { tripId, userId, message, explicitDecisionNode } = args;
    const empty: ProcessFairnessOrchestrationHint = {
      triggered: false,
      status: 'SKIPPED',
      decisionNode: null,
      roundId: null,
      round: null,
      agentIntroZh: null,
      clientNavigation: null,
    };

    const memberIds = await this.access.listMemberIds(tripId);
    const detected = explicitDecisionNode
      ? [explicitDecisionNode]
      : detectDecisionNodesFromText(message);
    const decisionNode = pickPrimaryDecisionNode(detected);

    if (memberIds.length < MIN_GROUP_SIZE) {
      const label = decisionNode
        ? wishCategoryLabel(
            DECISION_NODE_TO_DOMAIN[decisionNode] as Parameters<typeof wishCategoryLabel>[0],
          )
        : '本议题';
      return {
        ...empty,
        decisionNode,
        status: 'SCAFFOLD',
        skippedReason: 'single_member_trip',
        agentIntroZh:
          `当前行程仅有 ${memberIds.length} 位成员，暂无法自动开启${label}的 Round Robin 轮次。` +
          `请先邀请协作者，或在左侧「结构化协商」手动发起。`,
      };
    }

    if (!decisionNode) {
      return { ...empty, skippedReason: 'no_decision_node_detected' };
    }

    const domain = DECISION_NODE_TO_DOMAIN[decisionNode];
    const existingId = await this.roundService.getActiveRoundForDomain(tripId, domain);
    if (existingId) {
      try {
        const round = await this.roundService.getRound(tripId, existingId, userId);
        return this.buildHint(tripId, decisionNode, domain, round, false);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          return this.buildNavigationScaffoldHint(tripId, decisionNode, domain, existingId);
        }
        throw e;
      }
    }

    try {
      const round = await this.roundService.createRound(tripId, userId, {
        decisionNode,
      });
      this.logger.log(
        `[ProcessFairness] auto-started round ${round.id} trip=${tripId} node=${decisionNode}`,
      );
      return this.buildHint(tripId, decisionNode, domain, round, true);
    } catch (e) {
      if (e instanceof ConflictException) {
        const roundId = await this.roundService.getActiveRoundForDomain(tripId, domain);
        if (roundId) {
          try {
            const round = await this.roundService.getRound(tripId, roundId, userId);
            return this.buildHint(tripId, decisionNode, domain, round, false);
          } catch (inner) {
            if (inner instanceof ForbiddenException) {
              return this.buildNavigationScaffoldHint(tripId, decisionNode, domain, roundId);
            }
            throw inner;
          }
        }
      }
      if (e instanceof ForbiddenException) {
        const roundId = await this.roundService.getActiveRoundForDomain(tripId, domain);
        if (roundId) {
          return this.buildNavigationScaffoldHint(tripId, decisionNode, domain, roundId);
        }
        const label = wishCategoryLabel(domain as Parameters<typeof wishCategoryLabel>[0]);
        return {
          ...empty,
          decisionNode,
          status: 'SCAFFOLD',
          skippedReason: 'member_access_pending',
          agentIntroZh:
            `请先确认您已加入该行程成员，再在「${label}」结构化协商卡片中继续讨论。`,
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[ProcessFairness] auto-start failed trip=${tripId}: ${msg}`);
      return { ...empty, decisionNode, skippedReason: msg };
    }
  }

  private buildNavigationScaffoldHint(
    tripId: string,
    decisionNode: DecisionNode,
    domain: string,
    roundId: string,
  ): ProcessFairnessOrchestrationHint {
    const label = wishCategoryLabel(domain as Parameters<typeof wishCategoryLabel>[0]);
    return {
      triggered: false,
      status: 'SCAFFOLD',
      decisionNode,
      roundId,
      round: null,
      agentIntroZh:
        `「${label}」的结构化协商轮次已在进行中。请点击下方进入协商卡片，按 Round Robin 顺序发言。`,
      clientNavigation: {
        route: 'structured_negotiation',
        tripId,
        roundId,
        domain,
      },
      skippedReason: 'member_access_pending',
    };
  }

  private buildHint(
    tripId: string,
    decisionNode: DecisionNode,
    domain: string,
    round: Awaited<ReturnType<PreferenceRoundService['getRound']>>,
    created: boolean,
  ): ProcessFairnessOrchestrationHint {
    const label = wishCategoryLabel(domain as Parameters<typeof wishCategoryLabel>[0]);
    const verb = created ? '已开启' : '正在进行';
    return {
      triggered: true,
      status: 'ACTIVE',
      decisionNode,
      roundId: round.id,
      round,
      agentIntroZh:
        `我们进入${label}的结构化偏好分享轮次（${verb}）。` +
        `请按顺序表达你的偏好和理由；轮到其他成员发言时请先倾听。` +
        (round.currentSpeakerDisplayName
          ? `当前轮到：${round.currentSpeakerDisplayName}。`
          : ''),
      clientNavigation: {
        route: 'structured_negotiation',
        tripId,
        roundId: round.id,
        domain,
      },
    };
  }

  async countTripMembers(tripId: string): Promise<number> {
    return (await this.access.listMemberIds(tripId)).length;
  }
}
