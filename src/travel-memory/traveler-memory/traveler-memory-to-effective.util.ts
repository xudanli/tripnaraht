/**
 * TravelerMemoryObject → EffectiveMemoryItem（进 ETC Resolver）。
 */

import type { EffectiveMemoryItemV1 } from '../effective-context/effective-traveler-context.types';
import { deriveEffectiveMemoryAuthority } from '../effective-context/effective-memory-authority.util';
import type { TravelerMemoryObjectV1 } from './traveler-memory-contract.types';

/**
 * 仅 STABLE/CONFIRMED 进决策投影；CANDIDATE/OBSERVED 可选进 shadow 列表。
 */
export function travelerMemoryObjectToEffectiveItem(
  obj: TravelerMemoryObjectV1,
  opts?: { allowCandidates?: boolean },
): EffectiveMemoryItemV1 | null {
  if (obj.status === 'REVOKED' || obj.status === 'DECAYED') return null;
  if (
    (obj.status === 'CANDIDATE' || obj.status === 'OBSERVED') &&
    !opts?.allowCandidates
  ) {
    return null;
  }

  const layer =
    obj.scope === 'TRIP' || obj.scope === 'DAY' || obj.scope === 'SESSION'
      ? 'L2_TRIP_OVERRIDE'
      : 'L1_PERSISTENT';

  return {
    domain: obj.domain,
    semanticType: obj.semantic_type,
    key: obj.key,
    value: obj.value,
    layer,
    sourceScope: layer,
    authority: deriveEffectiveMemoryAuthority(obj.semantic_type),
    confidence: obj.confidence,
    status: 'SHADOW_PROJECTED',
    sourceRefs: [
      `traveler_memory:${obj.memory_id}`,
      ...obj.evidence_refs.slice(0, 3).map((r) => `evidence:${r.type}:${r.id}`),
    ],
    overridePolicy: obj.override_policy,
    sensitivity: obj.sensitivity,
  };
}

export function travelerMemoryObjectsToEffectiveItems(
  objects: TravelerMemoryObjectV1[],
  opts?: { allowCandidates?: boolean },
): EffectiveMemoryItemV1[] {
  const out: EffectiveMemoryItemV1[] = [];
  for (const obj of objects) {
    const item = travelerMemoryObjectToEffectiveItem(obj, opts);
    if (item) out.push(item);
  }
  return out;
}
