/** Leader 拓扑：并行批（destination 大包 ∥ hotel ∥ flight）与串行尾（transport）。 */
export type ResearchTopologyParallelSlot = {
  id: string;
  kind: 'destination' | 'hotel' | 'flight';
};
export type ResearchTopologySequentialSlot = { id: string; kind: 'transport' | 'compliance' };

export type ResearchTopologyPlan = {
  /**
   * full 研究：在并行批之前先跑 transport，与 Monolith `execute` 中「transport → destination」顺序对齐。
   * scoped_partial 编排仍为「并行批 → sequential transport」。
   */
  preParallelSequential?: ResearchTopologySequentialSlot[];
  parallel: ResearchTopologyParallelSlot[];
  sequential: ResearchTopologySequentialSlot[];
};
