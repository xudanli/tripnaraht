"""
MOVE_DAY — multi-day assignment + per-day schedule (ADR-008 M2 / P4.a).

Shadow only. Enabled when OR_TOOLS_MOVE_DAY_SHADOW=1|true|on.
Layer A: greedy load rebalance (locality-capped).
Layer B: fixed-order schedule per day (reuse Routing schedule helpers).
nativeCpSat is always False.
"""

from __future__ import annotations

import os
import time
from copy import deepcopy

from routing_solver import (
    ENGINE_VERSION,
    _index_problem,
    _path_travel,
    _schedule_fixed_order,
)
from solver_models import (
    SolverCandidate,
    SolverCandidateDiffHint,
    SolverDayPlan,
    SolverMeta,
    SolverProblem,
    SolverResponse,
)


def is_move_day_enabled() -> bool:
    raw = (os.environ.get("OR_TOOLS_MOVE_DAY_SHADOW") or "").strip().lower()
    return raw in ("1", "true", "on", "yes")


def solve_move_day(problem: SolverProblem) -> SolverResponse:
    started = time.perf_counter()
    seed = problem.solverConfig.seed
    max_candidates = max(1, min(problem.solverConfig.maxCandidates, 3))

    if not is_move_day_enabled():
        return _error(
            problem,
            started,
            seed,
            "MOVE_DAY disabled; set OR_TOOLS_MOVE_DAY_SHADOW=1 (shadow only)",
        )

    day_ids = list(problem.scope.dayIds)
    if len(day_ids) < 2:
        return _error(
            problem,
            started,
            seed,
            "MOVE_DAY requires scope.dayIds length >= 2",
        )

    try:
        indexed = _index_problem(problem)
    except ValueError as exc:
        return _error(problem, started, seed, str(exc))

    depot_nid = indexed.node_ids[indexed.depot_index]
    anchors = {
        a.dayId: a.anchorNodeId for a in (problem.scope.dayAnchors or [])
    }
    capacities = {
        c.dayId: c for c in (problem.scope.dayCapacities or [])
    }

    # Base membership
    home: dict[str, str] = {}
    for n in problem.nodes:
        if n.nodeId == depot_nid:
            continue
        if n.assignedDayId and n.assignedDayId in day_ids:
            home[n.nodeId] = n.assignedDayId
        else:
            # deterministic fallback: hash into days
            home[n.nodeId] = day_ids[
                sum(ord(c) for c in n.nodeId) % len(day_ids)
            ]

    assignment = {d: [] for d in day_ids}  # type: dict[str, list[str]]
    for nid, day in home.items():
        assignment[day].append(nid)

    # Preserve matrix/input order within each day
    order_index = {nid: i for i, nid in enumerate(indexed.node_ids)}
    for d in day_ids:
        assignment[d].sort(key=lambda nid: order_index.get(nid, 0))

    max_moved = max(1, min(getattr(problem.solverConfig, "maxMovedActivities", 3), 3))
    variants = _rebalance_variants(
        assignment=assignment,
        home=home,
        problem=problem,
        day_ids=day_ids,
        capacities=capacities,
        max_moved=max_moved,
        max_variants=max_candidates,
    )

    candidates: list[SolverCandidate] = []
    for rank, (asg, moved) in enumerate(variants):
        day_plans: list[SolverDayPlan] = []
        total_travel = 0
        feasible = True
        for day_id in day_ids:
            visits = asg[day_id]
            anchor = anchors.get(day_id, depot_nid)
            if anchor not in indexed.node_ids:
                feasible = False
                break
            # day order: anchor then visits (skip if visit is anchor)
            seq_ids = [anchor] + [v for v in visits if v != anchor]
            # unique preserve order
            seen: set[str] = set()
            seq_ids = [x for x in seq_ids if not (x in seen or seen.add(x))]
            seq_idx = [indexed.node_ids.index(x) for x in seq_ids]
            starts = _schedule_fixed_order(indexed, seq_idx)
            if starts is None:
                feasible = False
                break
            total_travel += _path_travel(indexed, seq_idx)
            day_plans.append(
                SolverDayPlan(dayId=day_id, nodeIds=seq_ids, startMin=starts)
            )
        if not feasible or not day_plans:
            continue
        candidates.append(
            SolverCandidate(
                candidateId=f"{problem.requestId}:move_day:{rank}",
                operation="MOVE_DAY",
                label=f"move-day-rebalance-{rank}",
                dayPlans=day_plans,
                objectiveValue=float(total_travel),
                diffHint=SolverCandidateDiffHint(
                    movedDayPairs=moved or None,
                ),
            )
        )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    if candidates:
        status = "SOLVED"
        message = None
    elif elapsed_ms >= problem.solverConfig.timeLimitMs * 0.9:
        status = "TIMEOUT"
        message = "MOVE_DAY no feasible incumbent within time budget"
    else:
        status = "INFEASIBLE"
        message = "MOVE_DAY no feasible multi-day assignment"

    hard_ids = [c.constraintId for c in problem.constraints if c.hard]
    for cand in candidates:
        cand.satisfiedSolverConstraintIds = list(hard_ids)

    return SolverResponse(
        requestId=problem.requestId,
        status=status,
        candidates=candidates,
        solverMeta=SolverMeta(
            engine="OR_TOOLS_ROUTING",
            version=ENGINE_VERSION,
            strategy="MOVE_DAY_GREEDY_REBALANCE",
            nativeCpSat=False,
            seed=seed,
            elapsedMs=elapsed_ms,
        ),
        message=message,
    )


