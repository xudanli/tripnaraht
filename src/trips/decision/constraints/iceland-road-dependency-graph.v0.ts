import graphJson from '../../../../data/constraints/iceland-road-dependency.v0.json';
import type { RoadDependencyGraph } from './road-dependency-graph.types';

/** 冰岛 F-road → 高地 POI 绑定（v0 种子；随 POI 库迭代版本号） */
export const ICELAND_ROAD_DEPENDENCY_GRAPH_V0 = graphJson as RoadDependencyGraph;
