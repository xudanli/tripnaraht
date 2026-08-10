/**
 * LightweightTripLookupHost 工厂（从 ClaudeOrchestrator 迁出）。
 */

import type { LightweightTripLookupHost } from './lightweight-path.host';

export type LightweightTripLookupHostFactorySource = {
  logger: LightweightTripLookupHost['logger'];
  tripsService?: {
    findOne(
      tripId: string,
      userId?: string,
    ): Promise<unknown>;
  };
};

export function createLightweightTripLookupHost(
  svc: LightweightTripLookupHostFactorySource,
): LightweightTripLookupHost {
  return {
    logger: svc.logger,
    findTripForLightweight: svc.tripsService
      ? (tripId, userId) =>
          svc.tripsService!.findOne(tripId, userId) as ReturnType<
            NonNullable<LightweightTripLookupHost['findTripForLightweight']>
          >
      : undefined,
  };
}
