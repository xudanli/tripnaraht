"""S3 SHORTEN / REPLACE local repair ops."""

from __future__ import annotations

import json
from pathlib import Path

from routing_solver import solve
from solver_models import SolverProblem

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _base() -> dict:
    return json.loads((FIXTURES / "day_shift_swap_10.json").read_text())


def test_shorten_reduces_service_and_schedules():
    raw = _base()
    raw["operation"] = "SHORTEN"
    # make a few nodes removable duration-wise
    for n in raw["nodes"]:
        if n["nodeId"].startswith("a"):
            n["serviceDurationMin"] = max(60, n["serviceDurationMin"])
    problem = SolverProblem.model_validate(raw)
    resp = solve(problem)
    assert resp.status == "SOLVED"
    assert resp.solverMeta.nativeCpSat is False
    assert resp.solverMeta.strategy == "SERVICE_SHORTEN"
    assert 1 <= len(resp.candidates) <= 3
    for c in resp.candidates:
        assert c.operation == "SHORTEN"
        assert c.dayPlans[0].nodeIds[0] == "depot"


def test_replace_drops_optional_visit():
    raw = _base()
    raw["operation"] = "REPLACE"
    for n in raw["nodes"]:
        if n["nodeId"] in ("a8", "a9"):
            n["canRemove"] = True
            n["isMandatory"] = False
    problem = SolverProblem.model_validate(raw)
    resp = solve(problem)
    assert resp.status == "SOLVED"
    assert resp.solverMeta.strategy == "OPTIONAL_DROP"
    assert len(resp.candidates) >= 1
    base_ids = {n["nodeId"] for n in raw["nodes"]}
    for c in resp.candidates:
        assert c.operation == "REPLACE"
        assert c.diffHint and c.diffHint.removedActivityIds
        removed = set(c.diffHint.removedActivityIds)
        assert removed <= base_ids
        assert "depot" not in removed
        plan_ids = set(c.dayPlans[0].nodeIds)
        assert removed.isdisjoint(plan_ids)
