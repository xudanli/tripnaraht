/**
 * Shared hard-constraint fixture for AU-P1-007 orchestration mode safety parity.
 * Iceland F208 road closure — same scenario across CLAUDE_SM / CLAUDE_DYNAMIC / LEGACY.
 */

export type HardConstraintEvaluationBlock = {
  evaluationId: string;
  verdict: 'PASS' | 'WARN' | 'BLOCK';
  hardConstraintViolations: string[];
};

export type HardConstraintParityFixtureV1 = {
  fixtureId: string;
  tripId: string;
  roadSegmentId: string;
  clientTripVersion: number;
  constraintEvaluation: HardConstraintEvaluationBlock;
};

export const ICELAND_F208_ROAD_CLOSE_PARITY_FIXTURE: HardConstraintParityFixtureV1 = {
  fixtureId: 'iceland_f208_road_close_v1',
  tripId: 'trip_iceland_harness',
  roadSegmentId: 'F208',
  clientTripVersion: 17,
  constraintEvaluation: {
    evaluationId: 'eval_f208_road_close_harness',
    verdict: 'BLOCK',
    hardConstraintViolations: ['ROAD_SEGMENT_CLOSED'],
  },
};
