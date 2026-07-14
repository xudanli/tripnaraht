#!/usr/bin/env python3
"""Generate iceland/blue_ice synthetic gold (10 active). Not authoritative."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAM = ROOT / "scenarios" / "iceland" / "blue_ice"
PROBLEMS = FAM / "problems"
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
        "requestId": "req-fixture-blue-ice",
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


def glacier_day() -> list[dict]:
    return [
        depot(),
        visit("a1", "is.skaftafell", 70),
        visit("a2", "is.svinafellsjokull", 90, mandatory=False),
        visit("a3", "is.jokulsarlon", 80),
        visit("a4", "is.diamond_beach", 45),
        visit("a5", "is.fjallsarlon", 60, mandatory=False),
        visit("a6", "is.hofn", 40),
    ]


def build() -> None:
    g = glacier_day()

    # 01 REROUTE — trailhead approach closed
    add(
        "01_trailhead_reroute_a1_a2",
        "Glacier trailhead closed — REROUTE avoid a1→a2",
        base_problem(
            op="REROUTE",
            evidence="ev-ice-01",
            nodes=deepcopy(g),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "ice-edge-0",
                    "a1",
                    "a2",
                    "TRAIL-Skaftafell",
                    "glacier.access.closed.trail_skaftafell",
                ),
            ],
        ),
        notes=["blue_ice / glacier access → EDGE_FORBIDDEN projection"],
    )

    # 02 SWAP
    add(
        "02_trailhead_swap_a1_a2",
        "Glacier trailhead closed — SWAP avoid a1→a2",
        base_problem(
            op="SWAP",
            evidence="ev-ice-02",
            nodes=deepcopy(g),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "ice-edge-0",
                    "a1",
                    "a2",
                    "TRAIL-Skaftafell",
                    "glacier.access.closed.trail_skaftafell",
                ),
            ],
        ),
        max_changed=4,
    )

    # 03 SHIFT — delayed guide start
    nodes = [
        depot(),
        visit("a1", "is.svinafellsjokull", 90, tw=(600, 1200)),
        visit("a2", "is.skaftafell", 60, tw=(620, 1200)),
        visit("a3", "is.jokulsarlon", 70, tw=(640, 1200)),
        visit("a4", "is.diamond_beach", 40, tw=(660, 1200)),
        visit("a5", "is.hofn", 40, tw=(680, 1200)),
    ]
    add(
        "03_guide_delay_shift_tw",
        "Blue-ice guide delayed — SHIFT later TW",
        base_problem(
            op="SHIFT",
            evidence="ev-ice-03",
            nodes=nodes,
            constraints=[depot_fixed()],
        ),
        max_changed=3,
    )

    # 04 REROUTE mid lagoon approach
    add(
        "04_lagoon_reroute_mid_edge",
        "Lagoon ice shelf unsafe — REROUTE forbid a3→a4",
        base_problem(
            op="REROUTE",
            evidence="ev-ice-04",
            nodes=deepcopy(g),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "ice-edge-mid",
                    "a3",
                    "a4",
                    "LAGOON-approach",
                    "glacier.access.closed.lagoon_approach",
                ),
            ],
        ),
    )

    # 05 dual forbid
    add(
        "05_dual_access_reroute",
        "Dual glacier access closed — REROUTE two edges",
        base_problem(
            op="REROUTE",
            evidence="ev-ice-05",
            nodes=deepcopy(g),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "ice-edge-0",
                    "a1",
                    "a2",
                    "TRAIL-Skaftafell",
                    "glacier.access.closed.trail_skaftafell",
                ),
                edge_forbidden(
                    "ice-edge-1",
                    "a3",
                    "a5",
                    "FJALLS-approach",
                    "glacier.access.closed.fjallsarlon",
                ),
            ],
        ),
    )

    # 06 SWAP local 6
    add(
        "06_glacier6_swap_local",
        "Glacier day 6-POI — SWAP local around closed hop",
        base_problem(
            op="SWAP",
            evidence="ev-ice-06",
            nodes=deepcopy(g),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "ice-edge-0",
                    "a2",
                    "a3",
                    "ICE-road",
                    "glacier.access.closed.ice_road",
                ),
            ],
        ),
        max_changed=4,
    )

    # 07 REPLACE glacier hike → visitor center
    nodes = deepcopy(g)
    nodes.append(
        visit(
            "is.skaftafell_visitor_alt",
            "is.skaftafell_visitor_alt",
            50,
            mandatory=False,
            can_remove=True,
        )
    )
    add(
        "07_blue_ice_hike_replace_vc",
        "Blue-ice hike cancelled — REPLACE to visitor-center alt",
        base_problem(
            op="REPLACE",
            evidence="ev-ice-07",
            nodes=nodes,
            constraints=[
                depot_fixed(),
                replace_pool("a2", "is.skaftafell_visitor_alt"),
            ],
            matrix=matrix_chain([n["nodeId"] for n in nodes]),
        ),
        max_changed=3,
        notes=["REPLACE_POOL a2→is.skaftafell_visitor_alt"],
    )

    # 08 REPLACE Jökulsárlón boat → shore viewpoint
    nodes = [
        depot(),
        visit("a1", "is.jokulsarlon", 80, mandatory=False, can_remove=True),
        visit("a2", "is.diamond_beach", 45),
        visit("a3", "is.fjallsarlon", 55, mandatory=False),
        visit("a4", "is.skaftafell", 60),
        visit("a5", "is.hofn", 40),
        visit(
            "is.jokulsarlon_shore_alt",
            "is.jokulsarlon_shore_alt",
            50,
            mandatory=False,
            can_remove=True,
        ),
    ]
    add(
        "08_lagoon_boat_replace_shore",
        "Lagoon boat cancelled — REPLACE to shore viewpoint alt",
        base_problem(
            op="REPLACE",
            evidence="ev-ice-08",
            nodes=nodes,
            constraints=[
                depot_fixed(),
                replace_pool("a1", "is.jokulsarlon_shore_alt"),
            ],
            matrix=matrix_chain([n["nodeId"] for n in nodes]),
        ),
        max_changed=3,
    )

    # 09 booked guide briefing pin
    nodes = [
        depot(),
        visit("a1", "is.skaftafell", 50),
        visit("a2", "is.svinafellsjokull", 80, mandatory=False),
        visit(
            "a3",
            "is.guide_briefing",
            45,
            booked=True,
            mandatory=True,
            can_remove=False,
            fixed_start=600,
        ),
        visit("a4", "is.jokulsarlon", 70),
        visit("a5", "is.diamond_beach", 40),
    ]
    add(
        "09_booked_briefing_pin_preserved",
        "Ice access reorder — booked guide briefing pin preserved",
        base_problem(
            op="SWAP",
            evidence="ev-ice-09",
            nodes=nodes,
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "ice-edge-0",
                    "a1",
                    "a2",
                    "TRAIL-Skaftafell",
                    "glacier.access.closed.trail_skaftafell",
                ),
            ],
        ),
        max_changed=4,
        notes=["require booked a3"],
    )

    # 10 SHORTEN when ice day overpacked
    nodes = [
        depot(),
        visit("a1", "is.skaftafell", 90),
        visit("a2", "is.svinafellsjokull", 100, mandatory=False, can_remove=True),
        visit("a3", "is.jokulsarlon", 80),
        visit("a4", "is.diamond_beach", 50),
        visit("a5", "is.fjallsarlon", 70, mandatory=False, can_remove=True),
        visit("a6", "is.hofn", 45),
    ]
    ids = [n["nodeId"] for n in nodes]
    add(
        "10_ice_day_shorten_overpacked",
        "Ice-access day overpacked — SHORTEN drop optional glacier",
        base_problem(
            op="SHORTEN",
            evidence="ev-ice-10",
            nodes=nodes,
            constraints=[depot_fixed()],
            matrix=matrix_chain(ids, step=35),
        ),
        max_changed=3,
    )


def write_all() -> None:
    PROBLEMS.mkdir(parents=True, exist_ok=True)
    manifest_entries = []
    for sid, title, max_changed, problem, notes in SCENARIOS:
        scen_id = f"iceland.blue_ice.{sid}"
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
            "family": "blue_ice",
            "title": title,
            "seed": 42,
            "stabilityRuns": 20,
            "solverProblemRef": (
                "src/decision-runtime/solver/lab/gold/scenarios/iceland/blue_ice/"
                f"problems/{prob_name}"
            ),
            "notes": notes,
            "provenance": "synthetic_template_v1",
        }
        if max_changed is not None:
            scen["maxChangedActivities"] = max_changed
        (FAM / scen_name).write_text(
            json.dumps(scen, indent=2) + "\n", encoding="utf-8"
        )
        manifest_entries.append(
            {
                "scenarioId": scen_id,
                "path": f"scenarios/iceland/blue_ice/{scen_name}",
                "status": "active",
                "family": "blue_ice",
            }
        )
        print("wrote", scen_id)

    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    kept = [s for s in man["scenarios"] if s.get("family") != "blue_ice"]
    # keep family order: road_close, wind, blue_ice, then stubs
    ordered: list[dict] = []
    for fam in ("road_close", "wind", "blue_ice"):
        ordered.extend([s for s in kept if s.get("family") == fam])
    ordered.extend(manifest_entries)
    ordered.extend(
        [
            s
            for s in kept
            if s.get("family") not in ("road_close", "wind", "blue_ice")
        ]
    )
    man["scenarios"] = ordered
    man["blueIceActiveCount"] = len(manifest_entries)
    MANIFEST.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    print("manifest updated, blue_ice=", len(manifest_entries))


if __name__ == "__main__":
    build()
    write_all()
