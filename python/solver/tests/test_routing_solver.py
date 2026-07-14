"""Unit tests for OR-Tools routing MVP (SHIFT / SWAP)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from routing_solver import solve
from solver_models import SolverProblem

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


@pytest.fixture
def swap_problem() -> SolverProblem:
    raw = json.loads((FIXTURES / "day_shift_swap_10.json").read_text())
    return SolverProblem.model_validate(raw)


def test_swap_returns_candidates_without_forbidden_edge(swap_problem: SolverProblem) -> None:
    resp = solve(swap_problem)
    assert resp.solverMeta.nativeCpSat is False
    assert resp.solverMeta.engine == "OR_TOOLS_ROUTING"
    assert resp.status in ("SOLVED", "PARTIAL")
    assert 1 <= len(resp.candidates) <= 3
    for cand in resp.candidates:
        assert cand.dayPlans
        plan = cand.dayPlans[0]
        assert plan.dayId == "day-1"
        # DEPOT first
        assert plan.nodeIds[0] == "depot"
        # Forbidden a4→a5 must not appear as consecutive
        for a, b in zip(plan.nodeIds, plan.nodeIds[1:]):
            assert not (a == "a4" and b == "a5")


def test_shift_schedules_base_order(swap_problem: SolverProblem) -> None:
    swap_problem.operation = "SHIFT"
    resp = solve(swap_problem)
    assert resp.status == "SOLVED"
    assert len(resp.candidates) == 1
    plan = resp.candidates[0].dayPlans[0]
    assert plan.nodeIds[0] == "depot"
    assert plan.startMin is not None
    assert len(plan.startMin) == len(plan.nodeIds)
    # monotonic non-decreasing starts
    assert plan.startMin == sorted(plan.startMin)


def test_move_day_rejected(swap_problem: SolverProblem) -> None:
    swap_problem.operation = "MOVE_DAY"
    resp = solve(swap_problem)
    assert resp.status == "ERROR"
    assert resp.candidates == []
    assert resp.solverMeta.nativeCpSat is False


def test_fixed_seed_reproducible(swap_problem: SolverProblem) -> None:
    a = solve(swap_problem)
    b = solve(swap_problem)
    assert [c.dayPlans[0].nodeIds for c in a.candidates] == [
        c.dayPlans[0].nodeIds for c in b.candidates
    ]


def test_schema_ids(swap_problem: SolverProblem) -> None:
    resp = solve(swap_problem)
    assert resp.schemaId == "tripnara.solver_response@v1"
    assert swap_problem.schemaId == "tripnara.solver_problem@v1"
