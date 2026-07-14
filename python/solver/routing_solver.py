"""
Single-day SHIFT / SWAP via OR-Tools RoutingModel + Time Dimension.

ADR-008 S1: non-authoritative candidate generation only.
nativeCpSat is always False for this engine.
"""

from __future__ import annotations

import time
from typing import Optional

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from solver_models import (
    MVP_OPERATIONS,
    OptimizationNode,
    SolverCandidate,
    SolverCandidateDiffHint,
    SolverDayPlan,
    SolverMeta,
    SolverProblem,
    SolverResponse,
)

ENGINE_VERSION = "0.1.0-routing-s1"
DAY_HORIZON_MIN = 24 * 60


def solve(problem: SolverProblem) -> SolverResponse:
    started = time.perf_counter()
    seed = problem.solverConfig.seed
    max_candidates = max(1, min(problem.solverConfig.maxCandidates, 3))
    time_limit_ms = max(50, problem.solverConfig.timeLimitMs)

    # M2 / P4.a — MOVE_DAY behind OR_TOOLS_MOVE_DAY_SHADOW (never single-day spoof)
    if problem.operation == "MOVE_DAY":
        from move_day_solver import solve_move_day

        return solve_move_day(problem)

    # M3 / P5 — native CP-SAT SHIFT only (never Routing with nativeCpSat=true)
    if problem.operation == "SHIFT":
        from cp_sat_shift_solver import is_native_cpsat_enabled, solve_shift_cpsat

        if is_native_cpsat_enabled():
            return solve_shift_cpsat(problem)

    if problem.operation not in MVP_OPERATIONS:
        return _error(
            problem,
            started,
            seed,
            "ERROR",
            f"operation {problem.operation} not enabled (MVP: SHIFT/SWAP/REROUTE/SHORTEN/REPLACE)",
        )

    if len(problem.scope.dayIds) != 1:
        return _error(
            problem,
            started,
            seed,
            "ERROR",
            "S1 supports exactly one dayId in scope",
        )

    if len(problem.nodes) < 2:
        return _error(
            problem, started, seed, "INFEASIBLE", "need at least 2 nodes (depot + visit)"
        )

    try:
        indexed = _index_problem(problem)
    except ValueError as exc:
        return _error(problem, started, seed, "ERROR", str(exc))

    try:
        if problem.operation == "SHIFT":
            candidates = _solve_shift(problem, indexed, max_candidates)
        elif problem.operation == "SHORTEN":
            from local_repair_ops import solve_shorten

            candidates = solve_shorten(problem, indexed, max_candidates)
        elif problem.operation == "REPLACE":
            from local_repair_ops import solve_replace

            candidates = solve_replace(problem, indexed, max_candidates)
        else:
            # SWAP and REROUTE share RoutingModel; REROUTE labels emphasize DETOUR
            candidates = _solve_swap(
                problem, indexed, time_limit_ms, seed, max_candidates
            )
            if problem.operation == "REROUTE":
                for c in candidates:
                    c.operation = "REROUTE"
                    c.label = c.label.replace("swap-routing", "reroute-routing")
                    c.candidateId = c.candidateId.replace(":swap:", ":reroute:")
    except Exception as exc:  # noqa: BLE001 — surface as solver ERROR
        return _error(problem, started, seed, "ERROR", f"solver exception: {exc}")

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    status = _status_from_candidates(candidates, elapsed_ms, time_limit_ms)

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
            strategy=(
                "GUIDED_LOCAL_SEARCH"
                if problem.operation in ("SWAP", "REROUTE")
                else (
                    "SERVICE_SHORTEN"
                    if problem.operation == "SHORTEN"
                    else (
                        "OPTIONAL_DROP"
                        if problem.operation == "REPLACE"
                        else "FIXED_ORDER_SCHEDULE"
                    )
                )
            ),
            nativeCpSat=False,
            seed=seed,
            elapsedMs=elapsed_ms,
        ),
        message=None if candidates else "no feasible incumbent within time budget",
    )


