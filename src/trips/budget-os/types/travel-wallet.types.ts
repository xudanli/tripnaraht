/** L3 Travel Wallet types */

export type PaymentRuleMode =
  | 'split_aa'
  | 'one_pays'
  | 'by_category'
  | 'custom';

export interface CategoryPaymentRule {
  type: 'split_aa' | 'one_pays';
  userId?: string;
}

export interface PaymentRule {
  mode: PaymentRuleMode;
  defaultPayerId?: string | null;
  splitBase: number;
  categoryRules?: Record<string, CategoryPaymentRule> | null;
  /** Roster snapshot for budget tab display (same order as wallet.members). */
  members?: WalletMember[];
}

export interface WalletMember {
  userId: string;
  displayName: string;
  role?: 'leader' | 'member';
}

export interface LedgerEntry {
  id: string;
  tripId: string;
  sourceType: 'itinerary_item' | 'manual';
  sourceId: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  paidByUserId: string;
  splitAmongUserIds: string[];
  sharePerPerson: number;
  settled: boolean;
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TravelWallet {
  tripId: string;
  paymentRule: PaymentRule | null;
  members: WalletMember[];
  ledgerSummary: {
    totalPaid: number;
    totalShared: number;
    unsettledCount: number;
  };
  updatedAt: string;
}

export interface BalanceEdge {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
}

export interface WalletBalances {
  currency: string;
  edges: BalanceEdge[];
  netByUser: Record<string, number>;
}

export interface PutWalletRuleInput {
  mode: PaymentRuleMode;
  splitBase: number;
  defaultPayerId?: string | null;
  categoryRules?: Record<string, CategoryPaymentRule> | null;
}

export interface CreateManualLedgerInput {
  title: string;
  category: string;
  amount: number;
  currency?: string;
  paidByUserId: string;
  splitAmongUserIds: string[];
}

export interface PatchLedgerEntryInput {
  settled?: boolean;
  splitAmongUserIds?: string[];
}

export interface LedgerListResult {
  items: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface ItineraryCostLedgerInput {
  itemId: string;
  tripId: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  paidByUserId: string;
  splitAmongUserIds?: string[];
  autoLedger?: boolean;
  isPaid?: boolean;
}
