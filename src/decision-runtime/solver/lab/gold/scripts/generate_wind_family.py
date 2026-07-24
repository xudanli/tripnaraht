#!/usr/bin/env python3
"""Generate iceland/wind synthetic gold (10 active). Not authoritative."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WIND = ROOT / "scenarios" / "iceland" / "wind"
PROBLEMS = WIND / "problems"
MANIFEST = ROOT / "manifest.v1.json"

SCHEMA_P = "tripnara.solver_problem@v1"
SCHEMA_S = "tripnara.planning_gold_scenario@v1"


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
    matrix: dict | None = None,
) -> dict:
    ids = [n["nodeId"] for n in nodes]
    return {
        "schemaId": SCHEMA_P,
        "requestId": "req-fixture-wind",
        "tripId": "trip-gold-iceland",
        "planVersionId": "pv-gold",
        "evidenceVersionId": evidence,
        "snapshotId": evidence,
        "operation": op,
        "scope": {"dayIds": ["day-1"]},
        "nodes": nodes,
        "travelMatrix": matrix or matrix_chain(ids),
        "constraints": constraints,
        "objectives": [{"objectiveId": "min-travel", "kind": "MINIMIZE_TRAVEL", "weight": 1}],
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


SCENARIOS: list[tuple[str, str, int | None, dict, list[str]]] = []


def add(
    sid: str,
    title: str,
    problem: dict,
    *,
    max_changed: int | None = None,
    notes: list[str] | None = None,
) -> None:
    SCENARIOS.append((sid, title, max_changed, problem, notes or []))


def build() -> None:
    # Shared south-coast style days under storm
    south = [
        depot(),
        visit("a1", "is.seljalandsfoss", 55),
        visit("a2", "is.skogafoss", 55),
        visit("a3", "is.dyrholaey", 45, mandatory=False),
        visit("a4", "is.reynisfjara", 50),
        visit("a5", "is.vik", 40),
        visit("a6", "is.skaftafell", 70, mandatory=False),
    ]

    # 01 REROUTE — wind closes exposed coastal hop a1→a2
    p = base_problem(
        op="REROUTE",
        evidence="ev-wind-01",
        nodes=deepcopy(south),
        constraints=[
            depot_fixed(),
            edge_forbidden(
                "wind-edge-0",
                "a1",
                "a2",
                "ROAD1-coast",
                "weather.wind.coast_gust.ROAD1",
            ),
        ],
    )
    add(
        "01_coast_gust_reroute_a1_a2",
        "Coast gust — REROUTE avoid a1→a2",
        p,
        notes=["canonical weather.wind projection → EDGE_FORBIDDEN"],
    )

    # 02 SWAP — same forbid, local swap preferred
    p = base_problem(
        op="SWAP",
        evidence="ev-wind-02",
        nodes=deepcopy(south),
        constraints=[
            depot_fixed(),
            edge_forbidden(
                "wind-edge-0",
                "a1",
                "a2",
                "ROAD1-coast",
                "weather.wind.coast_gust.ROAD1",
            ),
        ],
    )
    add(
        "02_coast_gust_swap_a1_a2",
        "Coast gust — SWAP avoid a1→a2",
        p,
        max_changed=4,
        notes=["Repair locality: churn-first SWAP ranking"],
    )

    # 03 SHIFT — wait out morning gale (later outdoor TW)
    nodes = [
        depot(),
        visit("a1", "is.reynisfjara", 60, tw=(600, 1200)),
        visit("a2", "is.dyrholaey", 45, tw=(620, 1200)),
        visit("a3", "is.vik", 40, tw=(640, 1200)),
        visit("a4", "is.skogafoss", 55, tw=(660, 1200)),
        visit("a5", "is.seljalandsfoss", 55, tw=(680, 1200)),
    ]
    p = base_problem(
        op="SHIFT",
        evidence="ev-wind-03",
        nodes=nodes,
        constraints=[depot_fixed()],
    )
    add(
        "03_morning_gale_shift_tw",
        "Morning gale — SHIFT later outdoor windows",
        p,
        max_changed=3,
        notes=["no EDGE_FORBIDDEN; TW start delayed vs base morning"],
    )

    # 04 REROUTE mid-edge a3→a4 (peninsula wind)
    nodes = [
        depot(),
        visit("a1", "is.seljalandsfoss", 50),
        visit("a2", "is.skogafoss", 50),
        visit("a3", "is.dyrholaey", 45),
        visit("a4", "is.reynisfjara", 50),
        visit("a5", "is.vik", 40),
        visit("a6", "is.skaftafell", 60, mandatory=False),
    ]
    p = base_problem(
        op="REROUTE",
        evidence="ev-wind-04",
        nodes=nodes,
        constraints=[
            depot_fixed(),
            edge_forbidden(
                "wind-edge-mid",
                "a3",
                "a4",
                "ROAD-peninsula",
                "weather.wind.peninsula.ROAD-p",
            ),
        ],
    )
    add(
        "04_peninsula_reroute_mid_edge",
        "Peninsula wind — REROUTE forbid a3→a4",
        p,
    )

    # 05 dual EDGE_FORBIDDEN
    p = base_problem(
        op="REROUTE",
        evidence="ev-wind-05",
        nodes=deepcopy(south),
        constraints=[
            depot_fixed(),
            edge_forbidden(
                "wind-edge-0",
                "a1",
                "a2",
                "ROAD1-coast",
                "weather.wind.coast_gust.ROAD1",
            ),
            edge_forbidden(
                "wind-edge-1",
                "a4",
                "a5",
                "ROAD-vik",
                "weather.wind.coast_gust.ROAD-vik",
            ),
        ],
    )
    add(
        "05_dual_gust_reroute",
        "Dual coastal gust — REROUTE two forbidden edges",
        p,
    )

    # 06 SWAP 6-POI local
    p = base_problem(
        op="SWAP",
        evidence="ev-wind-06",
        nodes=deepcopy(south),
        constraints=[
            depot_fixed(),
            edge_forbidden(
                "wind-edge-0",
                "a2",
                "a3",
                "ROAD-cliff",
                "weather.wind.cliff.ROAD-cliff",
            ),
        ],
    )
    add(
        "06_south6_swap_local",
        "South coast 6-POI — SWAP local wind avoid",
        p,
        max_changed=4,
    )

    # 07 REPLACE Dyrhólaey → indoor museum alt
    nodes = deepcopy(south)
    nodes.append(
        visit(
            "is.vik_museum_alt",
            "is.vik_museum_alt",
            50,
            mandatory=False,
            can_remove=True,
        )
    )
    # make a3 the exposed cliff (dyrholaey)
    p = base_problem(
        op="REPLACE",
        evidence="ev-wind-07",
        nodes=nodes,
        constraints=[
            depot_fixed(),
            replace_pool("a3", "is.vik_museum_alt"),
        ],
        matrix=matrix_chain([n["nodeId"] for n in nodes]),
    )
    add(
        "07_dyrholaey_replace_indoor",
        "Dyrhólaey unsafe wind — REPLACE to Vík museum alt",
        p,
        max_changed=3,
        notes=["REPLACE_POOL a3→is.vik_museum_alt"],
    )

    # 08 REPLACE Reynisfjara → sheltered lagoon viewpoint
    nodes = [
        depot(),
        visit("a1", "is.reynisfjara", 60, mandatory=False, can_remove=True),
        visit("a2", "is.vik", 40),
        visit("a3", "is.skogafoss", 55),
        visit("a4", "is.seljalandsfoss", 55),
        visit("a5", "is.dyrholaey", 45, mandatory=False),
        visit(
            "is.jokulsarlon_view_alt",
            "is.jokulsarlon_view_alt",
            55,
            mandatory=False,
            can_remove=True,
        ),
    ]
    p = base_problem(
        op="REPLACE",
        evidence="ev-wind-08",
        nodes=nodes,
        constraints=[
            depot_fixed(),
            replace_pool("a1", "is.jokulsarlon_view_alt"),
        ],
        matrix=matrix_chain([n["nodeId"] for n in nodes]),
    )
    add(
        "08_reynisfjara_replace_shelter",
        "Reynisfjara wave/wind — REPLACE to sheltered viewpoint alt",
        p,
        max_changed=3,
    )

    # 09 booked indoor lunch pin + SWAP around forbid
    nodes = [
        depot(),
        visit("a1", "is.seljalandsfoss", 50),
        visit("a2", "is.skogafoss", 50),
        visit(
            "a3",
            "is.lunch_booking",
            60,
            booked=True,
            mandatory=True,
            can_remove=False,
            fixed_start=600,
        ),
        visit("a4", "is.reynisfjara", 50, mandatory=False),
        visit("a5", "is.vik", 40),
    ]
    p = base_problem(
        op="SWAP",
        evidence="ev-wind-09",
        nodes=nodes,
        constraints=[
            depot_fixed(),
            edge_forbidden(
                "wind-edge-0",
                "a1",
                "a2",
                "ROAD1-coast",
                "weather.wind.coast_gust.ROAD1",
            ),
        ],
    )
    add(
        "09_booked_lunch_pin_preserved",
        "Wind reorder — booked lunch pin preserved",
        p,
        max_changed=4,
        notes=["require booked a3 in all candidates"],
    )

    # 10 SHORTEN overpacked storm day
    nodes = [
        depot(),
        visit("a1", "is.seljalandsfoss", 90),
        visit("a2", "is.skogafoss", 80),
        visit("a3", "is.reynisfjara", 70),
        visit("a4", "is.dyrholaey", 60, mandatory=False, can_remove=True),
        visit("a5", "is.vik", 50),
        visit("a6", "is.skaftafell", 90, mandatory=False, can_remove=True),
    ]
    # inflate matrix travel so day is tight
    ids = [n["nodeId"] for n in nodes]
    mat = matrix_chain(ids, step=35)
    p = base_problem(
        op="SHORTEN",
        evidence="ev-wind-10",
        nodes=nodes,
        constraints=[depot_fixed()],
        matrix=mat,
    )
    add(
        "10_storm_shorten_overpacked",
        "Storm day overpacked — SHORTEN drop optional outdoors",
        p,
        max_changed=3,
    )


def write_all() -> None:
    PROBLEMS.mkdir(parents=True, exist_ok=True)
    manifest_entries = []
    for sid, title, max_changed, problem, notes in SCENARIOS:
        scen_id = f"iceland.wind.{sid}"
        prob_name = f"{sid}.problem.json"
        scen_name = f"{sid}.scenario.json"
        (PROBLEMS / prob_name).write_text(
            json.dumps(problem, indent=2) + "\n", encoding="utf-8"
        )
        scen = {
            "schemaId": SCHEMA_S,
            "scenarioId": scen_id,
            "status": "active",
            "countryCode": "IS",
            "family": "wind",
            "title": title,
            "seed": 42,
            "stabilityRuns": 20,
            "solverProblemRef": (
                "src/decision-runtime/solver/lab/gold/scenarios/iceland/wind/"
                f"problems/{prob_name}"
            ),
            "notes": notes,
            "provenance": "synthetic_template_v1",
        }
        if max_changed is not None:
            scen["maxChangedActivities"] = max_changed
        (WIND / scen_name).write_text(
            json.dumps(scen, indent=2) + "\n", encoding="utf-8"
        )
        manifest_entries.append(
            {
                "scenarioId": scen_id,
                "path": f"scenarios/iceland/wind/{scen_name}",
                "status": "active",
                "family": "wind",
            }
        )
        print("wrote", scen_id)

    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    # drop wind stubs; keep other families
    kept = [s for s in man["scenarios"] if s.get("family") != "wind"]
    # insert wind after road_close block
    road = [s for s in kept if s.get("family") == "road_close"]
    rest = [s for s in kept if s.get("family") != "road_close"]
    man["scenarios"] = road + manifest_entries + rest
    man["windActiveCount"] = len(manifest_entries)
    MANIFEST.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    print("manifest updated, wind=", len(manifest_entries))


if __name__ == "__main__":
    build()
    write_all()
