/**
 * SpatialDomainSegment endpoints → CONNECTED_TO (optional DB projection).
 */

import type { PrismaClient } from '@prisma/client';
import type {
  KnowledgeRelation,
  RelationProjectionRow,
} from '../contracts/knowledge-relation.types';
import { RELATION_ADAPTER_CONFIDENCE } from '../contracts/knowledge-relation.types';
import { inferCountryFromEntityId } from './infer-country-from-entity-id.util';

/** Admin graph seed cap; previously 100 which truncated the subgraph. */
export const DEFAULT_SPATIAL_RELATION_LIMIT = 5000;

export const SPATIAL_PROJECTION_META: RelationProjectionRow = {
  source: 'spatial',
  originalType: 'SpatialDomainSegment.fromPoiId→toPoiId',
  projectedType: 'CONNECTED_TO',
  note: 'Endpoints projected as spatial-poi:{id} from spatial_domain_segments',
};

export async function projectSpatialConnectedRelations(
  prisma: Pick<PrismaClient, 'spatialDomainSegment'>,
  limit = DEFAULT_SPATIAL_RELATION_LIMIT,
): Promise<{ relations: KnowledgeRelation[]; projections: RelationProjectionRow[] }> {
  const rows = await prisma.spatialDomainSegment.findMany({
    take: limit,
    select: { id: true, fromPoiId: true, toPoiId: true, segmentType: true },
  });

  const relations: KnowledgeRelation[] = rows.map((r) => ({
    relationId: `spatial:seg:${r.id}`,
    type: 'CONNECTED_TO' as const,
    from: `spatial-poi:${r.fromPoiId}`,
    to: `spatial-poi:${r.toPoiId}`,
    confidence: RELATION_ADAPTER_CONFIDENCE.spatial,
    source: 'spatial' as const,
    sourceRef: `spatialDomainSegment:${r.id}`,
    country:
      inferCountryFromEntityId(r.fromPoiId) ?? inferCountryFromEntityId(r.toPoiId),
    metadata: { segmentType: r.segmentType },
  }));

  return { relations, projections: [SPATIAL_PROJECTION_META] };
}
