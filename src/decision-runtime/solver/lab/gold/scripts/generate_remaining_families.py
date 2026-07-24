#!/usr/bin/env python3
"""Generate parking_full / hotel_change / reservation_delay synthetic gold (10 each)."""

from __future__ import annotations

import sys
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _gold_common import (  # noqa: E402
    base_problem,
    depot,
    depot_fixed,
    edge_forbidden,
    matrix_chain,
    replace_pool,
    visit,
    write_family,
)


def south_hot() -> list[dict]:
    return [
        depot(),
        visit("a1", "is.blue_lagoon", 90, mandatory=False),
        visit("a2", "is.seljalandsfoss", 55),
        visit("a3", "is.skogafoss", 55),
        visit("a4", "is.reynisfjara", 50),
        visit("a5", "is.vik", 40),
        visit("a6", "is.skaftafell", 60, mandatory=False),
    ]


def build_parking() -> list[tuple[str, str, int | None, dict, list[str]]]:
    out: list[tuple[str, str, int | None, dict, list[str]]] = []
    s = south_hot()
    pref = "park"

    def add(sid, title, problem, max_changed=None, notes=None):
        out.append((sid, title, max_changed, problem, notes or []))

    # 01 REROUTE — jammed approach treated as forbidden hop
    add(
        "01_bluelagoon_approach_reroute",
        "Blue Lagoon parking full — REROUTE avoid a1→a2 approach queue",
        base_problem(
            op="REROUTE",
            evidence="ev-park-01",
            nodes=deepcopy(s),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "park-edge-0",
                    "a1",
                    "a2",
                    "PARK-BL-queue",
                    "parking.full.blue_lagoon.approach",
                ),
            ],
            request_prefix=pref,
        ),
        notes=["parking full projected as EDGE_FORBIDDEN on queued approach"],
    )

    add(
        "02_bluelagoon_approach_swap",
        "Blue Lagoon parking full — SWAP avoid a1→a2",
        base_problem(
            op="SWAP",
            evidence="ev-park-02",
            nodes=deepcopy(s),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "park-edge-0",
                    "a1",
                    "a2",
                    "PARK-BL-queue",
                    "parking.full.blue_lagoon.approach",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
    )

    # 03 SHIFT — arrive after peak
    nodes = [
        depot(),
        visit("a1", "is.blue_lagoon", 90, tw=(660, 1200), mandatory=False),
        visit("a2", "is.seljalandsfoss", 55, tw=(680, 1200)),
        visit("a3", "is.skogafoss", 55, tw=(700, 1200)),
        visit("a4", "is.reynisfjara", 50, tw=(720, 1200)),
        visit("a5", "is.vik", 40, tw=(740, 1200)),
    ]
    add(
        "03_peak_avoid_shift_tw",
        "Peak parking — SHIFT later arrival windows",
        base_problem(
            op="SHIFT",
            evidence="ev-park-03",
            nodes=nodes,
            constraints=[depot_fixed()],
            request_prefix=pref,
        ),
        max_changed=3,
    )

    add(
        "04_skogafoss_lot_reroute_mid",
        "Skógafoss lot full — REROUTE forbid a2→a3",
        base_problem(
            op="REROUTE",
            evidence="ev-park-04",
            nodes=deepcopy(s),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "park-edge-mid",
                    "a2",
                    "a3",
                    "PARK-Skoga",
                    "parking.full.skogafoss.lot",
                ),
            ],
            request_prefix=pref,
        ),
    )

    add(
        "05_dual_lot_reroute",
        "Dual lots full — REROUTE two forbidden edges",
        base_problem(
            op="REROUTE",
            evidence="ev-park-05",
            nodes=deepcopy(s),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "park-edge-0",
                    "a1",
                    "a2",
                    "PARK-BL-queue",
                    "parking.full.blue_lagoon.approach",
                ),
                edge_forbidden(
                    "park-edge-1",
                    "a4",
                    "a5",
                    "PARK-Reynisfjara",
                    "parking.full.reynisfjara.lot",
                ),
            ],
            request_prefix=pref,
        ),
    )

    add(
        "06_south6_swap_local",
        "South coast lots — SWAP local around full lot hop",
        base_problem(
            op="SWAP",
            evidence="ev-park-06",
            nodes=deepcopy(s),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "park-edge-0",
                    "a3",
                    "a4",
                    "PARK-mid",
                    "parking.full.south_coast.mid",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
    )

    # 07 REPLACE Blue Lagoon → Sky Lagoon alt
    nodes = deepcopy(s)
    nodes.append(
        visit(
            "is.sky_lagoon_alt",
            "is.sky_lagoon_alt",
            80,
            mandatory=False,
            can_remove=True,
        )
    )
    add(
        "07_bluelagoon_replace_skylagoon",
        "Blue Lagoon lot full — REPLACE to Sky Lagoon alt",
        base_problem(
            op="REPLACE",
            evidence="ev-park-07",
            nodes=nodes,
            constraints=[depot_fixed(), replace_pool("a1", "is.sky_lagoon_alt")],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes]),
        ),
        max_changed=3,
        notes=["REPLACE_POOL a1→is.sky_lagoon_alt"],
    )

    # 08 REPLACE Seljalandsfoss → Gljúfrabúi / lower lot alt
    nodes = [
        depot(),
        visit("a1", "is.seljalandsfoss", 55, mandatory=False, can_remove=True),
        visit("a2", "is.skogafoss", 55),
        visit("a3", "is.reynisfjara", 50),
        visit("a4", "is.vik", 40),
        visit("a5", "is.dyrholaey", 45, mandatory=False),
        visit(
            "is.gljufrabui_alt",
            "is.gljufrabui_alt",
            50,
            mandatory=False,
            can_remove=True,
        ),
    ]
    add(
        "08_seljalandsfoss_replace_gljufrabui",
        "Seljalandsfoss lot full — REPLACE to Gljúfrabúi alt",
        base_problem(
            op="REPLACE",
            evidence="ev-park-08",
            nodes=nodes,
            constraints=[depot_fixed(), replace_pool("a1", "is.gljufrabui_alt")],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes]),
        ),
        max_changed=3,
    )

    # 09 booked spa slot pin
    nodes = [
        depot(),
        visit("a1", "is.seljalandsfoss", 50),
        visit("a2", "is.skogafoss", 50),
        visit(
            "a3",
            "is.blue_lagoon_booking",
            90,
            booked=True,
            mandatory=True,
            can_remove=False,
            fixed_start=660,
        ),
        visit("a4", "is.reynisfjara", 45, mandatory=False),
        visit("a5", "is.vik", 40),
    ]
    add(
        "09_booked_spa_pin_preserved",
        "Parking chaos — booked spa slot pin preserved",
        base_problem(
            op="SWAP",
            evidence="ev-park-09",
            nodes=nodes,
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "park-edge-0",
                    "a1",
                    "a2",
                    "PARK-south",
                    "parking.full.south_coast.mid",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
        notes=["require booked a3"],
    )

    nodes = [
        depot(),
        visit("a1", "is.blue_lagoon", 100, mandatory=False, can_remove=True),
        visit("a2", "is.seljalandsfoss", 80),
        visit("a3", "is.skogafoss", 70),
        visit("a4", "is.reynisfjara", 60),
        visit("a5", "is.vik", 50),
        visit("a6", "is.dyrholaey", 55, mandatory=False, can_remove=True),
    ]
    add(
        "10_peak_day_shorten_overpacked",
        "Peak lot day overpacked — SHORTEN drop optional crowded POIs",
        base_problem(
            op="SHORTEN",
            evidence="ev-park-10",
            nodes=nodes,
            constraints=[depot_fixed()],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes], step=35),
        ),
        max_changed=3,
    )
    return out


