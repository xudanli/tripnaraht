#!/usr/bin/env python3
"""
Offline demo: solve SWAP on day fixture and print travel objective.
Does NOT promote authority. Nest Lab compare lives in ortools-planning-lab-compare.util.ts.
"""

from __future__ import annotations

import json
from pathlib import Path

from routing_solver import solve
from solver_models import SolverProblem

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "day_shift_swap_10.json"


def main() -> int:
    raw = json.loads(FIXTURE.read_text())
    raw["operation"] = "SWAP"
    raw["requestId"] = "planning-lab-demo"
    problem = SolverProblem.model_validate(raw)
    resp = solve(problem)
    print(
        json.dumps(
            {
                "status": resp.status,
                "nativeCpSat": resp.solverMeta.nativeCpSat,
                "authoritativePromotion": False,
                "candidates": [
                    {
                        "candidateId": c.candidateId,
                        "objectiveValue": c.objectiveValue,
                        "nodeIds": c.dayPlans[0].nodeIds if c.dayPlans else [],
                    }
                    for c in resp.candidates
                ],
                "note": "Compare to legacy reverse-order in Nest ortoolsShadow.labCompare",
            },
            indent=2,
        )
    )
    return 0 if resp.status in ("SOLVED", "PARTIAL") else 1


if __name__ == "__main__":
    raise SystemExit(main())
