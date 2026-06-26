/**
 * Travel Cognition — TripNARA 旅行决策与路线认知核心类型。
 *
 * 产品边界：
 * - 不替用户交易，不承诺库存，不执行预订
 * - 判断路线是否值得走、是否可执行、哪里有风险、该怎么调整
 */

export * from './types/travel-entity-ref.types';
export * from './types/evidence-envelope.types';
export * from './types/coverage-disclosure.types';
export * from './types/dependency-graph.types';
export * from './types/travel-entity-graph.types';
export * from './utils/cascade-confidence.util';
export * from './utils/coverage-disclosure.builder';
export * from './graphs/flight-cascade-graph.v0';
export * from './graphs/iceland-cascade-graph.v0';
export * from './utils/trip-dependency-chain.util';
export * from './utils/dependency-impact.analyzer';
export * from './utils/iceland-dependency-impact.analyzer';
export * from './utils/dependency-impact-from-evidence.util';
export * from './types/travel-runtime-graph.types';
export * from './utils/impact-algebra.util';
export * from './adapters/schema-org-discovery.mapper';
export * from './dto/travel-runtime-api.dto';
