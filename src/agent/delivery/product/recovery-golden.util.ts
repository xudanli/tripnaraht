/**
 * Recovery Golden — 失败可恢复；作为 Release 证据的一部分。
 */

import type { V1JourneyId } from './v1-journey-contract.util';

export const RECOVERY_GOLDEN_SCHEMA = 'nara.recovery_golden@v1' as const;

export type RecoveryGoldenV1 = {
  schemaId: typeof RECOVERY_GOLDEN_SCHEMA;
  version: 1;
  goldenId: string;
  tripId: string;
  journeyId: V1JourneyId;
  failureModeZh: string;
  recoveryPathZh: string;
  recovered: boolean;
  dataLoss: boolean;
  unauthorizedMutationDuringRecovery: boolean;
  lastRunStatus: 'PENDING' | 'PASS' | 'FAIL';
};

export function createRecoveryGolden(input: {
  goldenId: string;
  tripId: string;
  journeyId: V1JourneyId;
  failureModeZh: string;
  recoveryPathZh: string;
}): RecoveryGoldenV1 {
  return {
    schemaId: RECOVERY_GOLDEN_SCHEMA,
    version: 1,
    goldenId: input.goldenId,
    tripId: input.tripId,
    journeyId: input.journeyId,
    failureModeZh: input.failureModeZh,
    recoveryPathZh: input.recoveryPathZh,
    recovered: false,
    dataLoss: false,
    unauthorizedMutationDuringRecovery: false,
    lastRunStatus: 'PENDING',
  };
}

export function evaluateRecoveryGolden(input: {
  golden: RecoveryGoldenV1;
  recovered: boolean;
  dataLoss: boolean;
  unauthorizedMutationDuringRecovery: boolean;
}): RecoveryGoldenV1 {
  const passed =
    input.recovered &&
    !input.dataLoss &&
    !input.unauthorizedMutationDuringRecovery;
  return {
    ...input.golden,
    recovered: input.recovered,
    dataLoss: input.dataLoss,
    unauthorizedMutationDuringRecovery:
      input.unauthorizedMutationDuringRecovery,
    lastRunStatus: passed ? 'PASS' : 'FAIL',
  };
}
