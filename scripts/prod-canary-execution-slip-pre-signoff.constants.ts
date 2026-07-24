/**
 * Execution Slip Canary — locked identifiers (independent from Weather / Road canaries).
 */

/** DO NOT reuse Weather or Road canary trips. */
export const EXEC_SLIP_CANARY_TRIP_ID = 'c0c77777-7777-4777-8777-777777777777';
export const EXEC_SLIP_CANARY_USER_ID = 'c0c77777-7777-4777-8777-777777777701';
export const EXEC_SLIP_CANARY_EMAIL = 'exec-slip-canary@tripnara.dev';
export const EXEC_SLIP_CANARY_COLLABORATOR_ID = 'c0c77777-7777-4777-8777-777777777702';

export const EXEC_SLIP_CANARY_DAY_ID = 'c0c77777-7777-4777-8777-777777777601';
export const EXEC_SLIP_CANARY_ACTIVITY_A_ID = 'c0c77777-7777-4777-8777-777777777631';
export const EXEC_SLIP_CANARY_ACTIVITY_B_ID = 'c0c77777-7777-4777-8777-777777777632';
export const EXEC_SLIP_CANARY_ACTIVITY_C_ID = 'c0c77777-7777-4777-8777-777777777633';

export const EXEC_SLIP_CANARY_PLACE_A_ID = 777001;
export const EXEC_SLIP_CANARY_PLACE_B_ID = 777002;
export const EXEC_SLIP_CANARY_PLACE_C_ID = 777003;

/** Scenario A — infeasible: observed 13:35, ETA 16:18, lastEntryAt 16:00 */
export const EXEC_SLIP_SCENARIO_A_OBSERVED_AT = '2026-07-12T13:35:00.000Z';
export const EXEC_SLIP_SCENARIO_A_PLANNED_DEPART = '2026-07-12T13:00:00.000Z';

/** Scenario B — still feasible: projected ETA 15:45, lastEntryAt 16:00 */
export const EXEC_SLIP_SCENARIO_B_OBSERVED_AT = '2026-07-12T13:10:00.000Z';

export const EXEC_SLIP_REMAINING_STAY_MINUTES = 60;
export const EXEC_SLIP_TRAVEL_MINUTES = 103;

export const EXEC_SLIP_INITIAL_PLAN_ID = 'plan_1';
export const EXEC_SLIP_INITIAL_SNAPSHOT_REF = 'snap_exec_slip_canary_baseline';

export const EVIDENCE_LABEL = 'EXECUTION_SLIP_PROD_CANARY_ENGINEERING_EVIDENCE';
export const DRILL_STATUS = 'Execution Slip A/B/C Engineering Drill';
export const GO_STATUS = 'Slice 3 Production GO: NOT YET ELIGIBLE';

export const EVIDENCE_DIR = 'internal-docs/operations/evidence';
