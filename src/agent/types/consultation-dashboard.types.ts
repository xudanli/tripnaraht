/**
 * 咨询类回复「可视化 Dashboard」结构化载荷（与前端 AI 旅行咨询 Dashboard 对齐）。
 * LLM 通过 <<<CONSULTATION_UI_JSON>>> 块输出；服务端 sanitize 后写入 route_and_run payload。
 */

export type ConsultationTone = 'neutral' | 'positive' | 'warning' | 'danger';

export type ConsultationRiskLevel = 'low' | 'medium' | 'high';

export type ConsultationScoreLevel = 'low' | 'medium' | 'high' | 'extreme' | 'unknown';

export interface ConsultationDashboardScoreDimension {
  id: string;
  label: string;
  level: ConsultationScoreLevel;
  short_note?: string;
}

export interface ConsultationDashboardSummaryCard {
  id: string;
  title: string;
  value: string;
  hint?: string;
  tone?: ConsultationTone;
}

export interface ConsultationDashboardRiskItem {
  id: string;
  level: ConsultationRiskLevel;
  title: string;
  detail?: string;
  suggestions?: string[];
}

export interface ConsultationDashboardSegment {
  time?: string;
  label: string;
  detail?: string;
  risk_badge?: ConsultationRiskLevel;
}

export interface ConsultationDashboardDayPlan {
  day_index: number;
  title: string;
  segments?: ConsultationDashboardSegment[];
}

export interface ConsultationDashboardBudget {
  currency?: string;
  total_range_label?: string;
  breakdown?: Array<{ category: string; label: string; share?: number }>;
}

export interface ConsultationBookingDeadline {
  id: string;
  title: string;
  urgency: 'now' | 'soon' | 'flexible';
  note?: string;
}

export interface ConsultationDashboardMapHint {
  nodes?: Array<{ label: string; kind?: string }>;
  /** WGS84 [lng, lat] */
  path_coordinates?: Array<[number, number]>;
}

/**
 * v1：咨询 Dashboard（摘要卡 / 风险 / 简版时间轴 / 预算 / 预订提醒 / 地图线索）。
 */
export interface ConsultationDashboardV1 {
  version: 1;
  headline?: string;
  subheadline?: string;
  score_dimensions?: ConsultationDashboardScoreDimension[];
  summary_cards?: ConsultationDashboardSummaryCard[];
  risks?: ConsultationDashboardRiskItem[];
  daily_plan?: ConsultationDashboardDayPlan[];
  budget?: ConsultationDashboardBudget;
  booking_deadlines?: ConsultationBookingDeadline[];
  map?: ConsultationDashboardMapHint;
  /** 主按钮文案（与 suggested_operations 并存时可二选一突出） */
  primary_cta_label?: string;
  /**
   * 载荷来源：`fallback` 表示模型未输出有效 Dashboard，由服务端根据 `suggested_operations` 拼装。
   * 省略或视为模型输出。
   */
  dashboard_origin?: 'llm' | 'fallback';
}
