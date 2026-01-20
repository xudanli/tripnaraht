// src/agent/training/interfaces/trajectory.interface.ts

import { GateResult, Itinerary, DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';

/**
 * ComplianceResult（合规检查结果）
 */
export interface ComplianceResult {
  risk_warnings: Array<{
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
    message: string;
    requires_user_confirmation: boolean;
  }>;
  disclaimers: string[];
  required_confirmations: string[];
}

/**
 * ExecutionResult（执行结果）
 */
export interface ExecutionResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * 轨迹验证结果
 */
export interface TrajectoryValidationResult {
  isValid: boolean;
  score: number; // 0..1
  reasons: string[];
}

/**
 * Reward信号
 */
export interface RewardSignal {
  type: 'USER_APPROVAL' | 'PLAN_COMMIT' | 'DECISION_ALIGNMENT' | 'EXECUTION_SUCCESS' | 'EXECUTION_FAILURE';
  value: number; // reward值
  timestamp: string; // ISO 8601
  metadata?: Record<string, any>;
}

/**
 * 轨迹收集数据
 */
export interface TrajectoryCollectionData {
  requestId: string;
  tripId?: string;
  plan: Itinerary;
  decisionTrace: DecisionLogEntry[];
  researchData: Record<string, any>;
  gateResult: GateResult;
  complianceResult: ComplianceResult;
  modelVersion?: string;
  countryCode?: string;
}

/**
 * 轨迹更新数据（用于更新已有轨迹）
 */
export interface TrajectoryUpdateData {
  userApproval?: ApprovalStatus;
  executionResult?: ExecutionResult;
}
