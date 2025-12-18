// src/agent/interfaces/router.interface.ts

/**
 * Route 枚举
 */
export enum RouteType {
  /** 标准 API / CRUD / 简单查 */
  SYSTEM1_API = 'SYSTEM1_API',
  /** 知识库/向量检索 */
  SYSTEM1_RAG = 'SYSTEM1_RAG',
  /** ReAct + 工具 + TravelPlanner/Critic */
  SYSTEM2_REASONING = 'SYSTEM2_REASONING',
  /** 无头浏览器兜底（仅授权后） */
  SYSTEM2_WEBBROWSE = 'SYSTEM2_WEBBROWSE',
}

/**
 * Router 决策原因
 */
export enum RouterReason {
  MULTI_CONSTRAINT = 'MULTI_CONSTRAINT',
  MISSING_INFO = 'MISSING_INFO',
  NO_API = 'NO_API',
  REALTIME_WEB = 'REALTIME_WEB',
  HIGH_RISK_ACTION = 'HIGH_RISK_ACTION',
}

/**
 * UI 状态
 */
export enum UIStatus {
  THINKING = 'thinking',
  BROWSING = 'browsing',
  VERIFYING = 'verifying',
  REPAIRING = 'repairing',
  AWAITING_CONSENT = 'awaiting_consent',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  DONE = 'done',
  FAILED = 'failed',
}

/**
 * Router 输出契约（必须按此 JSON）
 */
export interface RouterOutput {
  route: RouteType;
  confidence: number;
  reasons: RouterReason[];
  required_capabilities: string[];
  consent_required: boolean;
  budget: {
    max_seconds: number;
    max_steps: number;
    max_browser_steps: number;
  };
  ui_hint: {
    mode: 'fast' | 'slow';
    status: UIStatus;
    message: string;
  };
}

