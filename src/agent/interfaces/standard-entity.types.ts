/**
 * Entity Resolution 标准实体（Redis 别名热缓存值结构）。
 */

export type StandardEntityType = 'destination' | 'poi';

export interface StandardEntity {
  id: string;
  name: string;
  type: StandardEntityType;
  parent_destination?: string;
}

export interface ExactEntityResolution {
  entity: StandardEntity;
  confidence: number;
  /** 置信度极高时跳过 Stage 1 LLM */
  skipStage1Llm: boolean;
  matchedAlias: string;
  source: 'redis' | 'memory';
}
