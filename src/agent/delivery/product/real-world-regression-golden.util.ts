/**
 * Real-world Regression Golden — 来自真实 Trip Incident，挂六 Journey 验收。
 */

import type { V1JourneyId } from './v1-journey-contract.util';

export const REAL_WORLD_REGRESSION_GOLDEN_SCHEMA =
  'nara.real_world_regression_golden@v1' as const;

export type RealWorldRegressionGoldenV1 = {
  schemaId: typeof REAL_WORLD_REGRESSION_GOLDEN_SCHEMA;
  version: 1;
  goldenId: string;
  tripId: string;
  journeyId: V1JourneyId;
  incidentId: string;
  titleZh: string;
  mandatory: boolean;
  lastRunStatus: 'PENDING' | 'PASS' | 'FAIL';
  architectureFreeze: true;
};

export function createRealWorldRegressionGolden(input: {
  goldenId: string;
  tripId: string;
  journeyId: V1JourneyId;
  incidentId: string;
  titleZh: string;
  mandatory: boolean;
}): RealWorldRegressionGoldenV1 {
  return {
    schemaId: REAL_WORLD_REGRESSION_GOLDEN_SCHEMA,
    version: 1,
    goldenId: input.goldenId,
    tripId: input.tripId,
    journeyId: input.journeyId,
    incidentId: input.incidentId,
    titleZh: input.titleZh,
    mandatory: input.mandatory,
    lastRunStatus: 'PENDING',
    architectureFreeze: true,
  };
}

export function markRegressionRun(
  golden: RealWorldRegressionGoldenV1,
  status: 'PASS' | 'FAIL',
): RealWorldRegressionGoldenV1 {
  return { ...golden, lastRunStatus: status };
}
