/**
 * Golden Set / Region Pack → KnowledgeRelation[] (read-only projection).
 */

import { listActiveRegionPacks } from '../../trips/iceland-self-drive/packs/iceland-region-pack.registry';
import type { IcelandRegionRelationType } from '../../trips/iceland-self-drive/types/iceland-region-planning-pack.types';
import type {
  KnowledgeRelation,
  KnowledgeRelationType,
  RelationProjectionRow,
} from '../contracts/knowledge-relation.types';
import { RELATION_ADAPTER_CONFIDENCE } from '../contracts/knowledge-relation.types';
import { inferCountryFromEntityId } from './infer-country-from-entity-id.util';

function placeDbId(placeId: number): string {
  return `place:db:${placeId}`;
}

function mapGoldenType(
  t: IcelandRegionRelationType,
): KnowledgeRelationType | null {
  switch (t) {
    case 'CO_VISIT_CLUSTER':
      return 'CO_VISIT';
    case 'SOFT_ALTERNATIVE':
      return 'SOFT_ALTERNATIVE';
    case 'HARD_EXCLUSIVE':
      return 'INCOMPATIBLE_WITH';
    case 'PARENT_CHILD':
    case 'ALIAS_OF':
      return null; // DEFER / Identity
    default:
      return null;
  }
}

export function projectGoldenSetRelations(): {
  relations: KnowledgeRelation[];
  projections: RelationProjectionRow[];
} {
  const relations: KnowledgeRelation[] = [];
  const projections: RelationProjectionRow[] = [];
  const seenProj = new Set<string>();

  for (const pack of listActiveRegionPacks()) {
    for (const rel of pack.relations ?? []) {
      const projected = mapGoldenType(rel.relationType);
      if (!projected) continue;

      const projKey = `${rel.relationType}->${projected}`;
      if (!seenProj.has(projKey)) {
        seenProj.add(projKey);
        projections.push({
          source: 'golden_set',
          originalType: rel.relationType,
          projectedType: projected,
          note: rel.notes,
        });
      }

      const members = rel.memberPlaceIds ?? [];
      // Fan-out pairwise among cluster / alternative members (undirected stored as ordered pairs)
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const from = placeDbId(members[i]!);
          const to = placeDbId(members[j]!);
          relations.push({
            relationId: `gs:${pack.packId}:${rel.groupId}:${members[i]}-${members[j]}`,
            type: projected,
            from,
            to,
            confidence: RELATION_ADAPTER_CONFIDENCE.golden_set,
            source: 'golden_set',
            sourceRef: `iceland-region-pack:${pack.packId}`,
            country: inferCountryFromEntityId(from) ?? inferCountryFromEntityId(to),
            metadata: {
              originalType: rel.relationType,
              groupId: rel.groupId,
              packId: pack.packId,
              memberPlaceIds: members,
            },
          });
        }
      }
    }
  }

  return { relations, projections };
}
