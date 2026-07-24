#!/usr/bin/env python3
"""Add 5 multi-day hotel_change MOVE_DAY gold scenarios (P4.c)."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
FIXTURE = REPO / "python/solver/fixtures/move_day_2day.json"
FAM = (
    REPO
    / "src/decision-runtime/solver/lab/gold/scenarios/iceland/hotel_change"
)
PROBLEMS = FAM / "problems"
MANIFEST = REPO / "src/decision-runtime/solver/lab/gold/manifest.v1.json"

VARIANTS = [
    (
        "md_01_overloaded_day1_rebalance",
        "Hotel stay — MOVE_DAY rebalance overloaded day-1",
        2,
        {},
    ),
    (
        "md_02_pin_breakfast_stay",
        "Hotel stay — MOVE_DAY keeps booked lunch pin on day-1",
        2,
        {},
    ),
    (
        "md_03_tight_capacity_day2",
        "Hotel stay — MOVE_DAY respects day-2 maxActivities",
        2,
        {
            "scope": {
                "dayCapacities": [
                    {"dayId": "day-1", "maxActivities": 5, "maxServiceMin": 300},
                    {"dayId": "day-2", "maxActivities": 3, "maxServiceMin": 180},
                ]
            }
        },
    ),
    (
        "md_04_max_moved_one",
        "Hotel stay — MOVE_DAY locality maxMovedActivities=1",
        1,
        {"solverConfig": {"maxMovedActivities": 1}},
    ),
    (
        "md_05_three_movable_on_day1",
        "Hotel stay — MOVE_DAY three movable on day-1",
        3,
        {},
    ),
]


def deep_merge(base: dict, patch: dict) -> dict:
    out = deepcopy(base)
    for k, v in patch.items():
        if k == "scope" and isinstance(v, dict):
            out.setdefault("scope", {})
            for sk, sv in v.items():
                out["scope"][sk] = sv
        elif k == "solverConfig" and isinstance(v, dict):
            out.setdefault("solverConfig", {}).update(v)
        else:
            out[k] = v
    return out


def main() -> None:
    base = json.loads(FIXTURE.read_text(encoding="utf-8"))
    PROBLEMS.mkdir(parents=True, exist_ok=True)
    entries = []
    for sid, title, max_moved, patch in VARIANTS:
        problem = deep_merge(base, patch)
        problem["requestId"] = f"req-gold-{sid}"
        problem["evidenceVersionId"] = f"ev-{sid}"
        problem["snapshotId"] = f"ev-{sid}"
        prob_name = f"{sid}.problem.json"
        (PROBLEMS / prob_name).write_text(
            json.dumps(problem, indent=2) + "\n", encoding="utf-8"
        )
        scen_id = f"iceland.hotel_change.{sid}"
        scen_name = f"{sid}.scenario.json"
        scen = {
            "schemaId": "tripnara.planning_gold_scenario@v1",
            "scenarioId": scen_id,
            "status": "active",
            "countryCode": "IS",
            "family": "hotel_change",
            "title": title,
            "seed": 42,
            "stabilityRuns": 20,
            "maxChangedActivities": max_moved,
            "requireNodeIds": ["a4"],
            "solverProblemRef": (
                "src/decision-runtime/solver/lab/gold/scenarios/iceland/"
                f"hotel_change/problems/{prob_name}"
            ),
            "notes": [
                "MOVE_DAY multi-day (P4); requires OR_TOOLS_MOVE_DAY_SHADOW=1 on sidecar",
            ],
            "provenance": "synthetic_template_v1",
        }
        (FAM / scen_name).write_text(
            json.dumps(scen, indent=2) + "\n", encoding="utf-8"
        )
        entries.append(
            {
                "scenarioId": scen_id,
                "path": f"scenarios/iceland/hotel_change/{scen_name}",
                "status": "active",
                "family": "hotel_change",
            }
        )
        print("wrote", scen_id)

    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    existing_ids = {e["scenarioId"] for e in man["scenarios"]}
    for e in entries:
        if e["scenarioId"] not in existing_ids:
            # insert after other hotel_change
            idx = max(
                (
                    i
                    for i, s in enumerate(man["scenarios"])
                    if s.get("family") == "hotel_change"
                ),
                default=len(man["scenarios"]) - 1,
            )
            man["scenarios"].insert(idx + 1, e)
            existing_ids.add(e["scenarioId"])
    man["hotelChangeMoveDayActiveCount"] = len(entries)
    MANIFEST.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    print("manifest ok, move_day gold=", len(entries))


if __name__ == "__main__":
    main()
