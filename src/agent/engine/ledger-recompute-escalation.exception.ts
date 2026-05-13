import type { ReconcileResultV1 } from '../memory/decision-ledger/incremental-recompute-orchestrator.types';

/** 阻塞式账本调解未收敛或触发硬约束熔断时抛出，供网关中断 route_and_run */
export class LedgerRecomputeEscalationException extends Error {
  readonly result: ReconcileResultV1;

  constructor(result: ReconcileResultV1) {
    super(`ledger_reconcile:${result.status}${result.reason ? `:${result.reason}` : ''}`);
    this.name = 'LedgerRecomputeEscalationException';
    this.result = result;
  }
}
