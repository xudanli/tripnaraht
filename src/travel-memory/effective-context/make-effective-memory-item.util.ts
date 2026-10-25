/**
 * 测试 / 手工构造 EffectiveMemoryItem 时补齐 authority + sourceScope。
 */

import { deriveEffectiveMemoryAuthority } from './effective-memory-authority.util';
import type {
  EffectiveMemoryItemV1,
  EffectiveMemoryLayer,
  EffectiveMemoryOverridePolicy,
  EffectiveMemorySensitivity,
  TravelerMemoryDomain,
  TravelerMemorySemanticType,
} from './effective-traveler-context.types';

export function makeEffectiveMemoryItem(input: {
  domain: TravelerMemoryDomain;
  semanticType: TravelerMemorySemanticType;
  key: string;
  value: unknown;
  layer: EffectiveMemoryLayer;
  confidence?: number;
  sourceRefs?: string[];
  overridePolicy?: EffectiveMemoryOverridePolicy;
  sensitivity?: EffectiveMemorySensitivity;
}): EffectiveMemoryItemV1 {
  return {
    domain: input.domain,
    semanticType: input.semanticType,
    key: input.key,
    value: input.value,
    layer: input.layer,
    sourceScope: input.layer,
    authority: deriveEffectiveMemoryAuthority(input.semanticType),
    confidence: input.confidence ?? 0.8,
    status: 'SHADOW_PROJECTED',
    sourceRefs: input.sourceRefs ?? [],
    overridePolicy: input.overridePolicy ?? 'L2_WINS',
    sensitivity: input.sensitivity ?? 'NORMAL',
  };
}