class _Indexed:
    def __init__(
        self,
        nodes: list[OptimizationNode],
        node_ids: list[str],
        costs: list[list[int]],
        service: list[int],
        tw_starts: list[int],
        tw_ends: list[int],
        depot_index: int,
        day_id: str,
        base_order: list[str],
    ):
        self.nodes = nodes
        self.node_ids = node_ids
        self.costs = costs
        self.service = service
        self.tw_starts = tw_starts
        self.tw_ends = tw_ends
        self.depot_index = depot_index
        self.day_id = day_id
        self.base_order = base_order


def _index_problem(problem: SolverProblem) -> _Indexed:
    matrix_ids = problem.travelMatrix.nodeIds
    if len(matrix_ids) != len(problem.nodes):
        raise ValueError("travelMatrix.nodeIds length must equal nodes length")
    if len(problem.travelMatrix.costsMin) != len(matrix_ids):
        raise ValueError("travelMatrix.costsMin must be square matching nodeIds")

    by_id = {n.nodeId: n for n in problem.nodes}
    for nid in matrix_ids:
        if nid not in by_id:
            raise ValueError(f"matrix nodeId not in nodes: {nid}")

    nodes = [by_id[nid] for nid in matrix_ids]
    costs = [row[:] for row in problem.travelMatrix.costsMin]
    for row in costs:
        if len(row) != len(matrix_ids):
            raise ValueError("travelMatrix.costsMin must be square")

    service = [max(0, n.serviceDurationMin) for n in nodes]
    tw_starts: list[int] = []
    tw_ends: list[int] = []
    for n in nodes:
        if n.fixedStartMin is not None:
            tw_starts.append(int(n.fixedStartMin))
            tw_ends.append(int(n.fixedStartMin))
        elif n.timeWindows:
            tw_starts.append(min(tw.startMin for tw in n.timeWindows))
            end = min(tw.endMin for tw in n.timeWindows)
            if n.lastEntryMin is not None:
                end = min(end, n.lastEntryMin)
            tw_ends.append(int(end))
        else:
            tw_starts.append(0)
            tw_ends.append(DAY_HORIZON_MIN)

    depot_index = 0
    for c in problem.constraints:
        if c.kind == "DEPOT_FIXED" and isinstance(c.payload.get("nodeId"), str):
            depot_nid = c.payload["nodeId"]
            if depot_nid in matrix_ids:
                depot_index = matrix_ids.index(depot_nid)
            break

    big = 10**7
    for c in problem.constraints:
        if c.kind != "EDGE_FORBIDDEN" or not c.hard:
            continue
        a = c.payload.get("fromNodeId")
        b = c.payload.get("toNodeId")
        if (
            isinstance(a, str)
            and isinstance(b, str)
            and a in matrix_ids
            and b in matrix_ids
        ):
            costs[matrix_ids.index(a)][matrix_ids.index(b)] = big

    return _Indexed(
        nodes=nodes,
        node_ids=matrix_ids,
        costs=costs,
        service=service,
        tw_starts=tw_starts,
        tw_ends=tw_ends,
        depot_index=depot_index,
        day_id=problem.scope.dayIds[0],
        base_order=list(matrix_ids),
    )


def _order_from_depot(indexed: _Indexed) -> list[int]:
    order = list(range(len(indexed.node_ids)))
    if indexed.depot_index == 0:
        return order
    return [indexed.depot_index] + [i for i in order if i != indexed.depot_index]



def _avoid_forbidden_edges(order: list[int], indexed: _Indexed) -> list[int]:
    """Adjacent-swap until no hard EDGE_FORBIDDEN pairs remain (big cost markers)."""
    big = 10**6
    out = order[:]
    for _ in range(len(out) * 2):
        changed = False
        for i in range(len(out) - 1):
            a, b = out[i], out[i + 1]
            if indexed.costs[a][b] >= big and i + 2 < len(out):
                out[i + 1], out[i + 2] = out[i + 2], out[i + 1]
                changed = True
            elif indexed.costs[a][b] >= big and i > 0:
                out[i], out[i + 1] = out[i + 1], out[i]
                changed = True
        if not changed:
            break
    return out


