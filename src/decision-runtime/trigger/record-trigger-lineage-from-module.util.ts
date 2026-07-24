/**
 * Lazy gateway resolution — avoids static imports from HTTP controllers into decision-runtime.
 */

import type { ModuleRef } from '@nestjs/core';
import type {
  DecisionRunDispatchResult,
  DecisionRunRequest,
} from '../contracts/decision-run-request';
import {
  dispatchUserIntentIfEnabled,
  dispatchManualRepairIfEnabled,
  recordManualRepairLineageIfEnabled,
  recordUserIntentLineageIfEnabled,
} from './record-trigger-lineage.util';

function resolveTriggerGateway(moduleRef: ModuleRef): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DecisionTriggerGatewayService } = require('./decision-trigger.gateway.service') as {
      DecisionTriggerGatewayService: new (...args: never[]) => unknown;
    };
    return moduleRef.get(DecisionTriggerGatewayService, { strict: false });
  } catch {
    return undefined;
  }
}

type UserIntentParams = Parameters<typeof recordUserIntentLineageIfEnabled>[1];

export function recordUserIntentLineageFromModule(
  moduleRef: ModuleRef,
  params: UserIntentParams,
): DecisionRunRequest | undefined {
  return recordUserIntentLineageIfEnabled(
    resolveTriggerGateway(moduleRef) as Parameters<typeof recordUserIntentLineageIfEnabled>[0],
    params,
  );
}

/** P4 production transition — full Gateway dispatch when enabled, else lineage-only fallback. */
export async function dispatchUserIntentFromModule(
  moduleRef: ModuleRef,
  params: UserIntentParams,
): Promise<DecisionRunDispatchResult | DecisionRunRequest | undefined> {
  return dispatchUserIntentIfEnabled(
    resolveTriggerGateway(moduleRef) as Parameters<typeof dispatchUserIntentIfEnabled>[0],
    params,
  );
}

export function recordManualRepairLineageFromModule(
  moduleRef: ModuleRef,
  params: Parameters<typeof recordManualRepairLineageIfEnabled>[1],
): DecisionRunRequest | undefined {
  return recordManualRepairLineageIfEnabled(
    resolveTriggerGateway(moduleRef) as Parameters<typeof recordManualRepairLineageIfEnabled>[0],
    params,
  );
}

/** P4 production transition — full Gateway dispatch when enabled, else lineage-only fallback. */
export async function dispatchManualRepairFromModule(
  moduleRef: ModuleRef,
  params: Parameters<typeof dispatchManualRepairIfEnabled>[1],
): Promise<DecisionRunDispatchResult | DecisionRunRequest | undefined> {
  return dispatchManualRepairIfEnabled(
    resolveTriggerGateway(moduleRef) as Parameters<typeof dispatchManualRepairIfEnabled>[0],
    params,
  );
}
