// src/itinerary-optimization/interfaces/plan-request.interface.ts

/**
 * 单日求解请求（PlanRequest）
 * 
 * 符合 Technical Strategy Standard 规范
 */
export interface PlanRequest {
  /** 日期 (ISO 8601 date) */
  date: string;

  /** 时区 (IANA timezone, 例如 "Asia/Shanghai") */
  timezone: string;

  /** 日界（单日可用时间区间） */
  day_boundary: {
    start: string; // "09:00"
    end: string;   // "22:00"
  };

  /** 起点 */
  start: {
    node_id: number;
    name: string;
    geo: { lat: number; lng: number };
  };

  /** 终点 */
  end: {
    node_id: number;
    same_as_start?: boolean;
    name?: string;
    geo?: { lat: number; lng: number };
  };

  /** 节点列表 */
  nodes: PlanNode[];

  /** 交通策略 */
  transport_policy?: {
    /** 缓冲因子（默认 1.2） */
    buffer_factor?: number;
    /** 固定缓冲（分钟，默认 15） */
    fixed_buffer_min?: number;
    /** 交通模态切换成本（分钟） */
    switch_cost_min?: {
      'walk->metro'?: number;
      'metro->taxi'?: number;
      'taxi->walk'?: number;
      [key: string]: number | undefined;
    };
    /** 跨区惩罚（分钟，默认 8） */
    cross_region_cost_min?: number;
  };

  /** 目标权重 */
  objective_weights?: {
    travel?: number;      // 旅行时间权重（默认 1.0）
    wait?: number;        // 等待时间权重（默认 1.5）
    soft_cost?: number;  // 软节点成本权重（默认 1.0）
    drop_penalty?: number; // 丢弃惩罚权重（默认 1.0）
    reward?: number;      // 奖励权重（默认 1.0）
  };

  /** 生活方式策略 */
  lifestyle_policy?: {
    /** 最早第一站时间 */
    earliest_first_stop?: string; // "09:00"
    /** 午餐休息 */
    lunch_break?: {
      enabled: boolean;
      duration_min: number; // 默认 60
      window: [string, string]; // ["11:30", "13:30"]
    };
  };

  /** 规划偏好（Pacing） */
  pacing?: 'relaxed' | 'normal' | 'intense';
}

/**
 * 规划节点（PlanNode）
 * 
 * 符合 Technical Strategy Standard 规范
 */
export interface PlanNode {
  /** 节点 ID */
  id: number;

  /** 节点名称 */
  name: string;

  /** 节点类型 */
  type: 'poi' | 'restaurant' | 'hotel' | 'break' | 'virtual';

  /** 服务时长（分钟） */
  service_duration_min: number;

  /** 时间窗列表（支持多时间窗） */
  time_windows?: Array<[string, string]>; // [["05:00","14:00"], ["18:00","22:00"]]

  /** 约束条件 */
  constraints?: {
    /** 是否为硬节点（必须访问） */
    is_hard_node?: boolean;
    /** 优先级（1=最高, 5=最低） */
    priority_level?: number; // 1-5
    /** 丢弃惩罚（如果未设置，根据 priority_level 计算） */
    drop_penalty?: number;
    /** 访问奖励 */
    reward?: number;
  };

  /** 地理位置 */
  geo: {
    lat: number;
    lng: number;
  };

  /** 元数据 */
  meta?: {
    /** 区域 ID（用于跨区惩罚） */
    region_id?: string;
    /** 标签 */
    tags?: string[];
    /** 原始节点 ID（虚拟节点使用） */
    origin_id?: number;
    /** 互斥组 ID（同一组最多选 1 个） */
    disjunction_group_id?: number;
  };
}

/**
 * 鲁棒时间矩阵
 */
export interface RobustTimeMatrix {
  /** 时间单位 */
  unit: 'minute';

  /** 基础时间来源 */
  base: 'api_duration';

  /** 鲁棒策略 */
  robust_policy: {
    buffer_factor: number;
    fixed_buffer_min: number;
  };

  /** 时间矩阵（分钟） */
  matrix: number[][];

  /** 时间组件（用于可解释性） */
  components?: {
    /** API 原始时间 */
    api: number[][];
    /** 缓冲后时间 */
    buffer: number[][];
    /** 固定缓冲 */
    fixed: number;
    /** 切换成本 */
    switch?: number[][];
    /** 跨区惩罚 */
    cross_region?: number[][];
  };
}

/**
 * 优化结果（OptimizationResult）
 * 
 * 符合 Technical Strategy Standard 规范
 */
export interface OptimizationResult {
  /** 求解状态 */
  status: 'FEASIBLE' | 'OPTIMAL' | 'INFEASIBLE';

