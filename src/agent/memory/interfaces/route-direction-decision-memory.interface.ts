// src/agent/memory/interfaces/route-direction-decision-memory.interface.ts

/**
 * L2: 路线决策记忆（RouteDirectionDecisionMemory）
 * 
 * 解释"为什么这次是这条"
 */

export interface RouteDirectionDecisionMemory {
  id: string;
  userId: string;
  tripId?: string;

  countryCode: string;
  month: number;

  selectedRouteDirectionId: number;
  rejectedRouteDirectionIds: number[];

  keyConstraints: Record<string, any>; // JSONB
  scoreBreakdown: Record<string, any>; // JSONB
  explanation: {
    whySelected: string;
    whyRejected: Array<{ id: number; reason: string }>;
    riskPoints: string[];
    adjustmentSuggestions?: string[];
  };

  createdAt: Date;
}

