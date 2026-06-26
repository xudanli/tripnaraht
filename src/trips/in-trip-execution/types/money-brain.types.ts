/** M9 Money Brain — 行中消费与助推类型 */

export type CaptureMethod = 'manual' | 'photo' | 'voice';

export type PsychologicalBucket =
  | 'transportation'
  | 'accommodation'
  | 'experience'
  | 'food'
  | 'other'
  | 'contingency';

export type NudgeType =
  | 'progress_bar'
  | 'reference_point'
  | 'cooling_off'
  | 'fomo_hedge';

export type RebalanceScenario = 'surplus' | 'overspend' | 'pace_gap';

export type RebalanceResponse = 'accept' | 'keep';

export interface MoneyNudge {
  type: NudgeType;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface RecordTransactionInput {
  captureMethod: CaptureMethod;
  amountLocal: number;
  currencyLocal: string;
  category: string;
  merchant?: string;
  description?: string;
  splitAmongUserIds: string[];
  paidByUserId: string;
  voiceTranscript?: string;
  photoRef?: string;
}

export interface SmartTransactionSummary {
  id: string;
  tripId: string;
  memberId: string;
  ledgerEntryId: string | null;
  amountLocal: number;
  currencyLocal: string;
  amountCny: number;
  exchangeRate: number;
  category: string;
  merchant: string | null;
  description: string | null;
  captureMethod: CaptureMethod;
  bucketAssignment: PsychologicalBucket;
  spendRationality: string | null;
  nudgesTriggered: MoneyNudge[];
  recordedAt: string;
}

export interface RecordTransactionResult {
  transaction: SmartTransactionSummary;
  ledgerEntryId: string;
  nudgesTriggered: MoneyNudge[];
  rebalanceSuggestionsCreated: number;
}

export interface BucketProgress {
  bucket: PsychologicalBucket;
  label: string;
  planned: number;
  actual: number;
  usagePercent: number;
  currency: string;
}

export interface MoneyDashboard {
  tripId: string;
  currency: string;
  dailyBudget: number | null;
  buckets: BucketProgress[];
  todaySpendCny: number;
  todayTransactions: SmartTransactionSummary[];
  pendingRebalanceCount: number;
}

export interface RebalanceProposal {
  fromBucket?: PsychologicalBucket;
  toBucket?: PsychologicalBucket;
  amount?: number;
  rationale: string;
  memberIds?: string[];
}

export interface RebalanceSuggestionSummary {
  id: string;
  tripId: string;
  scenario: RebalanceScenario;
  message: string;
  proposal: RebalanceProposal;
  status: string;
  createdAt: string;
}

export interface RespondRebalanceInput {
  response: RebalanceResponse;
}
