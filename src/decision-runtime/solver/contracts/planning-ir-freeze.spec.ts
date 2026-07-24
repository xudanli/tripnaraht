/**
 * S4.5 / M1.5 Planning IR Freeze pins (Nest side).
 * @see ../PLANNING_IR_FREEZE.md
 */

import {
  SOLVER_MVP_OPERATIONS,
  SOLVER_PROBLEM_SCHEMA_ID,
  SOLVER_RESPONSE_SCHEMA_ID,
  type SolverConstraintKind,
  type SolverEngine,
  type SolverObjectiveKind,
  type SolverProblem,
  type SolverRepairOperation,
  type SolverResponse,
} from './index';

const CONSTRAINT_KINDS: SolverConstraintKind[] = [
  'TIME_WINDOW',
  'FIXED_START',
  'BOOKED_PIN',
  'EDGE_FORBIDDEN',
  'MAX_DAY_DRIVE_MIN',
  'DEPOT_FIXED',
  'REPLACE_POOL',
];

const OBJECTIVE_KINDS: SolverObjectiveKind[] = [
  'MINIMIZE_TRAVEL',
  'MINIMIZE_LATENESS',
  'MAXIMIZE_PRESERVE_BASE',
  'MINIMIZE_CHANGES',
];

describe('Planning IR Freeze (S4.5 / M1.5)', () => {
  it('pins frozen schemaIds', () => {
    expect(SOLVER_PROBLEM_SCHEMA_ID).toBe('tripnara.solver_problem@v1');
    expect(SOLVER_RESPONSE_SCHEMA_ID).toBe('tripnara.solver_response@v1');
  });

  it('pins MVP ops and keeps MOVE_DAY reserved', () => {
    expect([...SOLVER_MVP_OPERATIONS]).toEqual([
      'SHIFT',
      'SWAP',
      'REROUTE',
      'SHORTEN',
      'REPLACE',
    ]);
    const reserved: SolverRepairOperation = 'MOVE_DAY';
    expect(SOLVER_MVP_OPERATIONS.includes(reserved)).toBe(false);
  });

  it('keeps constraint / objective kind catalogs stable', () => {
    expect(CONSTRAINT_KINDS).toHaveLength(7);
    expect(OBJECTIVE_KINDS).toHaveLength(4);
    expect(CONSTRAINT_KINDS).toContain('EDGE_FORBIDDEN');
    expect(CONSTRAINT_KINDS).toContain('REPLACE_POOL');
    expect(OBJECTIVE_KINDS).toContain('MINIMIZE_TRAVEL');
  });

  it('types a minimal SolverProblem / SolverResponse under freeze', () => {
    const problem: SolverProblem = {
      schemaId: SOLVER_PROBLEM_SCHEMA_ID,
      requestId: 'ir-freeze',
      tripId: 't1',
      planVersionId: 'pv1',
      operation: 'REROUTE',
      scope: { dayIds: ['day-1'] },
      nodes: [
        {
          nodeId: 'depot',
          serviceDurationMin: 0,
          timeWindows: [{ startMin: 480, endMin: 480 }],
          isMandatory: true,
          isBooked: true,
          canRemove: false,
          canMoveDay: false,
        },
      ],
      travelMatrix: { nodeIds: ['depot'], costsMin: [[0]] },
      constraints: [
        {
          constraintId: 'depot-fixed',
          kind: 'DEPOT_FIXED',
          hard: true,
          payload: { nodeId: 'depot' },
        },
      ],
      objectives: [
        {
          objectiveId: 'min-travel',
          kind: 'MINIMIZE_TRAVEL',
          weight: 1,
        },
      ],
      solverConfig: { maxCandidates: 3, timeLimitMs: 1500, seed: 42 },
    };
    const engine: SolverEngine = 'OR_TOOLS_ROUTING';
    const response: SolverResponse = {
      schemaId: SOLVER_RESPONSE_SCHEMA_ID,
      requestId: problem.requestId,
      status: 'SOLVED',
      candidates: [],
      solverMeta: {
        engine,
        version: 'freeze-test',
        strategy: 'routing',
        nativeCpSat: false,
        seed: 42,
        elapsedMs: 1,
      },
    };
    expect(problem.schemaId).toBe(SOLVER_PROBLEM_SCHEMA_ID);
    expect(response.solverMeta.nativeCpSat).toBe(false);
  });
});
