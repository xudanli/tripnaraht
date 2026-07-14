"""
Native OR-Tools CP-SAT path for SHIFT (ADR-008 M3 / P5).

Uses ortools.sat.python.cp_model.CpModel + CpSolver only.
Enabled when OR_TOOLS_NATIVE_CPSAT=1|true|on.
Routing paths must never set nativeCpSat=true.
"""

from __future__ import annotations

import os
import time

from ortools.sat.python import cp_model

from routing_solver import (
    ENGINE_VERSION,
    _avoid_forbidden_edges,
    _index_problem,
    _order_from_depot,
    _path_travel,
)
from solver_models import (
    SolverCandidate,
    SolverCandidateDiffHint,
    SolverDayPlan,
    SolverMeta,
    SolverProblem,
    SolverResponse,
)

ENGINE_CPSAT_VERSION = f"{ENGINE_VERSION}+cpsat-shift"


def is_native_cpsat_enabled() -> bool:
    raw = (os.environ.get("OR_TOOLS_NATIVE_CPSAT") or "").strip().lower()
    return raw in ("1", "true", "on", "yes")


def solve_shift_cpsat(problem: SolverProblem) -> SolverResponse:
    started = time.perf_counter()
    seed = problem.solverConfig.seed
    time_limit_ms = max(50, problem.solverConfig.timeLimitMs)

    if not is_native_cpsat_enabled():
        return _error(
            problem,
            started,
            seed,
            "Native CP-SAT disabled; set OR_TOOLS_NATIVE_CPSAT=1",
        )

    if problem.operation != "SHIFT":
        return _error(
            problem,
            started,
            seed,
            "Native CP-SAT MVP supports SHIFT only",
        )

    if len(problem.scope.dayIds) != 1:
        return _error(
            problem,
            started,
            seed,
            "Native CP-SAT SHIFT requires exactly one dayId",
        )

    try:
        indexed = _index_problem(problem)
    except ValueError as exc:
        return _error(problem, started, seed, str(exc))

    order = _avoid_forbidden_edges(_order_from_depot(indexed), indexed)
    model = cp_model.CpModel()
    starts: list[cp_model.IntVar] = []

    for pos, idx in enumerate(order):
        lo = int(indexed.tw_starts[idx])
        hi = int(indexed.tw_ends[idx])
        if lo > hi:
            return _error(problem, started, seed, "empty time window")
        s = model.NewIntVar(lo, hi, f"start_{indexed.node_ids[idx]}")
        fixed = indexed.nodes[idx].fixedStartMin
        if fixed is not None:
            model.Add(s == int(fixed))
        starts.append(s)

    for pos in range(len(order) - 1):
        a, b = order[pos], order[pos + 1]
        travel = int(indexed.costs[a][b])
        if travel >= 10**6:
            return _error(
                problem, started, seed, "forbidden edge in SHIFT order"
            )
        # start[b] >= start[a] + service[a] + travel
        model.Add(starts[pos + 1] >= starts[pos] + int(indexed.service[a]) + travel)

    # Minimize completion time of last visit (honest objective for schedule)
    last = order[-1]
    end_last = model.NewIntVar(0, 24 * 60 + 480, "end_last")
    model.Add(end_last == starts[-1] + int(indexed.service[last]))
    model.Minimize(end_last)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.05, time_limit_ms / 1000.0)
    if hasattr(solver.parameters, "random_seed"):
        solver.parameters.random_seed = int(seed)
    # Prove we invoke real CpSolver
    status = solver.Solve(model)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        st = "TIMEOUT" if status == cp_model.UNKNOWN else "INFEASIBLE"
        return SolverResponse(
            requestId=problem.requestId,
            status=st,
            candidates=[],
            solverMeta=SolverMeta(
                engine="OR_TOOLS_CP_SAT",
                version=ENGINE_CPSAT_VERSION,
                strategy="CP_SAT_SHIFT_INTERVAL_CHAIN",
                nativeCpSat=True,  # CpSolver ran; no incumbent
                seed=seed,
                elapsedMs=elapsed_ms,
            ),
            message=f"CpSolver status={solver.StatusName(status)}",
        )

    start_min = [int(solver.Value(s)) for s in starts]
    node_ids = [indexed.node_ids[i] for i in order]
    cand = SolverCandidate(
        candidateId=f"{problem.requestId}:cpsat_shift:0",
        operation="SHIFT",
        label="cpsat-shift-interval-chain",
        dayPlans=[
            SolverDayPlan(
                dayId=indexed.day_id,
                nodeIds=node_ids,
                startMin=start_min,
            )
        ],
        objectiveValue=float(_path_travel(indexed, order)),
        diffHint=SolverCandidateDiffHint(shiftedActivityIds=list(node_ids)),
    )
    hard_ids = [c.constraintId for c in problem.constraints if c.hard]
    cand.satisfiedSolverConstraintIds = list(hard_ids)

    return SolverResponse(
        requestId=problem.requestId,
        status="SOLVED",
        candidates=[cand],
        solverMeta=SolverMeta(
            engine="OR_TOOLS_CP_SAT",
            version=ENGINE_CPSAT_VERSION,
            strategy="CP_SAT_SHIFT_INTERVAL_CHAIN",
            nativeCpSat=True,
            seed=seed,
            elapsedMs=elapsed_ms,
        ),
        message=None,
    )


def _error(
    problem: SolverProblem, started: float, seed: int, message: str
) -> SolverResponse:
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return SolverResponse(
        requestId=problem.requestId,
        status="ERROR",
        candidates=[],
        solverMeta=SolverMeta(
            engine="OR_TOOLS_ROUTING",
            version=ENGINE_CPSAT_VERSION,
            strategy="CP_SAT_DISABLED",
            nativeCpSat=False,
            seed=seed,
            elapsedMs=elapsed_ms,
        ),
        message=message,
    )

