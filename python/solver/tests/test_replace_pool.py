"""REPLACE with REPLACE_POOL constraint (swap from→to)."""

from __future__ import annotations

import json
from pathlib import Path

from routing_solver import solve
from solver_models import SolverProblem

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_replace_pool_swaps_poi():
    raw = json.loads((FIXTURES / "day_shift_swap_10.json").read_text())
    raw["operation"] = "REPLACE"
    raw["requestId"] = "req-replace-pool"
    # mark a9 as substitute pool target for a8
    raw["constraints"].append(
        {
            "constraintId": "replace-a8-a9",
            "kind": "REPLACE_POOL",
            "hard": False,
            "payload": {"fromNodeId": "a8", "toNodeId": "a9"},
        }
    )
    problem = SolverProblem.model_validate(raw)
    resp = solve(problem)
    assert resp.status == "SOLVED"
    assert any(c.operation == "REPLACE" for c in resp.candidates)
    hit = next(c for c in resp.candidates if "a8" in (c.diffHint.removedActivityIds or []))
    assert "a9" in hit.dayPlans[0].nodeIds
    assert "a8" not in hit.dayPlans[0].nodeIds