def _day_service_load(
    assignment: dict[str, list[str]], problem: SolverProblem, day_id: str
) -> int:
    by_id = {n.nodeId: n for n in problem.nodes}
    return sum(by_id[nid].serviceDurationMin for nid in assignment[day_id] if nid in by_id)


def _rebalance_variants(
    *,
    assignment: dict[str, list[str]],
    home: dict[str, str],
    problem: SolverProblem,
    day_ids: list[str],
    capacities: dict,
    max_moved: int,
    max_variants: int,
) -> list[tuple[dict[str, list[str]], list[dict[str, str]]]]:
    """Return (assignment, movedDayPairs) variants; first is optionally unchanged."""
    by_id = {n.nodeId: n for n in problem.nodes}
    out: list[tuple[dict[str, list[str]], list[dict[str, str]]]] = []

    # Variant 0: base assignment (no moves) — always useful if schedulable
    out.append((deepcopy(assignment), []))

    working = deepcopy(assignment)
    moved: list[dict[str, str]] = []

    for _ in range(max_moved):
        loads = {d: _day_service_load(working, problem, d) for d in day_ids}
        heavy = max(day_ids, key=lambda d: loads[d])
        light = min(day_ids, key=lambda d: loads[d])
        if heavy == light or loads[heavy] <= loads[light]:
            break

        # Pick a movable visit from heavy (prefer optional / canMoveDay, not booked)
        candidates_move = [
            nid
            for nid in working[heavy]
            if by_id[nid].canMoveDay
            and not by_id[nid].isBooked
            and home.get(nid) is not None
        ]
        # Prefer moving nodes whose home is already light (return), else any
        candidates_move.sort(
            key=lambda nid: (
                0 if home.get(nid) == light else 1,
                -by_id[nid].serviceDurationMin,
            )
        )
        if not candidates_move:
            break
        pick = candidates_move[0]

        # Capacity check on light
        cap = capacities.get(light)
        if cap is not None:
            if cap.maxActivities is not None and len(working[light]) + 1 > cap.maxActivities:
                break
            if cap.maxServiceMin is not None:
                nxt = loads[light] + by_id[pick].serviceDurationMin
                if nxt > cap.maxServiceMin:
                    break

        working[heavy] = [x for x in working[heavy] if x != pick]
        working[light].append(pick)
        working[light].sort(
            key=lambda nid: next(
                i for i, n in enumerate(problem.nodes) if n.nodeId == nid
            )
        )
        moved.append(
            {"nodeId": pick, "fromDayId": heavy, "toDayId": light}
        )
        out.append((deepcopy(working), list(moved)))
        if len(out) >= max_variants:
            break

    # Deduplicate by membership signature
    uniq: list[tuple[dict[str, list[str]], list[dict[str, str]]]] = []
    seen: set[tuple] = set()
    for asg, mv in out:
        sig = tuple((d, tuple(asg[d])) for d in day_ids)
        if sig in seen:
            continue
        seen.add(sig)
        uniq.append((asg, mv))
    return uniq[:max_variants]


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
            version=ENGINE_VERSION,
            strategy="MOVE_DAY_DISABLED",
            nativeCpSat=False,
            seed=seed,
            elapsedMs=elapsed_ms,
        ),
        message=message,
    )
