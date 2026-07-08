/**
 * Enumerative lexicographic candidate selection (cp-sat-lex-v1).
 *
 * Selects one pre-built full-plan candidate via staged lex optimization.
 * NOT POI-level native CP-SAT. See solver-capability.constants.ts.
 */

import {
  pickLexicographicWinner,
  rankCandidatesLexicographic,
} from '../lexicographic-rank.util';
import { ObjectiveSemanticsRegistry } from '../../objectives/objective-semantics.registry';
import type {
  CpSatLexCandidateEval,
  CpSatLexSolveInput,
  CpSatLexSolveResult,
  CpSatSolverEngineId,
  LexicographicStageTrace,
} from './cp-sat-engine.types';
import { resolveCpSatSolverEngine } from './cp-sat-engine.resolver';

const EPS = 1e-9;

export function solveLexicographicCpSat(
  input: CpSatLexSolveInput,
  engineId: CpSatSolverEngineId = resolveCpSatSolverEngine(),
): CpSatLexSolveResult {
  const started = Date.now();
  const deadline = started + input.timeLimitMs;

  if (engineId === 'lex-rank-v0') {
    return solveViaLexRankV0(input, started, deadline);
  }

  return solveViaCpSatLexV1(input, started, deadline);
}

export function buildCandidateEvaluations(input: {
  candidates: CpSatLexSolveInput['candidates'];
  enabledObjectives: CpSatLexSolveInput['enabledObjectives'];
  registry: ObjectiveSemanticsRegistry;
}): CpSatLexCandidateEval[] {
  const semantics = input.registry
    .list()
    .filter((s) => input.enabledObjectives.includes(s.objectiveId));

  return input.candidates.map((candidate) => {
    const evaluations = input.registry.evaluatePlan({
      plan: candidate.plan,
      utilityHint: candidate.utilityHint,
      enabledObjectives: semantics.map((s) => s.objectiveId),
    });
    const evalById = new Map(evaluations.map((e) => [e.objectiveId, e.normalizedValue]));

    const objectives = semantics.map((sem) => ({
      objectiveId: sem.objectiveId,
      layer: sem.tier as 'L2' | 'L3' | 'L4',
      direction: sem.direction,
      normalizedValue: evalById.get(sem.objectiveId) ?? 0,
    }));

    return {
      candidateId: candidate.candidateId,
      objectives,
      utilityHint: candidate.utilityHint ?? 0,
    };
  });
}

function solveViaCpSatLexV1(
  input: CpSatLexSolveInput,
  started: number,
  deadline: number,
): CpSatLexSolveResult {
  if (input.candidateEvaluations.length === 0) {
    return emptyResult('cp-sat-lex-v1', started);
  }

  const objectiveOrder = flattenObjectiveOrder(input.candidateEvaluations[0]!.objectives);
  let remaining = new Set(input.candidateEvaluations.map((c) => c.candidateId));
  const stageTraces: LexicographicStageTrace[] = [];
  let timedOut = false;

  for (let stageIndex = 0; stageIndex < objectiveOrder.length; stageIndex += 1) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }

    const spec = objectiveOrder[stageIndex]!;
    const remainingEvals = input.candidateEvaluations.filter((c) =>
      remaining.has(c.candidateId),
    );
    if (remainingEvals.length <= 1) break;

    const objectiveValues: Record<string, number> = {};
    for (const ev of remainingEvals) {
      const cell = ev.objectives.find((o) => o.objectiveId === spec.objectiveId);
      objectiveValues[ev.candidateId] = cell?.normalizedValue ?? 0;
    }

    const bestValue = Math.max(...Object.values(objectiveValues));
    const nextRemaining = new Set<string>();
    const eliminated: string[] = [];

    for (const ev of remainingEvals) {
      const v = objectiveValues[ev.candidateId] ?? 0;
      if (v >= bestValue - EPS) nextRemaining.add(ev.candidateId);
      else eliminated.push(ev.candidateId);
    }

    stageTraces.push({
      stageIndex,
      layer: spec.layer,
      objectiveId: spec.objectiveId,
      direction: spec.direction,
      inputCandidateIds: remainingEvals.map((c) => c.candidateId),
      objectiveValues,
      bestValue,
      fixedBound: bestValue,
      eliminatedCandidateIds: eliminated,
      remainingCandidateIds: [...nextRemaining],
    });

    remaining = nextRemaining;
  }

  const ranked = rankRemaining(input.candidateEvaluations, remaining, timedOut);
  const tieBreakUsed =
    remaining.size > 1 ||
    (ranked.length > 1 &&
      input.candidateEvaluations.filter((c) => c.candidateId === ranked[0]).length > 0 &&
      remaining.size === 1 &&
      input.candidateEvaluations.some(
        (c) =>
          c.candidateId !== ranked[0] &&
          remaining.has(c.candidateId) === false &&
          c.utilityHint !== (input.candidateEvaluations.find((x) => x.candidateId === ranked[0])?.utilityHint ?? 0),
      ));

  return {
    engineId: 'cp-sat-lex-v1',
    winnerId: ranked[0],
    rankedCandidateIds: ranked,
    stageTraces,
    timedOut,
    elapsedMs: Date.now() - started,
    incumbentFound: ranked[0] != null,
    tieBreakUsed: tieBreakUsed && ranked.length > 0,
  };
}

