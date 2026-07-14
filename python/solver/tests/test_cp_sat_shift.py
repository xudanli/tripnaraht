"""Native CP-SAT SHIFT path (P5 / M3) — flag gated."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from ortools.sat.python import cp_model

from cp_sat_shift_solver import is_native_cpsat_enabled, solve_shift_cpsat
from routing_solver import solve
from solver_models import SolverProblem

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


@pytest.fixture
def shift_problem() -> SolverProblem:
    raw = json.loads((FIXTURES / "day_shift_swap_10.json").read_text())
    raw["operation"] = "SHIFT"
    return SolverProblem.model_validate(raw)


def test_ortools_cp_sat_module_available() -> None:
    model = cp_model.CpModel()
    x = model.NewIntVar(0, 10, "x")
    model.Minimize(x)
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    assert status == cp_model.OPTIMAL
    assert solver.Value(x) == 0


def test_cpsat_disabled_by_default(
    shift_problem: SolverProblem, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("OR_TOOLS_NATIVE_CPSAT", raising=False)
    assert is_native_cpsat_enabled() is False
    # Default SHIFT uses Routing — never nativeCpSat
    resp = solve(shift_problem)
    assert resp.status == "SOLVED"
    assert resp.solverMeta.engine == "OR_TOOLS_ROUTING"
    assert resp.solverMeta.nativeCpSat is False


def test_cpsat_shift_honest_meta(
    shift_problem: SolverProblem, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OR_TOOLS_NATIVE_CPSAT", "1")
    resp = solve_shift_cpsat(shift_problem)
    assert resp.status == "SOLVED"
    assert resp.solverMeta.engine == "OR_TOOLS_CP_SAT"
    assert resp.solverMeta.nativeCpSat is True
    assert resp.solverMeta.strategy == "CP_SAT_SHIFT_INTERVAL_CHAIN"
    assert len(resp.candidates) == 1
    plan = resp.candidates[0].dayPlans[0]
    assert plan.nodeIds[0] == "depot"
    assert plan.startMin is not None
    assert plan.startMin == sorted(plan.startMin)


def test_solve_dispatches_to_cpsat_when_flagged(
    shift_problem: SolverProblem, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OR_TOOLS_NATIVE_CPSAT", "1")
    resp = solve(shift_problem)
    assert resp.solverMeta.engine == "OR_TOOLS_CP_SAT"
    assert resp.solverMeta.nativeCpSat is True


def test_routing_never_claims_cpsat_with_flag_off(
    shift_problem: SolverProblem, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OR_TOOLS_NATIVE_CPSAT", "0")
    resp = solve(shift_problem)
    assert not (
        resp.solverMeta.nativeCpSat is True
        and resp.solverMeta.engine == "OR_TOOLS_ROUTING"
    )
