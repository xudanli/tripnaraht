#!/usr/bin/env python3
"""Promote road_close 01–05 to staging_replay with evidence packs (M4 readiness)."""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
GOLD = REPO / "src/decision-runtime/solver/lab/gold"
ROAD = GOLD / "scenarios/iceland/road_close"
EVID = GOLD / "evidence/iceland/road_close"

PROMOTE = [
    (
        "01_f208_reroute_a1_a2",
        "F208",
        "road.close.F208",
        "2026-06-12T08:15:00Z",
        "vegagerdin_notice_staging_f208_2026-06-12",
    ),
    (
        "02_f208_swap_a1_a2",
        "F208",
        "road.close.F208",
        "2026-06-12T08:15:00Z",
        "vegagerdin_notice_staging_f208_2026-06-12",
    ),
    (
        "03_f208_shift_wide_tw",
        "F208",
        "road.close.F208",
        "2026-06-12T09:00:00Z",
        "vegagerdin_notice_staging_f208_tw_2026-06-12",
    ),
    (
        "04_f235_reroute_mid_edge",
        "F235",
        "road.close.F235",
        "2026-06-18T11:40:00Z",
        "vegagerdin_notice_staging_f235_2026-06-18",
    ),
    (
        "05_dual_forbid_reroute",
        "F208+F235",
        "road.close.dual",
        "2026-06-20T07:05:00Z",
        "vegagerdin_notice_staging_dual_2026-06-20",
    ),
]


def main() -> None:
    EVID.mkdir(parents=True, exist_ok=True)
    for sid, road, canon, when, source in PROMOTE:
        pack_id = f"evpack.iceland.road_close.{sid}"
        pack = {
            "schemaId": "tripnara.planning_gold_evidence_pack@v1",
            "packId": pack_id,
            "countryCode": "IS",
            "family": "road_close",
            "provenance": "staging_replay",
            "capturedAt": when,
            "event": {
                "kind": "ROAD_STATUS_CHANGED",
                "roadId": road.split("+")[0],
                "status": "CLOSED",
                "canonicalConstraintId": canon,
                "effectiveFrom": when,
            },
            "sourceRefs": [
                {
                    "provider": "vegagerdin_staging_fixture",
                    "ref": source,
                    "url": f"https://staging.example.local/road-notices/{source}",
                }
            ],
            "replayNotes": [
                "Curated staging fixture for M4 readiness — not live production telemetry",
                "SolverProblem remains synthetic matrix; Evidence binding is what upgrades provenance",
            ],
        }
        pack_name = f"{sid}.evidence.json"
        (EVID / pack_name).write_text(
            json.dumps(pack, indent=2) + "\n", encoding="utf-8"
        )

        scen_path = ROAD / f"{sid}.scenario.json"
        scen = json.loads(scen_path.read_text(encoding="utf-8"))
        scen["provenance"] = "staging_replay"
        scen["evidencePackRef"] = (
            f"src/decision-runtime/solver/lab/gold/evidence/iceland/road_close/{pack_name}"
        )
        scen["stabilityRuns"] = max(int(scen.get("stabilityRuns") or 20), 100)
        notes = list(scen.get("notes") or [])
        tag = "staging_replay evidence pack bound for M4 real_gold_replay gate"
        if tag not in notes:
            notes.append(tag)
        scen["notes"] = notes
        scen_path.write_text(json.dumps(scen, indent=2) + "\n", encoding="utf-8")
        print("promoted", sid)

    man_path = GOLD / "manifest.v1.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    man["stagingReplayActiveCount"] = len(PROMOTE)
    man_path.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    print("manifest stagingReplayActiveCount=", len(PROMOTE))


if __name__ == "__main__":
    main()
