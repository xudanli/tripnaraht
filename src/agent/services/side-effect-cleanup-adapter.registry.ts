import { Injectable } from '@nestjs/common';

export type CleanupPhase = 'START' | 'POLL';

export type CleanupResult =
  | { status: 'DONE' }
  | { status: 'PENDING' }
  | { status: 'FAILED'; last_error?: string | null };

export type SideEffectResourceRef = { type: string; id: string };
export type SideEffectProviderReference = { provider: string; reference_type: string; reference_id: string };

export type SideEffectLedgerLike = {
  handler_id: string;
  status: string;
  retry_count?: number;
  last_error?: string | null;
  resource_ref?: SideEffectResourceRef | null;
  provider_reference?: SideEffectProviderReference | null;
};

export interface SideEffectCleanupAdapter {
  /** Resource type, e.g. FINANCIAL_HOLD / PAYMENT / INVENTORY_FLIGHT / INVENTORY_HOTEL */
  readonly resource_type: string;
  /** Optional provider scope (e.g. 'stripe', 'amadeus'); if absent matches any provider */
  readonly provider?: string;
  cleanup: (args: {
    phase: CleanupPhase;
    resource_ref: SideEffectResourceRef;
    provider_reference?: SideEffectProviderReference | null;
    ledger_entry: SideEffectLedgerLike;
  }) => Promise<CleanupResult>;
}

@Injectable()
export class SideEffectCleanupAdapterRegistry {
  private readonly adapters: SideEffectCleanupAdapter[] = [];

  register(adapter: SideEffectCleanupAdapter): void {
    this.adapters.push(adapter);
  }

  find(resourceType: string, provider?: string | null): SideEffectCleanupAdapter | undefined {
    const rt = String(resourceType ?? '');
    const pv = provider != null ? String(provider) : null;
    return (
      this.adapters.find((a) => a.resource_type === rt && a.provider && pv && a.provider === pv) ??
      this.adapters.find((a) => a.resource_type === rt && !a.provider) ??
      undefined
    );
  }
}

