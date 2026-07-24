"""
SHORTEN / REPLACE local repair (ADR-008 S3).

Keep sequence; adjust duration or drop optional visit.
nativeCpSat remains false (not CP-SAT).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from solver_models import (
    SolverCandidate,
    SolverCandidateDiffHint,
    SolverDayPlan,
    SolverProblem,
)

if TYPE_CHECKING:
    from routing_solver import _Indexed


def solve_shorten(
    problem: SolverProblem,
    indexed: "_Indexed",
    max_candidates: int,
) -> list[SolverCandidate]:
    from routing_solver import (
        _Indexed,
        _avoid_forbidden_edges,
        _order_from_depot,
        _path_travel,
        _schedule_fixed_order,
    )

    order = _avoid_forbidden_edges(_order_from_depot(indexed), indexed)
    factors = [0.75, 0.6, 0.5][:max_candidates]
    out: list[SolverCandidate] = []

    mutable = [
        i
        for i in order
        if i != indexed.depot_index
        and not indexed.nodes[i].isBooked
        and indexed.service[i] >= 20
    ]
    mutable.sort(key=lambda i: indexed.service[i], reverse=True)
    if not mutable:
        return []

    target = mutable[0]
    for rank, factor in enumerate(factors):
        services = list(indexed.service)
        original = services[target]
        shortened = max(10, int(round(original * factor)))
        if shortened >= original:
            continue
        services[target] = shortened
        patched = _Indexed(
            nodes=indexed.nodes,
            node_ids=indexed.node_ids,
            costs=indexed.costs,
            service=services,
            tw_starts=indexed.tw_starts,
            tw_ends=indexed.tw_ends,
            depot_index=indexed.depot_index,
            day_id=indexed.day_id,
            base_order=indexed.base_order,
        )
        starts = _schedule_fixed_order(patched, order)
        if starts is None:
            continue
        node_ids = [indexed.node_ids[i] for i in order]
        out.append(
            SolverCandidate(
                candidateId=f"{problem.requestId}:shorten:{rank}",
                operation="SHORTEN",
                label=f"shorten-{indexed.node_ids[target]}-{int(factor * 100)}pct",
                dayPlans=[
                    SolverDayPlan(dayId=indexed.day_id, nodeIds=node_ids, startMin=starts)
                ],
                objectiveValue=float(_path_travel(patched, order)),
                diffHint=SolverCandidateDiffHint(
                    shiftedActivityIds=[indexed.node_ids[target]],
                ),
            )
        )
    return out


def solve_replace(
    problem: SolverProblem,
    indexed: "_Indexed",
    max_candidates: int,
) -> list[SolverCandidate]:
    from routing_solver import (
        _avoid_forbidden_edges,
        _order_from_depot,
        _path_travel,
        _schedule_fixed_order,
    )

    order = _avoid_forbidden_edges(_order_from_depot(indexed), indexed)
    id_to_idx = {nid: i for i, nid in enumerate(indexed.node_ids)}

    # Preferred: REPLACE_POOL pairs (from → to) when both in matrix
    pool_pairs: list[tuple[str, str]] = []
    for c in problem.constraints:
        if c.kind != "REPLACE_POOL":
            continue
        fr = c.payload.get("fromNodeId")
        to = c.payload.get("toNodeId")
        if isinstance(fr, str) and isinstance(to, str) and fr in id_to_idx and to in id_to_idx:
            if not indexed.nodes[id_to_idx[fr]].isBooked:
                pool_pairs.append((fr, to))

    out: list[SolverCandidate] = []
    if pool_pairs:
        for rank, (fr, to) in enumerate(pool_pairs[:max_candidates]):
            fr_i, to_i = id_to_idx[fr], id_to_idx[to]
            if fr_i not in order:
                continue
            new_order = [to_i if i == fr_i else i for i in order]
            # avoid duplicate visits
            seen: set[int] = set()
            deduped: list[int] = []
            for i in new_order:
                if i in seen and i != indexed.depot_index:
                    continue
                seen.add(i)
                deduped.append(i)
            starts = _schedule_fixed_order(indexed, deduped)
            if starts is None:
                continue
            out.append(
                SolverCandidate(
                    candidateId=f"{problem.requestId}:replace:{rank}",
                    operation="REPLACE",
                    label=f"replace-{fr}-with-{to}",
                    dayPlans=[
                        SolverDayPlan(
                            dayId=indexed.day_id,
                            nodeIds=[indexed.node_ids[i] for i in deduped],
                            startMin=starts,
                        )
                    ],
                    objectiveValue=float(_path_travel(indexed, deduped)),
                    diffHint=SolverCandidateDiffHint(
                        removedActivityIds=[fr],
                        addedPoiIds=[indexed.nodes[to_i].poiId or to],
                    ),
                )
            )
        if out:
            return out

    # Fallback MVP: drop optional visit
    candidates_idx = [
        i
        for i in order
        if i != indexed.depot_index
        and not indexed.nodes[i].isBooked
        and (indexed.nodes[i].canRemove or not indexed.nodes[i].isMandatory)
    ]
    if not candidates_idx:
        candidates_idx = [
            i
            for i in order
            if i != indexed.depot_index and not indexed.nodes[i].isBooked
        ]
        candidates_idx.sort(key=lambda i: indexed.service[i])

    for rank, drop in enumerate(candidates_idx[:max_candidates]):
        new_order = [i for i in order if i != drop]
        if len(new_order) < 2:
            continue
        starts = _schedule_fixed_order(indexed, new_order)
        if starts is None:
            continue
        removed_id = indexed.node_ids[drop]
        node_ids = [indexed.node_ids[i] for i in new_order]
        out.append(
            SolverCandidate(
                candidateId=f"{problem.requestId}:replace:{rank}",
                operation="REPLACE",
                label=f"replace-drop-{removed_id}",
                dayPlans=[
                    SolverDayPlan(dayId=indexed.day_id, nodeIds=node_ids, startMin=starts)
                ],
                objectiveValue=float(_path_travel(indexed, new_order)),
                diffHint=SolverCandidateDiffHint(removedActivityIds=[removed_id]),
            )
        )
    return out
