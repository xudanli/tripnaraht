/**
 * Loads trip decision state for monitoring poll → replanning trigger metadata.
 */

import { Injectable } from '@nestjs/common';
import { Rfc001DecisionLedgerStoreService } from '../../trips/guardian-decision-core/persistence/rfc001-decision-ledger.store';
import { Rfc001PlanVersionStoreService } from '../../trips/guardian-decision-core/plan-version/plan-version.store';
import type { CanonicalMonitoringPollKind } from '../contracts/decision-run-request';
import {
  deriveMonitoringReplanningSignals,
  monitoringSignalsToTriggerMetadata,
  type MonitoringPollResultHints,
} from './monitoring-replanning-context.util';

@Injectable()
export class MonitoringReplanningContextService {
  constructor(
    private readonly ledgerStore: Rfc001DecisionLedgerStoreService,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
  ) {}

  async buildPollMetadata(
    tripId: string,
    pollKind: CanonicalMonitoringPollKind,
    pollResult?: MonitoringPollResultHints,
  ): Promise<Record<string, unknown>> {
    const [decisions, effectivePlanVersionId] = await Promise.all([
      this.ledgerStore.listDecisions(tripId),
      this.planVersionStore.getEffectivePlanVersionId(tripId),
    ]);

    const signals = deriveMonitoringReplanningSignals({
      pollKind,
      decisions,
      hasEffectivePlanVersion: Boolean(effectivePlanVersionId),
      pollResult,
    });

    return monitoringSignalsToTriggerMetadata(signals);
  }
}
