/** Team Ledger (团队账本) — Team Hub 预算 Tab */

export const LEDGER_EXPENSE_STATUSES = ['pending', 'settled'] as const;
export type LedgerExpenseStatus = (typeof LEDGER_EXPENSE_STATUSES)[number];

export const LEDGER_TRANSFER_STATUSES = ['pending', 'settled'] as const;
export type LedgerTransferStatus = (typeof LEDGER_TRANSFER_STATUSES)[number];

export interface TeamLedgerMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  participatesInSplit: boolean;
}

export interface TeamLedgerExpense {
  id: string;
  tripId: string;
  title: string;
  payer: TeamLedgerMember;
  amountCents: number;
  currency: string;
  occurredAt: string;
  status: LedgerExpenseStatus;
  splitMemberIds: string[];
  splitMembers: TeamLedgerMember[];
  /** 关联行程活动；活动详情「团队账本」据此回显；可空 */
  itineraryItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamLedgerOverviewSummary {
  totalSpentCents: number;
  averagePerPersonCents: number;
  pendingSettlementCents: number;
  recordCount: number;
  currency: string;
}

export interface TeamLedgerOverview {
  summary: TeamLedgerOverviewSummary;
  members: TeamLedgerMember[];
  recentExpenses: TeamLedgerExpense[];
}

export interface TeamLedgerTransfer {
  id: string;
  from: TeamLedgerMember;
  to: TeamLedgerMember;
  amountCents: number;
  status: LedgerTransferStatus;
}

export interface TeamLedgerSettlement {
  pendingTotalCents: number;
  involvedCount: number;
  autoOffsetLabel: string;
  tipMessage: string;
  currency: string;
  transfers: TeamLedgerTransfer[];
  settledCount: number;
  pendingCount: number;
}

export interface TeamLedgerNotifyResult {
  notifiedMemberIds: string[];
  sentAt: string;
}

export interface TeamLedgerTransferConfirmResult {
  transfer: TeamLedgerTransfer;
  confirmedAt: string;
}

export interface PendingExpenseForSettlement {
  amountCents: number;
  payerMemberId: string;
  splitMemberIds: string[];
}
