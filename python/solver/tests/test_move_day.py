"""MOVE_DAY multi-day shadow (P4.a) — flag gated."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from move_day_solver import is_move_day_enabled
from routing_solver import solve
from solver_models import SolverProblem

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


@pytest.fixture
def move_problem() -> SolverProblem:
    raw = json.loads((FIXTURES / "move_day_2day.json").read_text())
    return SolverProblem.model_validate(raw)


def test_move_day_disabled_by_default(move_problem: SolverProblem, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OR_TOOLS_MOVE_DAY_SHADOW", raising=False)
    assert is_move_day_enabled() is False
    resp = solve(move_problem)
    assert resp.status == "ERROR"
    assert resp.candidates == []
    assert resp.solverMeta.nativeCpSat is False
    assert "disabled" in (resp.message or "").lower()


def test_move_day_requires_two_days(move_problem: SolverProblem, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OR_TOOLS_MOVE_DAY_SHADOW", "1")
    move_problem.scope.dayIds = ["day-1"]
    resp = solve(move_problem)
    assert resp.status == "ERROR"
    assert ">= 2" in (resp.message or "")


def test_move_day_rebalance_shadow(move_problem: SolverProblem, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OR_TOOLS_MOVE_DAY_SHADOW", "1")
    resp = solve(move_problem)
    assert resp.solverMeta.nativeCpSat is False
    assert resp.solverMeta.engine == "OR_TOOLS_ROUTING"
    assert resp.solverMeta.strategy == "MOVE_DAY_GREEDY_REBALANCE"
    assert resp.status == "SOLVED"
    assert 1 <= len(resp.candidates) <= 3
    for cand in resp.candidates:
        assert cand.operation == "MOVE_DAY"
        assert len(cand.dayPlans) == 2
        days = {p.dayId for p in cand.dayPlans}
        assert days == {"day-1", "day-2"}
        # booked a4 never leaves day-1
        d1 = next(p for p in cand.dayPlans if p.dayId == "day-1")
        assert "a4" in d1.nodeIds
        # depot/anchor first
        for p in cand.dayPlans:
            assert p.nodeIds[0] == "depot"
    # At least one variant should move something when day-1 is heavier
    moved_any = any(
        (c.diffHint and c.diffHint.movedDayPairs) for c in resp.candidates
    )
    assert moved_any
    # locality cap
    for c in resp.candidates:
        pairs = (c.diffHint.movedDayPairs if c.diffHint else None) or []
        assert len(pairs) <= 2


def test_move_day_seed_stable(move_problem: SolverProblem, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OR_TOOLS_MOVE_DAY_SHADOW", "1")
    a = solve(move_problem)
    b = solve(move_problem)
    assert [c.dayPlans for c in a.candidates] == [c.dayPlans for c in b.candidates]
