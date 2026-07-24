/** PLAN_GEN / VERIFY 后挂载到 trip_plan_request 的路由实数（与求解器 plan_output 对齐）。 */
export interface PlanRoutingDaySegment {
  day_index: number;
  driving_minutes: number;
}

export interface PlanRoutingRouteSummary {
  total_duration_minutes?: number;
  pure_driving_minutes: number;
  total_distance_meters?: number;
  max_single_day_driving_minutes: number;
}

export interface PlanGenerationRoutingOutput {
  route_summary: PlanRoutingRouteSummary;
  day_segments: PlanRoutingDaySegment[];
  computed_at?: string;
  source?: 'itinerary_items' | 'plan_solver';
}

/** 公理层读取的归一化视图（多路径别名收敛到此）。 */
export interface PlanRoutingMetrics {
  pure_driving_minutes: number;
  max_single_day_driving_minutes: number;
  day_segments: PlanRoutingDaySegment[];
  source: 'trip.routing_metrics' | 'plan_output' | 'itinerary_compute';
}
