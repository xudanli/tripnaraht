export type BudgetConstraintStatus = 'confirmed' | 'need_confirm' | 'missing';

/** FE 约束卡片统一四态（§11.2） */
export type ConstraintFieldStatus =
  | 'confirmed'
  | 'need_confirm'
  | 'misaligned'
  | 'missing';

export type ConstraintsPendingKey = 'budget' | 'travelers' | 'transport' | 'time_range';

export interface ConstraintsSummaryResponse {
  tripId: string;
  constraintsVersion: number;
  confirmedAt: string | null;
  confirmedBy: string | null;
  /** confirmedAt 存在且 allReady */
  isUserConfirmed: boolean;
  /** version 快照与 confirmedVersion 一致 */
  isVersionConfirmed: boolean;
  allReady: boolean;
  pendingCount: number;
  timeRange: {
    startDate: string | null;
    endDate: string | null;
    dayCount: number;
    status: 'confirmed' | 'missing';
  };
  budget: {
    total: number | null;
    currency: string;
    gateStatus?: 'ALLOW' | 'NEED_CONFIRM' | 'NEED_ADJUST' | 'REJECT' | null;
    status: BudgetConstraintStatus;
  };
  travelers: {
    count: number;
    memberCount: number;
    profilingCompletedCount: number;
    status: ConstraintFieldStatus;
  };
  transport: {
    travelMode: string | null;
    transportHint: string | null;
    sampleSegment?: {
      duration: number | null;
      distance: number | null;
      travelMode: string | null;
      fromPlace?: string;
      toPlace?: string;
    };
    status: ConstraintFieldStatus;
  };
  pendingItems: Array<{
    key: ConstraintsPendingKey;
    status: 'need_confirm' | 'misaligned' | 'missing';
    label: string;
    deepLink: string;
  }>;
}

export interface ConfirmConstraintsBodyDto {
  constraintsVersion?: number;
}

export interface ConfirmConstraintsResponse {
  constraintsConfirmedAt: string;
  constraintsConfirmedBy: string;
  constraintsVersion: number;
  isUserConfirmed: boolean;
}

export interface ConstraintsMetaInWriteResponse {
  constraintsVersion: number;
  constraintsConfirmedAt: null;
  constraintsConfirmedBy: null;
}
