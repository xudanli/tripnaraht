"""Shared helpers for synthetic Planning Gold family generators."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest.v1.json"

SCHEMA_P = "tripnara.solver_problem@v1"
SCHEMA_S = "tripnara.planning_gold_scenario@v1"

FAMILY_ORDER = (
    "road_close",
    "wind",
    "blue_ice",
    "parking_full",
    "hotel_change",
    "reservation_delay",
)


def depot() -> dict:
    return {
        "nodeId": "depot",
        "serviceDurationMin": 0,
        "timeWindows": [{"startMin": 480, "endMin": 480}],
        "fixedStartMin": 480,
        "isMandatory": True,
        "isBooked": True,
        "canRemove": False,
        "canMoveDay": False,
    }


def visit(
    nid: str,
    poi: str,
    service: int = 60,
    *,
    mandatory: bool = True,
    booked: bool = False,
    can_remove: bool | None = None,
    tw: tuple[int, int] = (480, 1200),
    fixed_start: int | None = None,
) -> dict:
    n: dict = {
        "nodeId": nid,
        "sourceActivityId": f"act-{nid}",
        "poiId": poi,
        "serviceDurationMin": service,
        "timeWindows": [{"startMin": tw[0], "endMin": tw[1]}],
        "isMandatory": mandatory,
        "isBooked": booked,
        "canRemove": (not mandatory) if can_remove is None else can_remove,
        "canMoveDay": False,
    }
    if fixed_start is not None:
        n["fixedStartMin"] = fixed_start
    return n


def matrix_chain(ids: list[str], step: int = 18) -> dict:
    n = len(ids)
    costs = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            costs[i][j] = step + abs(i - j) * 4 + (3 if (i + j) % 3 == 0 else 0)
    return {"nodeIds": ids, "costsMin": costs}


def base_problem(
    *,
    op: str,
    evidence: str,
    nodes: list[dict],
    constraints: list[dict],
    request_prefix: str,
    matrix: dict | None = None,
) -> dict:
    ids = [n["nodeId"] for n in nodes]
    return {
        "schemaId": SCHEMA_P,
        "requestId": f"req-fixture-{request_prefix}",
        "tripId": "trip-gold-iceland",
        "planVersionId": "pv-gold",
        "evidenceVersionId": evidence,
        "snapshotId": evidence,
        "operation": op,
        "scope": {"dayIds": ["day-1"]},
        "nodes": nodes,
        "travelMatrix": matrix or matrix_chain(ids),
        "constraints": constraints,
        "objectives": [
            {"objectiveId": "min-travel", "kind": "MINIMIZE_TRAVEL", "weight": 1}
        ],
        "solverConfig": {"maxCandidates": 3, "timeLimitMs": 1500, "seed": 42},
    }


def depot_fixed() -> dict:
    return {
        "constraintId": "depot-fixed",
        "kind": "DEPOT_FIXED",
        "hard": True,
        "payload": {"nodeId": "depot"},
    }


def edge_forbidden(cid: str, fr: str, to: str, road: str, canon: str) -> dict:
    return {
        "constraintId": cid,
        "kind": "EDGE_FORBIDDEN",
        "hard": True,
        "canonicalConstraintId": canon,
        "payload": {"fromNodeId": fr, "toNodeId": to, "roadId": road},
    }


def replace_pool(fr: str, to: str) -> dict:
    return {
        "constraintId": f"replace-pool-{fr}",
        "kind": "REPLACE_POOL",
        "hard": False,
        "payload": {"fromNodeId": fr, "toNodeId": to},
    }


def write_family(
    family: str,
    scenarios: list[tuple[str, str, int | None, dict, list[str]]],
    *,
    count_key: str,
) -> None:
    fam_dir = ROOT / "scenarios" / "iceland" / family
    problems = fam_dir / "problems"
    problems.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    for sid, title, max_changed, problem, notes in scenarios:
        scen_id = f"iceland.{family}.{sid}"
        prob_name = f"{sid}.problem.json"
        scen_name = f"{sid}.scenario.json"
        (problems / prob_name).write_text(
            json.dumps(problem, indent=2) + "\n", encoding="utf-8"
        )
        scen = {
            "schemaId": SCHEMA_S,
            "scenarioId": scen_id,
            "status": "active",
            "countryCode": "IS",
            "family": family,
            "title": title,
            "seed": 42,
            "stabilityRuns": 20,
            "solverProblemRef": (
                f"src/decision-runtime/solver/lab/gold/scenarios/iceland/{family}/"
                f"problems/{prob_name}"
            ),
            "notes": notes,
            "provenance": "synthetic_template_v1",
        }
        if max_changed is not None:
            scen["maxChangedActivities"] = max_changed
        (fam_dir / scen_name).write_text(
            json.dumps(scen, indent=2) + "\n", encoding="utf-8"
        )
        entries.append(
            {
                "scenarioId": scen_id,
                "path": f"scenarios/iceland/{family}/{scen_name}",
                "status": "active",
                "family": family,
            }
        )
        print("wrote", scen_id)

    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    others = [s for s in man["scenarios"] if s.get("family") != family]
    ordered: list[dict] = []
    for fam in FAMILY_ORDER:
        if fam == family:
            ordered.extend(entries)
        else:
            ordered.extend([s for s in others if s.get("family") == fam])
    # leftovers (unknown families)
    known = set(FAMILY_ORDER)
    ordered.extend([s for s in others if s.get("family") not in known])
    man["scenarios"] = ordered
    man[count_key] = len(entries)
    MANIFEST.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    print(f"manifest updated, {family}={len(entries)}")
