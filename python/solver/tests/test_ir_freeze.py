"""S4.5 / M1.5 Planning IR Freeze conformance."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from solver_models import (
    MVP_OPERATIONS,
    SOLVER_PROBLEM_SCHEMA_ID,
    SOLVER_RESPONSE_SCHEMA_ID,
    SolverProblem,
    SolverResponse,
)
from routing_solver import solve

REPO = Path(__file__).resolve().parents[3]
GOLD_MANIFEST = (
    REPO
    / "src/decision-runtime/solver/lab/gold/manifest.v1.json"
)
GOLD_ROOT = REPO / "src/decision-runtime/solver/lab/gold"
FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _active_problem_paths() -> list[Path]:
    man = json.loads(GOLD_MANIFEST.read_text(encoding="utf-8"))
    paths: list[Path] = []
    for entry in man["scenarios"]:
        if entry.get("status") != "active":
            continue
        scen = json.loads((GOLD_ROOT / entry["path"]).read_text(encoding="utf-8"))
        ref = scen.get("solverProblemRef")
        if not ref:
            continue
        paths.append(REPO / ref)
    return paths


def test_schema_id_constants() -> None:
    assert SOLVER_PROBLEM_SCHEMA_ID == "tripnara.solver_problem@v1"
    assert SOLVER_RESPONSE_SCHEMA_ID == "tripnara.solver_response@v1"


def test_mvp_ops_exclude_move_day() -> None:
    assert "MOVE_DAY" not in MVP_OPERATIONS
    assert MVP_OPERATIONS == frozenset(
        {"SHIFT", "SWAP", "REROUTE", "SHORTEN", "REPLACE"}
    )


@pytest.mark.parametrize("path", _active_problem_paths(), ids=lambda p: p.name)
def test_gold_problem_validates_ir(path: Path) -> None:
    raw = json.loads(path.read_text(encoding="utf-8"))
    problem = SolverProblem.model_validate(raw)
    assert problem.schemaId == SOLVER_PROBLEM_SCHEMA_ID
    assert problem.operation in (
        *MVP_OPERATIONS,
        "MOVE_DAY",
    )
    if problem.operation == "MOVE_DAY":
        assert len(problem.scope.dayIds) >= 2
    assert len(problem.nodes) == len(problem.travelMatrix.nodeIds)


def test_move_day_errors_under_freeze() -> None:
    raw = json.loads((FIXTURES / "day_shift_swap_10.json").read_text())
    raw["operation"] = "MOVE_DAY"
    resp = solve(SolverProblem.model_validate(raw))
    assert resp.schemaId == SOLVER_RESPONSE_SCHEMA_ID
    assert resp.status == "ERROR"
    assert resp.candidates == []
    assert resp.solverMeta.nativeCpSat is False
    assert resp.solverMeta.engine == "OR_TOOLS_ROUTING"


def test_multi_day_scope_rejected_until_m2() -> None:
    """Design invariant (MOVE_DAY_DESIGN_REVIEW): single-day Routing cannot host multi-day."""
    raw = json.loads((FIXTURES / "day_shift_swap_10.json").read_text())
    raw["operation"] = "SWAP"
    raw["scope"] = {"dayIds": ["day-1", "day-2"]}
    resp = solve(SolverProblem.model_validate(raw))
    assert resp.status == "ERROR"
    assert resp.candidates == []
    assert resp.solverMeta.nativeCpSat is False


def test_routing_response_never_claims_cpsat() -> None:
    raw = json.loads((FIXTURES / "day_shift_swap_10.json").read_text())
    resp = solve(SolverProblem.model_validate(raw))
    assert isinstance(resp, SolverResponse)
    assert resp.solverMeta.nativeCpSat is False
    assert resp.solverMeta.engine == "OR_TOOLS_ROUTING"
