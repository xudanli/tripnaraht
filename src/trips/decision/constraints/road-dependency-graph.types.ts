/**
 * Road Constraint Graph — 物理路网依赖（POI / 行程可达性骨架）
 *
 * 数据由各国维护（冰岛见 `data/constraints/iceland-road-dependency.v0.json`）。
 * `dependentPOIs`：该路段不可通行时应标记不可达的 POI / 产品侧 stable id。
 */

export interface RoadSegmentNode {
  /** Road.is 查询键或内部 segment 编号，如 F208 */
  readonly roadId: string;
  /** 路段直接服务的 POI（叙事 / 解释用） */
  readonly connectsPOIs: readonly string[];
  /** 路段失效时需传播不可达性的 POI（通常 ⊇ connectsPOIs） */
  readonly dependentPOIs: readonly string[];
}

export interface RoadDependencyGraph {
  readonly countryCode: string;
  readonly version: string;
  readonly segments: readonly RoadSegmentNode[];
}
