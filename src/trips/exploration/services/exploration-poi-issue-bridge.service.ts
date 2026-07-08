import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizePoiQuery } from '../../../canonical-poi-resolution/utils/normalize-poi-query.util';
import type { ExplorationResolvedPoiRef } from '../config/iceland-route-detail.catalog';
import { EXPLORATION_ROUTE_VARIANT_STATUS } from '../constants/exploration-status.constants';
import type {
  ConsumerRepairOptionViewModel,
  ConsumerRiskViewModel,
} from '../types/exploration.types';
import { ExplorationPoiResolutionService } from './exploration-poi-resolution.service';
import { ExplorationRouteDetailService } from './exploration-route-detail.service';
import { ExplorationScenarioService } from './exploration-scenario.service';

export const CPRE_POI_ISSUE_PREFIX = 'cpre-poi-';

export function isCprePoiConsumerIssueId(issueId: string): boolean {
  return issueId.startsWith(CPRE_POI_ISSUE_PREFIX);
}

export function buildCprePoiIssueId(mention: string): string {
  const normalized = normalizePoiQuery(mention);
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `${CPRE_POI_ISSUE_PREFIX}${hash}`;
}

export function isUnresolvedExplorationPoi(poi: ExplorationResolvedPoiRef): boolean {
  if (!poi.resolved) return true;
  return (
    poi.status === 'NEEDS_CONFIRMATION' ||
    poi.status === 'AMBIGUOUS' ||
    poi.status === 'NOT_FOUND'
  );
}

/**
 * CPRE 未确认 POI → Exploration consumer issue（P0 桥接）
 * Issue SSOT 仍为 Gateway；POI 确认类问题经此服务并入 totalIssueCount。
 */
@Injectable()
export class ExplorationPoiIssueBridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scenarios: ExplorationScenarioService,
    private readonly poiResolution: ExplorationPoiResolutionService,
    private readonly routeDetails: ExplorationRouteDetailService,
  ) {}

  async projectUnresolvedPois(tripId: string): Promise<ConsumerRiskViewModel[]> {
    const refs = await this.loadUnresolvedRefs(tripId);
    return refs.map((poi) => this.toConsumerRisk(poi, tripId));
  }

  async countUnresolvedPois(tripId: string): Promise<number> {
    const refs = await this.loadUnresolvedRefs(tripId);
    return refs.length;
  }

  async getConfirmRepairOptions(
    tripId: string,
    issueId: string,
  ): Promise<{ problemId: string; options: ConsumerRepairOptionViewModel[] }> {
    const refs = await this.loadUnresolvedRefs(tripId);
    const poi = refs.find((p) => buildCprePoiIssueId(p.name) === issueId);
    if (!poi) {
      return { problemId: issueId, options: [] };
    }

    const options: ConsumerRepairOptionViewModel[] = [];

    if (poi.poiId && poi.status === 'MATCHED') {
      options.push({
        optionId: `cpre_confirm_${poi.poiId}`,
        title: `确认：${poi.canonicalName ?? poi.name}`,
        summary: '使用官方 POI 标识继续规划',
        preserves: ['已解析的官方 POI'],
        sacrifices: [],
        impact: {},
        canApply: true,
      });
    }

    options.push({
      optionId: 'cpre_open_confirmation',
      title: '在 Compare 页选择正确地点',
      summary: '打开路线对比，点击待确认 POI 芯片完成确认',
      preserves: ['用户显式确认'],
      sacrifices: [],
      impact: {},
      canApply: true,
    });

    return { problemId: issueId, options };
  }

  private async loadUnresolvedRefs(tripId: string): Promise<ExplorationResolvedPoiRef[]> {
    const scenario = await this.prisma.explorationScenario.findFirst({
      where: { tripId },
      select: { id: true, initialInput: true },
    });
    if (!scenario) return [];

    const initialInput = this.scenarios.parseInitialInput(scenario.initialInput);
    const destinationCode = initialInput.destinationCodes[0] ?? 'IS';

    const selected = await this.prisma.explorationRouteVariant.findFirst({
      where: {
        scenarioId: scenario.id,
        status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED,
      },
    });

    const variants = selected
      ? [selected]
      : await this.prisma.explorationRouteVariant.findMany({
          where: {
            scenarioId: scenario.id,
            status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT,
          },
        });

    const byName = new Map<string, ExplorationResolvedPoiRef>();

    for (const variant of variants) {
      const parsed = this.routeDetails.parseStoredRouteDetail(variant.routeDetail);
      if (!parsed) continue;

      const resolvedPois = await this.poiResolution.resolveForRouteDetail(
        parsed,
        variant.narrative,
        destinationCode,
      );

      for (const poi of resolvedPois) {
        if (isUnresolvedExplorationPoi(poi)) {
          byName.set(poi.name, poi);
        }
      }
    }

    return [...byName.values()];
  }

  private toConsumerRisk(poi: ExplorationResolvedPoiRef, tripId: string): ConsumerRiskViewModel {
    const issueId = buildCprePoiIssueId(poi.name);
    const severity: ConsumerRiskViewModel['severity'] =
      poi.status === 'NOT_FOUND' ? 'CONFLICT' : 'VERIFY';

    const headline =
      poi.status === 'AMBIGUOUS'
        ? `请确认地点：「${poi.name}」存在多个匹配`
        : poi.status === 'NOT_FOUND'
          ? `未找到官方 POI：${poi.name}`
          : `请确认地点：${poi.name}`;

    const explanation =
      poi.canonicalName && poi.canonicalName !== poi.name
        ? `系统推测为「${poi.canonicalName}」，需您确认后才会写入可靠性检查。`
        : '路线中的地点尚未完成官方 POI 解析确认。';

    return {
      issueId,
      severity,
      headline,
      explanation,
      consequence: '未确认的地点无法用于可靠性决策与后续订票链路。',
      decisionRequired: true,
      evidence: [{ sourceLabel: 'CPRE', confidence: 'HIGH' }],
      source: {
        gatewayAssessmentBatchId: 'cpre-exploration-bridge',
        canonicalIssueId: issueId,
        tripId,
        tripVersion: 1,
        evidenceVersion: 'cpre-v1',
      },
      cprePoi: {
        mention: poi.name,
        status: poi.status,
        poiId: poi.poiId,
        canonicalName: poi.canonicalName,
        confidence: poi.confidence,
      },
    };
  }
}
