// src/agent/interfaces/agent-state.interface.ts

/**
 * AgentState（Working Memory）统一结构
 * 
 * 所有模块只读写这个 state，禁止散落临时状态
 */
export interface AgentState {
  /** 请求 ID */
  request_id: string;

  /** 用户输入 */
  user_input: string;

  /** 行程信息 */
  trip: {
    trip_id: string | null;
    days: number;
    day_boundaries: Array<{ start: string; end: string }>;
    lunch_break: {
      enabled: boolean;
      duration_min: number;
      window: [string, string];
    };
    pacing: 'relaxed' | 'normal' | 'tight';
  };

  /** Trip 详细信息（从 trip.load_draft 加载） */
  tripInfo?: any;

  /** 草稿状态 */
  draft: {
    nodes: any[];
    hard_nodes: any[];
    soft_nodes: any[];
    edits: any[];
  };

  /** 记忆 */
  memory: {
    semantic_facts: {
      pois: any[];
      rules: Record<string, any>;
    };
    episodic_snippets: any[];
    user_profile: Record<string, any>;
    readiness?: {
      findings: any[];
      summary: {
        total_blockers: number;
        total_must: number;
        total_should: number;
        total_optional: number;
        total_risks: number;
      };
      constraints: any[];
      tasks: any[];
      checkedAt: string;
    };
  };

  /** 计算中间结果 */
  compute: {
    clusters: any | null;
    time_matrix_api: number[][] | null;
    time_matrix_robust: number[][] | null;
    optimization_results: any[];
    robustness: any | null;
  };

  /** ReAct 循环状态 */
  react: {
    step: number;
    max_steps: number;
    observations: any[];
    decision_log: Array<{
      step: number;
      chosen_action: string;
      reason_code: string;
      facts: Record<string, any>;
      policy_id: string;
    }>;
  };

  /** 结果状态 */
  result: {
    status: 'DRAFT' | 'READY' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'FAILED' | 'TIMEOUT';
    timeline: any[];
    dropped_items: any[];
    explanations: any[];
  };

  /** 可观测性指标 */
  observability: {
    router_ms: number;
    latency_ms: number;
    tool_calls: number;
    browser_steps: number;
    cost_est_usd: number;
    fallback_used: boolean;
    planner_type?: 'llm' | 'rule_based'; // 规划器类型（LLM 或规则引擎）
  };
}

