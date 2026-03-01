/**
 * 仪表盘模块导出
 *
 * P3.3 优化：实时监控仪表盘
 */

export { RealtimeDashboardService } from './realtime-dashboard.service';
export type {
  SystemHealth,
  ComponentHealth,
  Alert,
  DecisionMetrics,
  TimeSeriesPoint,
  DashboardSnapshot,
  TrendData,
  RecentDecision,
  DashboardConfig,
  AlertThresholds,
} from './realtime-dashboard.service';