def build_hotel() -> list[tuple[str, str, int | None, dict, list[str]]]:
    """Single-day hotel-anchor shadow (M2 MOVE_DAY still blocked)."""
    out: list[tuple[str, str, int | None, dict, list[str]]] = []
    pref = "hotel"

    def add(sid, title, problem, max_changed=None, notes=None):
        out.append((sid, title, max_changed, problem, notes or []))

    # Day activities near Vik lodging → hop forbid when lodging shifts southwest
    day = [
        depot(),
        visit("a1", "is.vik_hotel_breakfast", 30, booked=True, fixed_start=510),
        visit("a2", "is.reynisfjara", 50),
        visit("a3", "is.dyrholaey", 45, mandatory=False),
        visit("a4", "is.skogafoss", 55),
        visit("a5", "is.seljalandsfoss", 55),
        visit("a6", "is.vik", 40, mandatory=False),
    ]

    add(
        "01_lodge_shift_reroute_a2_a3",
        "Hotel change southwest — REROUTE forbid stale a2→a3 hop",
        base_problem(
            op="REROUTE",
            evidence="ev-hotel-01",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "hotel-edge-0",
                    "a2",
                    "a3",
                    "LEGACY-vik-loop",
                    "hotel.change.anchor.stale_hop",
                ),
            ],
            request_prefix=pref,
        ),
        notes=["single-day proxy; MOVE_DAY not used"],
    )

    add(
        "02_lodge_shift_swap",
        "Hotel change — SWAP local around stale hop",
        base_problem(
            op="SWAP",
            evidence="ev-hotel-02",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "hotel-edge-0",
                    "a2",
                    "a3",
                    "LEGACY-vik-loop",
                    "hotel.change.anchor.stale_hop",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
    )

    nodes = [
        depot(),
        visit("a1", "is.vik_hotel_breakfast", 30, booked=True, fixed_start=540),
        visit("a2", "is.reynisfjara", 50, tw=(560, 1200)),
        visit("a3", "is.skogafoss", 55, tw=(580, 1200)),
        visit("a4", "is.seljalandsfoss", 55, tw=(600, 1200)),
        visit("a5", "is.vik", 40, tw=(620, 1200)),
    ]
    add(
        "03_late_checkout_shift_tw",
        "Late hotel checkout — SHIFT day windows",
        base_problem(
            op="SHIFT",
            evidence="ev-hotel-03",
            nodes=nodes,
            constraints=[depot_fixed()],
            request_prefix=pref,
        ),
        max_changed=3,
    )

    add(
        "04_new_lodge_reroute_mid",
        "New lodge mid-loop — REROUTE forbid a3→a4",
        base_problem(
            op="REROUTE",
            evidence="ev-hotel-04",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "hotel-edge-mid",
                    "a3",
                    "a4",
                    "LEGACY-east",
                    "hotel.change.anchor.mid_loop",
                ),
            ],
            request_prefix=pref,
        ),
    )

    add(
        "05_dual_stale_hop_reroute",
        "Hotel change — REROUTE dual stale hops",
        base_problem(
            op="REROUTE",
            evidence="ev-hotel-05",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "hotel-edge-0",
                    "a2",
                    "a3",
                    "LEGACY-vik-loop",
                    "hotel.change.anchor.stale_hop",
                ),
                edge_forbidden(
                    "hotel-edge-1",
                    "a5",
                    "a6",
                    "LEGACY-vik-return",
                    "hotel.change.anchor.stale_return",
                ),
            ],
            request_prefix=pref,
        ),
    )

    add(
        "06_lodge_day_swap_local",
        "Hotel-proximate day — SWAP local",
        base_problem(
            op="SWAP",
            evidence="ev-hotel-06",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "hotel-edge-0",
                    "a4",
                    "a5",
                    "LEGACY-west",
                    "hotel.change.anchor.west_hop",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
    )

    # 07 REPLACE far POI with nearer lodge-neighbor
    nodes = deepcopy(day)
    nodes.append(
        visit(
            "is.vik_church_alt",
            "is.vik_church_alt",
            35,
            mandatory=False,
            can_remove=True,
        )
    )
    # a5 seljalandsfoss becomes distant after hotel move → replace
    add(
        "07_far_poi_replace_near_lodge",
        "Hotel moved — REPLACE distant POI with Vík church alt",
        base_problem(
            op="REPLACE",
            evidence="ev-hotel-07",
            nodes=nodes,
            constraints=[depot_fixed(), replace_pool("a5", "is.vik_church_alt")],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes]),
        ),
        max_changed=3,
    )

    nodes = [
        depot(),
        visit("a1", "is.skaftafell", 70, mandatory=False, can_remove=True),
        visit("a2", "is.vik_hotel_breakfast", 30, booked=True, fixed_start=510),
        visit("a3", "is.reynisfjara", 50),
        visit("a4", "is.dyrholaey", 45),
        visit("a5", "is.vik", 40),
        visit(
            "is.vik_black_beach_walk_alt",
            "is.vik_black_beach_walk_alt",
            40,
            mandatory=False,
            can_remove=True,
        ),
    ]
    add(
        "08_east_day_replace_local_walk",
        "Hotel now in Vík — REPLACE far glacier with local walk alt",
        base_problem(
            op="REPLACE",
            evidence="ev-hotel-08",
            nodes=nodes,
            constraints=[
                depot_fixed(),
                replace_pool("a1", "is.vik_black_beach_walk_alt"),
            ],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes]),
        ),
        max_changed=3,
    )

    add(
        "09_booked_breakfast_pin_preserved",
        "Hotel reorder — booked breakfast pin preserved",
        base_problem(
            op="SWAP",
            evidence="ev-hotel-09",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "hotel-edge-0",
                    "a2",
                    "a3",
                    "LEGACY-vik-loop",
                    "hotel.change.anchor.stale_hop",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
        notes=["require booked a1 breakfast"],
    )

    nodes = [
        depot(),
        visit("a1", "is.vik_hotel_breakfast", 40, booked=True, fixed_start=510),
        visit("a2", "is.reynisfjara", 70),
        visit("a3", "is.dyrholaey", 60),
        visit("a4", "is.skogafoss", 80),
        visit("a5", "is.seljalandsfoss", 80, mandatory=False, can_remove=True),
        visit("a6", "is.skaftafell", 90, mandatory=False, can_remove=True),
    ]
    add(
        "10_lodge_day_shorten_overpacked",
        "Hotel day overpacked — SHORTEN drop optional distant legs",
        base_problem(
            op="SHORTEN",
            evidence="ev-hotel-10",
            nodes=nodes,
            constraints=[depot_fixed()],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes], step=35),
        ),
        max_changed=3,
    )
    return out


