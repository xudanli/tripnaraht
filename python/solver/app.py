#!/usr/bin/env python3
"""
TripNARA OR-Tools Solver Service (ADR-008).

Non-authoritative candidate generation only.
Never writes Plan Version / Effective Plan.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cp_sat_shift_solver import is_native_cpsat_enabled
from move_day_solver import is_move_day_enabled
from routing_solver import ENGINE_VERSION, solve
from solver_models import MVP_OPERATIONS, SolverProblem, SolverResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ortools-solver")

app = FastAPI(
    title="TripNARA OR-Tools Solver",
    description=(
        "Non-authoritative SHIFT/SWAP/REROUTE/SHORTEN/REPLACE (+ MOVE_DAY when flagged) "
        "provider (ADR-008)"
    ),
    version=ENGINE_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "ortools-solver",
        "version": ENGINE_VERSION,
        "mvpOperations": sorted(MVP_OPERATIONS),
        "moveDayShadowEnabled": is_move_day_enabled(),
        "nativeCpSatEnabled": is_native_cpsat_enabled(),
        # Global claim stays false — only SHIFT responses may set nativeCpSat when path runs
        "nativeCpSat": False,
        "engine": "OR_TOOLS_ROUTING",
        "writeAuthority": False,
    }


@app.post("/v1/solve", response_model=SolverResponse)
def post_solve(problem: SolverProblem) -> SolverResponse:
    logger.info(
        "solve requestId=%s tripId=%s op=%s nodes=%d",
        problem.requestId,
        problem.tripId,
        problem.operation,
        len(problem.nodes),
    )
    response = solve(problem)
    logger.info(
        "solve done requestId=%s status=%s candidates=%d elapsedMs=%d nativeCpSat=%s",
        response.requestId,
        response.status,
        len(response.candidates),
        response.solverMeta.elapsedMs,
        response.solverMeta.nativeCpSat,
    )
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8091, reload=False)
