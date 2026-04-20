#!/usr/bin/env python3
"""Phase 2.2 / 2.4 / 3: POST calibration samples to route_and_run; print JSON array of summary rows.

Phase 2.4: unresolvedAnchorReasons + phase24_decision.
Phase 3: retrievedAnchorRate + anchorSources (per-anchor retrieved | matched_existing | fallback).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

API = os.environ.get("POI_CALIBRATION_API", "http://127.0.0.1:3000/api/agent/route_and_run")
TRIP_ID = os.environ.get("POI_CALIBRATION_TRIP_ID", "trip-cal-gc-phase22")

SAMPLES: list[tuple[str, str]] = [
    ("1_gc_normal_600", "2026-08-01 冰岛雷克雅未克出发黄金圈一日游，自驾，可用时间600分钟，正常节奏 normal pace"),
    ("2_gc_relaxed_600", "2026-08-01 冰岛雷克雅未克出发黄金圈一日游，自驾，可用时间600分钟，宽松节奏 relaxed pace"),
    ("3_gc_tight_360", "2026-08-01 冰岛雷克雅未克出发黄金圈一日游，自驾，可用时间360分钟，紧凑行程 dense pace"),
    ("4_gc_must_secret_lagoon", "2026-08-01 冰岛黄金圈一日游，自驾，600分钟，必须包含秘密温泉 Secret Lagoon"),
    ("5_gc_exclude_kerid", "2026-08-01 冰岛黄金圈一日游，自驾，600分钟，排除凯里斯火山口 Kerið crater"),
    ("6_gc_region_keyword", "2026-08-01 按 region golden_circle 规划冰岛黄金圈一日，雷克雅未克出发，600分钟"),
    ("7_no_gc_reykjavik", "2026-08-01 冰岛雷克雅未克市区一日游，步行逛市区，不含黄金圈"),
    ("8_repeat_like_1", "2026-08-01 冰岛雷克雅未克出发黄金圈一日游，自驾，可用时间600分钟，正常节奏 normal pace"),
]


def post_sample(label: str, message: str, request_id: str) -> dict:
    body = {
        "request_id": request_id,
        "user_id": "anonymous",
        "trip_id": TRIP_ID,
        "message": message,
        "structured_travel_input": {"destination": "Reykjavik, Iceland", "origin": "Reykjavik"},
        "options": {
            "max_seconds": 120,
            "max_steps": 24,
            "use_claude_orchestration": True,
            "use_state_machine_orchestration": True,
            "allow_partial": True,
        },
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def phase24_decision(coverage: float | None, unresolved: dict | None) -> str:
    """单条样本：healthy | retrieval | resolve（Phase 2.4 唯一判别，可再加 unknown）。"""
    if coverage is not None and coverage >= 1:
        return "healthy"
    if not unresolved:
        return "unknown"
    vals = list(unresolved.values())
    nt = vals.count("not_in_topn")
    nu = vals.count("name_unresolved")
    su = vals.count("slug_unmatched")
    if nt > nu + su:
        return "retrieval"
    if nu + su > nt:
        return "resolve"
    # 平局：有解析类则偏 resolve，否则偏 retrieval
    return "resolve" if (nu + su) > 0 else "retrieval"


def summarize(label: str, d: dict) -> dict:
    obs = d.get("observability") or {}
    pp = obs.get("poi_planning") or {}
    out = pp.get("outcome") or {}
    ps = out.get("poiSelection") or {}
    metrics = ps.get("metrics") or {}
    cov = metrics.get("anchorCoverage") or {}
    coverage = cov.get("rate")
    unresolved = ps.get("unresolvedAnchorReasons")
    return {
        "label": label,
        "request_id": d.get("request_id"),
        "result_status": (d.get("result") or {}).get("status"),
        "current_step": obs.get("current_step"),
        "noPoiPlanning": metrics.get("noPoiPlanning"),
        "regionId": pp.get("regionId"),
        "matchedBy": (pp.get("resolution") or {}).get("matchedBy") if isinstance(pp.get("resolution"), dict) else None,
        "feasibility": pp.get("feasibility"),
        "coverage": coverage,
        "required_anchors": cov.get("required"),
        "overflow": (metrics.get("optionalOverflow") or {}).get("overflow"),
        "leakage_n": len((metrics.get("excludedLeakage") or {}).get("leaked") or []),
        "budget_gate_ok": metrics.get("budgetGateCorrect"),
        "fallbackRate": ps.get("fallbackRate"),
        "topAnchorRanks": ps.get("topAnchorRanks"),
        "unresolvedAnchorReasons": unresolved,
        "phase24_decision": phase24_decision(
            coverage if isinstance(coverage, (int, float)) else None,
            unresolved if isinstance(unresolved, dict) else None,
        ),
        "retrievedAnchorRate": ps.get("retrievedAnchorRate"),
        "anchorSources": ps.get("anchorSources"),
    }


def main() -> int:
    import time

    rows: list[dict] = []
    for label, msg in SAMPLES:
        rid = f"cal-p22-{int(time.time() * 1000)}-{label}"
        try:
            raw = post_sample(label, msg, rid)
            rows.append(summarize(label, raw))
        except Exception as e:
            rows.append({"label": label, "error": str(e)})
        time.sleep(0.3)
    json.dump(rows, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
