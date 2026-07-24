"""S3 REROUTE — same routing engine as SWAP, labeled for road-close detours."""

from __future__ import annotations

import json
from pathlib import Path

from routing_solver import solve
from solver_models import SolverProblem

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_reroute_avoids_forbidden_and_labels():
    raw = json.loads((FIXTURES / "day_shift_swap_10.json").read_text())
    raw["operation"] = "REROUTE"
    problem = SolverProblem.model_validate(raw)
    resp = solve(problem)
    assert resp.status == "SOLVED"
    assert resp.solverMeta.nativeCpSat is False
    assert resp.solverMeta.strategy == "GUIDED_LOCAL_SEARCH"
    assert len(resp.candidates) >= 1
    for c in resp.candidates:
        assert c.operation == "REROUTE"
        assert "reroute" in c.label
        for day in c.dayPlans:
            for a, b in zip(day.nodeIds, day.nodeIds[1:]):
                assert not (a == "a4" and b == "a5")