def _solve_shift(
    problem: SolverProblem,
    indexed: _Indexed,
    max_candidates: int,
) -> list[SolverCandidate]:
    """Keep near-base visit order; break forbidden adjacencies then schedule."""
    order = _avoid_forbidden_edges(_order_from_depot(indexed), indexed)
    starts = _schedule_fixed_order(indexed, order)
    if starts is None:
        return []

    day_plan = SolverDayPlan(
        dayId=indexed.day_id,
        nodeIds=[indexed.node_ids[i] for i in order],
        startMin=starts,
    )
    return [
        SolverCandidate(
            candidateId=f"{problem.requestId}:shift:0",
            operation="SHIFT",
            label="shift-schedule-base-order",
            dayPlans=[day_plan],
            objectiveValue=float(_path_travel(indexed, order)),
            diffHint=SolverCandidateDiffHint(
                shiftedActivityIds=list(day_plan.nodeIds),
            ),
        )
    ][:max_candidates]


def _schedule_fixed_order(indexed: _Indexed, order: list[int]) -> Optional[list[int]]:
    starts: list[int] = []
    t = indexed.tw_starts[order[0]]
    fixed0 = indexed.nodes[order[0]].fixedStartMin
    if fixed0 is not None:
        t = int(fixed0)
    for pos, idx in enumerate(order):
        if pos > 0:
            prev = order[pos - 1]
            travel = indexed.costs[prev][idx]
            if travel >= 10**6:
                return None
            t = t + indexed.service[prev] + travel
        earliest = indexed.tw_starts[idx]
        latest = indexed.tw_ends[idx]
        if t < earliest:
            t = earliest
        if t > latest:
            return None
        starts.append(int(t))
    return starts


def _path_travel(indexed: _Indexed, order: list[int]) -> int:
    total = 0
    for a, b in zip(order, order[1:]):
        total += indexed.costs[a][b]
    return total


