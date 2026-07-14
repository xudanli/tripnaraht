"""Pydantic wire models — align with src/decision-runtime/solver/contracts (ADR-008)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


SolverRepairOperation = Literal[
    "SHIFT", "SWAP", "SHORTEN", "REPLACE", "MOVE_DAY", "REROUTE"
]
MVP_OPERATIONS = frozenset({"SHIFT", "SWAP", "REROUTE", "SHORTEN", "REPLACE"})

SolverStatus = Literal["SOLVED", "PARTIAL", "INFEASIBLE", "TIMEOUT", "ERROR"]
SolverEngine = Literal["OR_TOOLS_ROUTING", "OR_TOOLS_CP_SAT"]

# Align with TS SolverConstraintKind / SolverObjectiveKind (PLANNING_IR_FREEZE)
SolverConstraintKind = Literal[
    "TIME_WINDOW",
    "FIXED_START",
    "BOOKED_PIN",
    "EDGE_FORBIDDEN",
    "MAX_DAY_DRIVE_MIN",
    "DEPOT_FIXED",
    "REPLACE_POOL",
]
SolverObjectiveKind = Literal[
    "MINIMIZE_TRAVEL",
    "MINIMIZE_LATENESS",
    "MAXIMIZE_PRESERVE_BASE",
    "MINIMIZE_CHANGES",
]

SOLVER_PROBLEM_SCHEMA_ID = "tripnara.solver_problem@v1"
SOLVER_RESPONSE_SCHEMA_ID = "tripnara.solver_response@v1"


class SolverTimeWindow(BaseModel):
    startMin: int
    endMin: int


class OptimizationNode(BaseModel):
    nodeId: str
    sourceActivityId: Optional[str] = None
    poiId: Optional[str] = None
    serviceDurationMin: int
    timeWindows: list[SolverTimeWindow]
    fixedStartMin: Optional[int] = None
    lastEntryMin: Optional[int] = None
    isMandatory: bool = True
    isBooked: bool = False
    canRemove: bool = False
    canMoveDay: bool = False
    # Base day membership for MOVE_DAY (M2); single-day paths ignore.
    assignedDayId: Optional[str] = None


class TravelMatrix(BaseModel):
    nodeIds: list[str]
    costsMin: list[list[int]]


class SolverConstraint(BaseModel):
    constraintId: str
    kind: SolverConstraintKind
    canonicalConstraintId: Optional[str] = None
    hard: bool = True
    payload: dict[str, Any] = Field(default_factory=dict)


class SolverObjective(BaseModel):
    objectiveId: str
    kind: SolverObjectiveKind
    weight: float = 1.0


class SolverConfig(BaseModel):
    maxCandidates: int = 3
    timeLimitMs: int = 2000
    seed: int = 42
    # MOVE_DAY locality: max activities moved across days (default 3).
    maxMovedActivities: int = 3


class SolverDayAnchor(BaseModel):
    dayId: str
    anchorNodeId: str


class SolverDayCapacity(BaseModel):
    dayId: str
    maxDriveMin: Optional[int] = None
    maxServiceMin: Optional[int] = None
    maxActivities: Optional[int] = None


class SolverProblemScope(BaseModel):
    dayIds: list[str]
    activityIds: Optional[list[str]] = None
    dayAnchors: Optional[list[SolverDayAnchor]] = None
    dayCapacities: Optional[list[SolverDayCapacity]] = None


class SolverProblem(BaseModel):
    schemaId: Literal["tripnara.solver_problem@v1"] = SOLVER_PROBLEM_SCHEMA_ID
    requestId: str
    tripId: str
    planVersionId: str
    evidenceVersionId: Optional[str] = None
    snapshotId: Optional[str] = None
    operation: SolverRepairOperation
    scope: SolverProblemScope
    nodes: list[OptimizationNode]
    travelMatrix: TravelMatrix
    constraints: list[SolverConstraint] = Field(default_factory=list)
    objectives: list[SolverObjective] = Field(default_factory=list)
    solverConfig: SolverConfig = Field(default_factory=SolverConfig)


class SolverDayPlan(BaseModel):
    dayId: str
    nodeIds: list[str]
    startMin: Optional[list[int]] = None


class SolverCandidateDiffHint(BaseModel):
    shiftedActivityIds: Optional[list[str]] = None
    swappedPairs: Optional[list[dict[str, str]]] = None
    removedActivityIds: Optional[list[str]] = None
    addedPoiIds: Optional[list[str]] = None
    movedDayPairs: Optional[list[dict[str, str]]] = None


class SolverCandidate(BaseModel):
    candidateId: str
    operation: SolverRepairOperation
    label: str
    dayPlans: list[SolverDayPlan]
    objectiveValue: Optional[float] = None
    diffHint: Optional[SolverCandidateDiffHint] = None
    satisfiedSolverConstraintIds: Optional[list[str]] = None


class SolverMeta(BaseModel):
    engine: SolverEngine
    version: str
    strategy: str
    nativeCpSat: bool
    seed: int
    elapsedMs: int


class SolverResponse(BaseModel):
    schemaId: Literal["tripnara.solver_response@v1"] = SOLVER_RESPONSE_SCHEMA_ID
    requestId: str
    status: SolverStatus
    candidates: list[SolverCandidate]
    solverMeta: SolverMeta
    message: Optional[str] = None
