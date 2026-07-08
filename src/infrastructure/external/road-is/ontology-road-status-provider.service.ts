import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  inferRoadAccessFromSurfaceCondition,
  parseRoadAccessState,
  parseRoadSurfaceCondition,
  type RoadAccessState,
  type RoadSurfaceCondition,
  type SegmentLatestRoadStatusV1,
} from '../../../domain/ontology/validator/road-status-contract.types';
import { DestinationPackLoaderService } from '../../../decision-runtime/packs/loader/destination-pack-loader.service';
import { RoadIsProviderService } from './road-is-provider.service';

/** 单条路段查询结果（注入 Prompt 的一行事实） */
export interface OntologyRoadStatusSegmentRow {
  roadQueryKey: string;
  spatialSegmentId?: string;
  source: 'spatial_domain_segment_cache' | 'road_is_provider';
  accessState: RoadAccessState;
  condition: RoadSurfaceCondition;
  condition_text?: string;
  observed_at?: string;
  synced_at?: string;
}

/** 单个 ontology 区域聚合后的路况真值摘要 */
export interface OntologyRegionRoadStatusPayload {
  ontologyNodeId: string;
  segments: OntologyRoadStatusSegmentRow[];
  /** 关键路段合成「最坏」准入态，供模型硬推理 */
  aggregateAccessState: RoadAccessState;
}

/** Fallback when pack ontology is unavailable (tests / pre-init). */
const ONTOLOGY_NODE_TO_ROAD_IS_KEYS_FALLBACK: Record<string, readonly string[]> = {
  'ontology:region:IS:SNAEFELLSNES': ['54', '56', '574'],
  'ontology:corridor:IS:SOUTH_COAST': ['1', '218', '249'],
};

const ACCESS_RANK: Record<RoadAccessState, number> = {
  OPEN: 0,
  RESTRICTED_4WD: 1,
  FLOOD_RISK: 2,
  SEASONAL_CLOSED: 3,
  IMPASSABLE: 4,
};

function worstAccess(a: RoadAccessState, b: RoadAccessState): RoadAccessState {
  return ACCESS_RANK[a] >= ACCESS_RANK[b] ? a : b;
}

function accessFromSnapshot(ls: SegmentLatestRoadStatusV1): RoadAccessState {
  const parsed = parseRoadAccessState(ls.accessState);
  if (parsed) return parsed;
  return inferRoadAccessFromSurfaceCondition(parseRoadSurfaceCondition(ls.condition));
}

@Injectable()
export class OntologyRoadStatusProviderService {
  private readonly logger = new Logger(OntologyRoadStatusProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roadIs: RoadIsProviderService,
    @Optional() private readonly packLoader?: DestinationPackLoaderService,
  ) {}

  /**
   * 对每个 ontology 节点：先尝试读 `spatial_domain_segments.latest_status`，否则直连 Road.is（或 mock）。
   */
  async summarizeForOntologyNodeIds(
    ontologyNodeIds: readonly string[],
  ): Promise<Map<string, OntologyRegionRoadStatusPayload>> {
    const out = new Map<string, OntologyRegionRoadStatusPayload>();
    const unique = [...new Set(ontologyNodeIds.filter(Boolean))];
    for (const nodeId of unique) {
      const keys = this.resolveRoadIsKeys(nodeId);
      if (!keys.length) continue;
      const segments: OntologyRoadStatusSegmentRow[] = [];
      let aggregate: RoadAccessState = 'OPEN';
      for (const roadQueryKey of keys) {
        const row = await this.resolveOneRoadKey(roadQueryKey);
        segments.push(row);
        aggregate = worstAccess(aggregate, row.accessState);
      }
      if (segments.length > 0) {
        out.set(nodeId, { ontologyNodeId: nodeId, segments, aggregateAccessState: aggregate });
      }
    }
    return out;
  }

  private resolveRoadIsKeys(ontologyNodeId: string): readonly string[] {
    const node = this.packLoader?.findOntologyNode(ontologyNodeId);
    if (node?.roadIsKeys?.length) return node.roadIsKeys;
    return ONTOLOGY_NODE_TO_ROAD_IS_KEYS_FALLBACK[ontologyNodeId] ?? [];
  }

  private async resolveOneRoadKey(roadQueryKey: string): Promise<OntologyRoadStatusSegmentRow> {
    let fromCache: { id: string; latest: SegmentLatestRoadStatusV1 } | null = null;
    try {
      if (this.prisma.isDbConnected?.()) {
        const seg = await this.prisma.spatialDomainSegment.findFirst({
          where: {
            rules: { path: ['road_is_road_code'], equals: roadQueryKey },
          },
          select: { id: true, latestStatus: true },
        });
        if (seg?.latestStatus && typeof seg.latestStatus === 'object' && !Array.isArray(seg.latestStatus)) {
          fromCache = { id: seg.id, latest: seg.latestStatus as unknown as SegmentLatestRoadStatusV1 };
        }
      }
    } catch (e: unknown) {
      this.logger.debug(
        `[OntologyRoadStatus] prisma segment lookup failed for ${roadQueryKey}: ${e instanceof Error ? e.message : e}`,
      );
    }

    if (fromCache) {
      const ls = fromCache.latest;
      return {
        roadQueryKey,
        spatialSegmentId: fromCache.id,
        source: 'spatial_domain_segment_cache',
        accessState: accessFromSnapshot(ls),
        condition: parseRoadSurfaceCondition(ls.condition),
        condition_text: typeof ls.condition_text === 'string' ? ls.condition_text : undefined,
        observed_at: typeof ls.observed_at === 'string' ? ls.observed_at : undefined,
        synced_at: typeof ls.synced_at === 'string' ? ls.synced_at : undefined,
      };
    }

    try {
      const ls = await this.roadIs.fetchCondition(roadQueryKey);
      return {
        roadQueryKey,
        source: 'road_is_provider',
        accessState: accessFromSnapshot(ls),
        condition: parseRoadSurfaceCondition(ls.condition),
        condition_text: typeof ls.condition_text === 'string' ? ls.condition_text : undefined,
        observed_at: typeof ls.observed_at === 'string' ? ls.observed_at : undefined,
        synced_at: typeof ls.synced_at === 'string' ? ls.synced_at : undefined,
      };
    } catch (e: unknown) {
      this.logger.warn(
        `[OntologyRoadStatus] road.is fetch failed for ${roadQueryKey}: ${e instanceof Error ? e.message : e}`,
      );
      return {
        roadQueryKey,
        source: 'road_is_provider',
        accessState: 'OPEN',
        condition: 'UNKNOWN',
        condition_text: 'Status lookup failed; treat as unknown and verify road.is',
      };
    }
  }
}