def _solve_swap(
    problem: SolverProblem,
    indexed: _Indexed,
    time_limit_ms: int,
    seed: int,
    max_candidates: int,
) -> list[SolverCandidate]:
    """RoutingModel VRPTW with GUIDED_LOCAL_SEARCH + cheap order diversity."""
    n = len(indexed.node_ids)
    manager = pywrapcp.RoutingIndexManager(n, 1, indexed.depot_index)
    routing = pywrapcp.RoutingModel(manager)

    def distance_cb(from_index: int, to_index: int) -> int:
        a = manager.IndexToNode(from_index)
        b = manager.IndexToNode(to_index)
        return int(indexed.costs[a][b])

    transit_idx = routing.RegisterTransitCallback(distance_cb)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_idx)

    def time_cb(from_index: int, to_index: int) -> int:
        a = manager.IndexToNode(from_index)
        b = manager.IndexToNode(to_index)
        return int(indexed.service[a] + indexed.costs[a][b])

    time_cb_idx = routing.RegisterTransitCallback(time_cb)
    routing.AddDimension(
        time_cb_idx,
        30,
        DAY_HORIZON_MIN,
        False,
        "Time",
    )
    time_dim = routing.GetDimensionOrDie("Time")

    for node in range(n):
        index = manager.NodeToIndex(node)
        time_dim.CumulVar(index).SetRange(indexed.tw_starts[node], indexed.tw_ends[node])

    search = pywrapcp.DefaultRoutingSearchParameters()
    # getattr avoids tooling that rewrites dotted protobuf enum paths
    _fss = getattr(routing_enums_pb2, "FirstSolutionStrategy")
    _lsm = getattr(routing_enums_pb2, "LocalSearchMetaheuristic")
    search.first_solution_strategy = getattr(_fss, "PATH_CHEAPEST_ARC")
    search.local_search_metaheuristic = getattr(_lsm, "GUIDED_LOCAL_SEARCH")
    search.time_limit.FromMilliseconds(time_limit_ms)
    if hasattr(search, "random_seed"):
        search.random_seed = seed

    solution = routing.SolveWithParameters(search)
    if solution is None:
        # Short fallback — avoid burning a second full budget on TIMEOUT
        search.local_search_metaheuristic = getattr(_lsm, "AUTOMATIC")
        search.first_solution_strategy = getattr(_fss, "PATH_CHEAPEST_ARC")
        fb_ms = min(150, max(50, time_limit_ms // 4))
        search.time_limit.FromMilliseconds(fb_ms)
        solution = routing.SolveWithParameters(search)

    collected: list[tuple[list[int], list[int], int]] = []
    if solution is not None:
        order: list[int] = []
        starts: list[int] = []
        index = routing.Start(0)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            order.append(node)
            starts.append(int(solution.Value(time_dim.CumulVar(index))))
            index = solution.Value(routing.NextVar(index))
        collected.append((order, starts, int(solution.ObjectiveValue())))

    base = _avoid_forbidden_edges(_order_from_depot(indexed), indexed)
    # Always try scheduled base order (post forbidden-edge repair) as a candidate
    base_sched = _schedule_fixed_order(indexed, base)
    if base_sched is not None:
        collected.append((base, base_sched, _path_travel(indexed, base)))
    for i in range(1, min(n - 1, max_candidates + 2)):
        trial = base[:]
        if i + 1 < len(trial):
            trial[i], trial[i + 1] = trial[i + 1], trial[i]
        sched = _schedule_fixed_order(indexed, trial)
        if sched is None:
            continue
        key = tuple(trial)
        if any(tuple(o) == key for o, _, _ in collected):
            continue
        collected.append((trial, sched, _path_travel(indexed, trial)))
        if len(collected) >= max_candidates:
            break

    if not collected:
        return []

    uniq: dict[tuple[int, ...], tuple[list[int], list[int], int]] = {}
    for o, s, obj in collected:
        uniq.setdefault(tuple(o), (o, s, obj))
    # Repair SWAP: prefer locality (order churn vs base), then travel
    base_order = _order_from_depot(indexed)

    def _churn(order: list[int]) -> int:
        return sum(1 for a, b in zip(base_order, order) if a != b) + abs(
            len(base_order) - len(order)
        )

    ranked = sorted(uniq.values(), key=lambda x: (_churn(x[0]), x[2]))[
        :max_candidates
    ]

    out: list[SolverCandidate] = []
    for rank, (o, s, obj) in enumerate(ranked):
        node_ids = [indexed.node_ids[i] for i in o]
        swapped = _swap_pairs(indexed.base_order, node_ids)
        out.append(
            SolverCandidate(
                candidateId=f"{problem.requestId}:swap:{rank}",
                operation="SWAP",
                label=f"swap-routing-{rank}",
                dayPlans=[
                    SolverDayPlan(dayId=indexed.day_id, nodeIds=node_ids, startMin=s)
                ],
                objectiveValue=float(obj),
                diffHint=SolverCandidateDiffHint(swappedPairs=swapped or None),
            )
        )
    return out


def _swap_pairs(base: list[str], cand: list[str]) -> list[dict[str, str]]:
    if sorted(base) != sorted(cand) or base == cand:
        return []
    pos = {nid: i for i, nid in enumerate(base)}
    pairs: list[dict[str, str]] = []
    for a, b in zip(cand, cand[1:]):
        if pos.get(a, -1) > pos.get(b, -1):
            pairs.append({"a": a, "b": b})
    return pairs[:5]


def _status_from_candidates(
    candidates: list[SolverCandidate], elapsed_ms: int, time_limit_ms: int
) -> str:
    if candidates:
        return "SOLVED"
    if elapsed_ms >= time_limit_ms * 0.9:
        return "TIMEOUT"
    return "INFEASIBLE"


def _error(
    problem: SolverProblem,
    started: float,
    seed: int,
    status: str,
    message: str,
) -> SolverResponse:
    return SolverResponse(
        requestId=problem.requestId,
        status=status,  # type: ignore[arg-type]
        candidates=[],
        solverMeta=SolverMeta(
            engine="OR_TOOLS_ROUTING",
            version=ENGINE_VERSION,
            strategy="NONE",
            nativeCpSat=False,
            seed=seed,
            elapsedMs=int((time.perf_counter() - started) * 1000),
        ),
        message=message,
    )