  /** 摘要信息 */
  summary: {
    /** 总旅行时间（分钟） */
    total_travel_min: number;
    /** 总等待时间（分钟） */
    total_wait_min: number;
    /** 总服务时间（分钟） */
    total_service_min: number;
    /** 总日时长（分钟） */
    total_day_min: number;
    /** 丢弃节点数量 */
    dropped_count: number;
    /** 稳健度分数（0-1） */
    robustness_score: number;
  };

  /** 路线（按顺序） */
  route: RouteNode[];

  /** 时间轴事件（包含等待、午餐等显式事件） */
  timeline?: TimelineEvent[];

  /** 丢弃的节点 */
  dropped: DroppedNode[];

  /** 诊断信息 */
  diagnostics?: {
    /** 关键时间窗（接近关闭的节点） */
    critical_windows?: Array<{
      node_id: number;
      slack_to_close_min: number; // 距离关闭的剩余时间（分钟）
    }>;
    /** 假设条件 */
    assumptions?: {
      buffer_factor: number;
      fixed_buffer_min: number;
    };
  };

  /** 稳健度元数据 */
  robustness?: {
    /** 总缓冲时间（分钟） */
    total_buffer_minutes: number;
    /** 总等待时间（分钟） */
    total_wait_minutes: number;
    /** 最紧张的 3 个节点剩余时间 */
    top3_min_slack_nodes: Array<{
      node_id: number;
      slack_min: number;
    }>;
    /** 风险等级 */
    risk_level?: 'low' | 'medium' | 'high';
  };
}

/**
 * 时间轴事件
 */
export interface TimelineEvent {
  /** 事件类型 */
  type: 'NODE' | 'WAIT' | 'LUNCH' | 'TRAVEL';
  /** 开始时间（HH:mm） */
  start: string;
  /** 结束时间（HH:mm） */
  end: string;
  /** 持续时间（分钟） */
  duration_min: number;
  /** 描述 */
  description?: string;
  /** 关联节点 ID（如果是 NODE 类型） */
  node_id?: number;
}

/**
 * 路线节点
 */
export interface RouteNode {
  /** 序列号（从 1 开始） */
  seq: number;

  /** 节点 ID */
  node_id: number;

  /** 原始节点 ID（虚拟节点使用） */
  origin_id?: number;

  /** 节点名称 */
  name: string;

  /** 到达时间（HH:mm） */
  arrival: string;

  /** 开始服务时间（HH:mm） */
  start_service: string;

  /** 结束服务时间（HH:mm） */
  end_service: string;

  /** 等待时间（分钟） */
  wait_min: number;

  /** 从前一个节点的旅行时间（分钟） */
  travel_min_from_prev: number;
}

/**
 * 丢弃原因码（Reason Codes）
 */
export enum DropReasonCode {
  /** 时间窗冲突（到达/服务无法落在任一营业时段内） */
  TIME_WINDOW_CONFLICT = 'TIME_WINDOW_CONFLICT',
  /** 总时长超标（受日界约束） */
  INSUFFICIENT_TOTAL_TIME = 'INSUFFICIENT_TOTAL_TIME',
  /** 闭馆日/停业日 */
  CLOSED_DAY = 'CLOSED_DAY',
  /** 等待过长导致性价比低（>阈值） */
  HIGH_WAIT_TIME = 'HIGH_WAIT_TIME',
  /** 低优先级 + 绕路成本过高（penalty 权衡） */
  LOW_PRIORITY_NOT_WORTH = 'LOW_PRIORITY_NOT_WORTH',
  /** 为保证必去点可行而丢弃 */
  HARD_NODE_PROTECTION = 'HARD_NODE_PROTECTION',
  /** 理想时间可行但鲁棒时间不可行（需在解释中说明） */
  ROBUST_TIME_INFEASIBLE = 'ROBUST_TIME_INFEASIBLE',
  /** 早起限制冲突 */
  EARLY_DEPARTURE_CONFLICT = 'EARLY_DEPARTURE_CONFLICT',
}

/**
 * 丢弃的节点
 */
export interface DroppedNode {
  /** 节点 ID */
  node_id: number;

  /** 节点名称 */
  name: string;

  /** 丢弃原因码 */
  reason_code: DropReasonCode;

  /** 丢弃原因（兼容旧字段） */
  reason?: string;

  /** 惩罚值 */
  penalty: number;

  /** 解释信息 */
  explanation: {
    /** 自然语言解释 */
    text: string;
    /** 结构化事实 */
    facts?: {
      close_time?: string;
      slack_min?: number;
      required_departure?: string;
      arrival_time?: string;
      wait_minutes?: number;
      [key: string]: any;
    };
    /** 建议 */
    suggestions?: string[];
  };
}