def build_reservation() -> list[tuple[str, str, int | None, dict, list[str]]]:
    out: list[tuple[str, str, int | None, dict, list[str]]] = []
    pref = "resv"

    def add(sid, title, problem, max_changed=None, notes=None):
        out.append((sid, title, max_changed, problem, notes or []))

    # reservation at a3 with fixed late start; approaches before it can be forbidden/
    # or just SHIFT/SWAP/SHORTEN around lateness
    day = [
        depot(),
        visit("a1", "is.seljalandsfoss", 50),
        visit("a2", "is.skogafoss", 50),
        visit(
            "a3",
            "is.lava_show_booking",
            75,
            booked=True,
            mandatory=True,
            can_remove=False,
            fixed_start=720,
        ),
        visit("a4", "is.reynisfjara", 45, mandatory=False),
        visit("a5", "is.vik", 40),
        visit("a6", "is.dyrholaey", 40, mandatory=False),
    ]

    add(
        "01_late_show_reroute_pre",
        "Reservation delayed — REROUTE avoid a1→a2 pre-leg squeeze",
        base_problem(
            op="REROUTE",
            evidence="ev-resv-01",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "resv-edge-0",
                    "a1",
                    "a2",
                    "PRE-show",
                    "reservation.delay.pre_leg.squeeze",
                ),
            ],
            request_prefix=pref,
        ),
        notes=["booked late show at a3; pin required"],
    )

    add(
        "02_late_show_swap_pre",
        "Reservation delayed — SWAP pre-legs",
        base_problem(
            op="SWAP",
            evidence="ev-resv-02",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "resv-edge-0",
                    "a1",
                    "a2",
                    "PRE-show",
                    "reservation.delay.pre_leg.squeeze",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
    )

    nodes = [
        depot(),
        visit("a1", "is.seljalandsfoss", 45, tw=(480, 700)),
        visit("a2", "is.skogafoss", 45, tw=(500, 710)),
        visit(
            "a3",
            "is.lava_show_booking",
            75,
            booked=True,
            mandatory=True,
            can_remove=False,
            fixed_start=740,
            tw=(740, 820),
        ),
        visit("a4", "is.reynisfjara", 40, tw=(820, 1200)),
        visit("a5", "is.vik", 35, tw=(860, 1200)),
    ]
    add(
        "03_last_entry_shift_tw",
        "Last-entry slipped — SHIFT around late reservation",
        base_problem(
            op="SHIFT",
            evidence="ev-resv-03",
            nodes=nodes,
            constraints=[depot_fixed()],
            request_prefix=pref,
        ),
        max_changed=3,
    )

    add(
        "04_post_show_reroute_mid",
        "Post-show lag — REROUTE forbid a3→a4 immediate exit jam",
        base_problem(
            op="REROUTE",
            evidence="ev-resv-04",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "resv-edge-mid",
                    "a3",
                    "a4",
                    "POST-show",
                    "reservation.delay.post_leg.jam",
                ),
            ],
            request_prefix=pref,
        ),
    )

    add(
        "05_dual_buffer_reroute",
        "Buffer fail — REROUTE dual forbidden edges around show",
        base_problem(
            op="REROUTE",
            evidence="ev-resv-05",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "resv-edge-0",
                    "a1",
                    "a2",
                    "PRE-show",
                    "reservation.delay.pre_leg.squeeze",
                ),
                edge_forbidden(
                    "resv-edge-1",
                    "a3",
                    "a4",
                    "POST-show",
                    "reservation.delay.post_leg.jam",
                ),
            ],
            request_prefix=pref,
        ),
    )

    add(
        "06_show_day_swap_local",
        "Show day — SWAP local around reservation",
        base_problem(
            op="SWAP",
            evidence="ev-resv-06",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "resv-edge-0",
                    "a4",
                    "a5",
                    "POST-coast",
                    "reservation.delay.post_coast",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
    )

    # 07 REPLACE optional post activity with shorter alt when late
    nodes = deepcopy(day)
    nodes.append(
        visit(
            "is.vik_cafe_alt",
            "is.vik_cafe_alt",
            30,
            mandatory=False,
            can_remove=True,
        )
    )
    add(
        "07_late_replace_short_alt",
        "Running late — REPLACE optional post-leg with café alt",
        base_problem(
            op="REPLACE",
            evidence="ev-resv-07",
            nodes=nodes,
            constraints=[depot_fixed(), replace_pool("a6", "is.vik_cafe_alt")],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes]),
        ),
        max_changed=3,
    )

    nodes = [
        depot(),
        visit("a1", "is.seljalandsfoss", 50),
        visit("a2", "is.skogafoss", 50),
        visit(
            "a3",
            "is.lava_show_booking",
            75,
            booked=True,
            mandatory=True,
            can_remove=False,
            fixed_start=720,
        ),
        visit("a4", "is.reynisfjara", 50, mandatory=False, can_remove=True),
        visit("a5", "is.vik", 40),
        visit(
            "is.vik_bakery_alt",
            "is.vik_bakery_alt",
            25,
            mandatory=False,
            can_remove=True,
        ),
    ]
    add(
        "08_beach_replace_bakery",
        "Delay after show — REPLACE beach with bakery alt",
        base_problem(
            op="REPLACE",
            evidence="ev-resv-08",
            nodes=nodes,
            constraints=[depot_fixed(), replace_pool("a4", "is.vik_bakery_alt")],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes]),
        ),
        max_changed=3,
    )

    add(
        "09_booked_show_pin_preserved",
        "Day reorder — booked show pin preserved",
        base_problem(
            op="SWAP",
            evidence="ev-resv-09",
            nodes=deepcopy(day),
            constraints=[
                depot_fixed(),
                edge_forbidden(
                    "resv-edge-0",
                    "a1",
                    "a2",
                    "PRE-show",
                    "reservation.delay.pre_leg.squeeze",
                ),
            ],
            request_prefix=pref,
        ),
        max_changed=4,
        notes=["require booked a3"],
    )

    nodes = [
        depot(),
        visit("a1", "is.seljalandsfoss", 70),
        visit("a2", "is.skogafoss", 70),
        visit(
            "a3",
            "is.lava_show_booking",
            90,
            booked=True,
            mandatory=True,
            can_remove=False,
            fixed_start=700,
        ),
        visit("a4", "is.reynisfjara", 60, mandatory=False, can_remove=True),
        visit("a5", "is.dyrholaey", 55, mandatory=False, can_remove=True),
        visit("a6", "is.vik", 45),
    ]
    add(
        "10_delay_shorten_overpacked",
        "Reservation delay overpacked — SHORTEN drop optional posts",
        base_problem(
            op="SHORTEN",
            evidence="ev-resv-10",
            nodes=nodes,
            constraints=[depot_fixed()],
            request_prefix=pref,
            matrix=matrix_chain([n["nodeId"] for n in nodes], step=35),
        ),
        max_changed=3,
    )
    return out


def main() -> None:
    write_family(
        "parking_full",
        build_parking(),
        count_key="parkingFullActiveCount",
    )
    write_family(
        "hotel_change",
        build_hotel(),
        count_key="hotelChangeActiveCount",
    )
    write_family(
        "reservation_delay",
        build_reservation(),
        count_key="reservationDelayActiveCount",
    )


if __name__ == "__main__":
    main()