function flattenObjectiveOrder(
  objectives: CpSatLexCandidateEval['objectives'],
): CpSatLexCandidateEval['objectives'] {
  const tiers = ['L2', 'L3', 'L4'] as const;
  const ordered: CpSatLexCandidateEval['objectives'] = [];
  for (const tier of tiers) {
    for (const obj of objectives.filter((o) => o.layer === tier)) {
      ordered.push(obj);
    }
  }
  return ordered;
}

function rankRemaining(
  evaluations: CpSatLexCandidateEval[],
  remaining: Set<string>,
  timedOut: boolean,
): string[] {
  const pool = evaluations.filter((c) => remaining.has(c.candidateId));
  if (pool.length === 0) {
    return evaluations
      .slice()
      .sort((a, b) => b.utilityHint - a.utilityHint)
      .map((c) => c.candidateId);
  }

  return pool
    .slice()
    .sort((a, b) => {
      const lex = compareEvaluations(a, b);
      if (lex !== 0) return lex;
      void timedOut;
      return b.utilityHint - a.utilityHint;
    })
    .map((c) => c.candidateId);
}

function compareEvaluations(a: CpSatLexCandidateEval, b: CpSatLexCandidateEval): number {
  const len = Math.max(a.objectives.length, b.objectives.length);
  for (let i = 0; i < len; i++) {
    const av = a.objectives[i]?.normalizedValue ?? 0;
    const bv = b.objectives[i]?.normalizedValue ?? 0;
    const diff = bv - av;
    if (Math.abs(diff) > EPS) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function solveViaLexRankV0(
  input: CpSatLexSolveInput,
  started: number,
  deadline: number,
): CpSatLexSolveResult {
  const registry = new ObjectiveSemanticsRegistry();
  const ranked = rankCandidatesLexicographic({
    candidates: input.candidates,
    enabledObjectives: input.enabledObjectives,
    registry,
  });
  const timedOut = Date.now() >= deadline;

  return {
    engineId: 'lex-rank-v0',
    winnerId: pickLexicographicWinner(ranked),
    rankedCandidateIds: ranked.map((r) => r.candidateId),
    stageTraces: [],
    timedOut,
    elapsedMs: Date.now() - started,
    incumbentFound: ranked.length > 0,
    tieBreakUsed: false,
  };
}

function emptyResult(
  engineId: CpSatSolverEngineId,
  started: number,
): CpSatLexSolveResult {
  return {
    engineId,
    rankedCandidateIds: [],
    stageTraces: [],
    timedOut: false,
    elapsedMs: Date.now() - started,
    incumbentFound: false,
    tieBreakUsed: false,
  };
}
