// src/skills/detail/shared/detail-state.types.ts
/**
 * DetailState - 行程详情页的状态
 * 
 * 行程详情页 = "理解与掌控旅行现状的地方"
 */

/**
 * 行程健康度
 */
export interface TripHealth {
  overall: 'healthy' | 'warning' | 'critical';
  dimensions: {
    schedule: {
      status: 'healthy' | 'warning' | 'critical';
      score: number; // 0-100
      issues: string[];
    };
    budget: {
      status: 'healthy' | 'warning' | 'critical';
      score: number; // 0-100
      issues: string[];
    };
    pace: {
      status: 'healthy' | 'warning' | 'critical';
      score: number; // 0-100
      issues: string[];
    };
    feasibility: {
      status: 'healthy' | 'warning' | 'critical';
      score: number; // 0-100
      issues: string[];
    };
  };
}

/**
 * 决策解释
 */
export interface DecisionExplanation {
  decisionId: string;
  decisionType: string;
  explanation: string;
  evidence: Array<{
    source: string;
    excerpt: string;
    relevance: string;
  }>;
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
  timestamp: string;
}

/**
 * 行程状态理解
 */
export interface TripStatusUnderstanding {
  currentPhase: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  nextSteps: Array<{
    step: string;
    priority: 'high' | 'medium' | 'low';
    deadline?: string;
  }>;
  risks: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    mitigation?: string;
  }>;
  opportunities: Array<{
    type: string;
    description: string;
    benefit: string;
  }>;
}

/**
 * 详情状态
 */
export interface DetailState {
  tripId: string;
  health: TripHealth;
  statusUnderstanding: TripStatusUnderstanding;
  decisionExplanations: DecisionExplanation[];
  evidence: Array<{
    id: string;
    source: string;
    excerpt: string;
    relevance: string;
    confidence: 'low' | 'medium' | 'high';
  }>;
  lastUpdated: string; // ISO timestamp
}
