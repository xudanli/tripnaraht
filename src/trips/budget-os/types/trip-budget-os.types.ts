/** Travel Budget OS — L1–L4 canonical types (Phase 0) */

import type { TravelWallet } from './travel-wallet.types';
import type { TripValueSummary } from './value-feedback.types';

export type SpendingPersona =
  | 'experience'
  | 'quality'
  | 'frugal'
  | 'efficiency'
  | 'balanced';

export type BudgetStructureMode = 'absolute' | 'percent';

export interface CategoryAllocations {
  transportation: number;
  accommodation: number;
  experience: number;
  food: number;
  other?: number;
}

export interface CategoryPercentages {
  transportation: number;
  accommodation: number;
  experience: number;
  food: number;
  other?: number;
}

export interface TripBudgetIntent {
  total: number;
  currency: string;
  dailyBudget?: number;
  source: 'user' | 'imported' | 'inferred';
  setAt: string;
}

export interface StructureVsActualEntry {
  intent: number;
  estimated: number;
  actual: number;
  variance: number;
}

export interface BudgetStructure {
  mode: BudgetStructureMode;
  allocations: CategoryAllocations;
  percentages?: CategoryPercentages;
  spendingPersona?: SpendingPersona;
  personaConfidence?: number;
  structureVsActual?: Record<string, StructureVsActualEntry>;
  updatedAt: string;
}

export interface BudgetActualsSnapshot {
  totalEstimated: number;
  totalActual: number;
  currency: string;
  categoryBreakdown: {
    accommodation: number;
    transportation: number;
    food: number;
    activities: number;
    other: number;
  };
  unpaidCount: number;
  budgetUsagePercent?: number;
}

export interface BudgetGateStatus {
  verdict: 'ALLOW' | 'NEED_CONFIRM' | 'NEED_ADJUST' | 'REJECT';
  violationTypes: BudgetViolationType[];
  evaluatedAt?: string;
  planId?: string;
}

export type BudgetViolationType =
  | 'TOTAL_EXCEEDED'
  | 'CATEGORY_EXCEEDED'
  | 'STRUCTURE_MISMATCH'
  | 'WALLET_UNSET';

export interface BudgetViolation {
  type: BudgetViolationType;
  category?: string;
  intentAmount?: number;
  estimatedAmount?: number;
  variance?: number;
  variancePercent?: number;
  message: string;
}

export interface TripBudgetProfile {
  tripId: string;
  intent: TripBudgetIntent | null;
  structure: BudgetStructure | null;
  /** L2-05: suggested L2 when intent exists but structure unset */
  suggestedStructure?: SuggestedBudgetStructure;
  wallet?: TravelWallet;
  valueSummary?: TripValueSummary;
  actuals?: BudgetActualsSnapshot;
  gateStatus?: BudgetGateStatus;
  updatedAt: string;
}

export interface SuggestedBudgetStructure {
  mode: 'percent';
  percentages: CategoryPercentages;
  spendingPersona: SpendingPersona;
  source: 'money_dna' | 'canonical';
}

/** Persisted shape inside Trip.budgetConfig */
export interface TripBudgetConfigJson {
  budgetIntent?: TripBudgetIntent;
  budgetStructure?: BudgetStructure;
  gateStatus?: BudgetGateStatus;
  totalBudget?: number | null;
  total?: number | null;
  currency?: string;
  dailyBudget?: number | null;
  categoryLimits?: Record<string, number> | null;
  alertThreshold?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface PutBudgetIntentInput {
  total: number;
  currency?: string;
  dailyBudget?: number | null;
}

export interface PutBudgetStructureInput {
  mode: BudgetStructureMode;
  allocations?: CategoryAllocations;
  percentages?: CategoryPercentages;
}

export const BUDGET_OS_MIN_TOTAL = 100;
export const BUDGET_OS_MAX_TOTAL = 10_000_000;
export const BUDGET_OS_SUPPORTED_CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY'] as const;
export const STRUCTURE_MISMATCH_THRESHOLD = 0.25;
export const ALLOCATION_SUM_TOLERANCE = 1;
export const PERCENT_SUM_TOLERANCE = 0.01;
