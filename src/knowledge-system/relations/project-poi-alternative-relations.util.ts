/**
 * POI Alternatives fixture → KnowledgeRelation[]
 */

import { ICELAND_POI_ALTERNATIVES } from '../../poi-access-capacity/fixtures/iceland-poi-alternatives';
import type {
  KnowledgeRelation,
  RelationProjectionRow,
} from '../contracts/knowledge-relation.types';
import { RELATION_ADAPTER_CONFIDENCE } from '../contracts/knowledge-relation.types';
import { inferCountryFromEntityId } from './infer-country-from-entity-id.util';

export function projectPoiAlternativeRelations(): {
  relations: KnowledgeRelation[];
  projections: RelationProjectionRow[];
} {
  const relations: KnowledgeRelation[] = [];
  const projections: RelationProjectionRow[] = [
    {
      source: 'poi_alternatives',
      originalType: 'USE_ALTERNATIVE / alternativePoiId',
      projectedType: 'ALTERNATIVE_TO',
      note: 'Also emits SOFT_ALTERNATIVE with metadata.kind=SOFT',
    },
  ];

  for (const [fromPoi, alts] of Object.entries(ICELAND_POI_ALTERNATIVES)) {
    alts.forEach((alt, idx) => {
      relations.push({
        relationId: `poi_alt:${fromPoi}:${alt.poiId}:hard`,
        type: 'ALTERNATIVE_TO',
        from: fromPoi,
        to: alt.poiId,
        confidence:
          idx === 0
            ? RELATION_ADAPTER_CONFIDENCE.poi_alternative_primary
            : RELATION_ADAPTER_CONFIDENCE.poi_alternative_secondary,
        source: 'poi_alternatives',
        sourceRef: 'iceland-poi-alternatives',
        country: inferCountryFromEntityId(fromPoi) ?? inferCountryFromEntityId(alt.poiId),
        metadata: {
          name: alt.name,
          nameEN: alt.nameEN,
          reason: alt.reason,
          priority: idx,
        },
      });
      relations.push({
        relationId: `poi_alt:${fromPoi}:${alt.poiId}:soft`,
        type: 'SOFT_ALTERNATIVE',
        from: fromPoi,
        to: alt.poiId,
        confidence:
          idx === 0
            ? RELATION_ADAPTER_CONFIDENCE.poi_soft_primary
            : RELATION_ADAPTER_CONFIDENCE.poi_soft_secondary,
        source: 'poi_alternatives',
        sourceRef: 'iceland-poi-alternatives',
        country: inferCountryFromEntityId(fromPoi) ?? inferCountryFromEntityId(alt.poiId),
        metadata: {
          kind: 'SOFT',
          originalType: 'USE_ALTERNATIVE',
          reason: alt.reason,
        },
      });
    });
  }

  return { relations, projections };
}
