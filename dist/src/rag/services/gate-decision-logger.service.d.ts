import { PrismaService } from '../../prisma/prisma.service';
import { ChunkRetrievalResult } from './chunk-retrieval.service';
export declare enum GateResult {
    ALLOW = "ALLOW",
    ADJUST_REQUIRED = "ADJUST_REQUIRED",
    BLOCK = "BLOCK",
    NEED_USER_CONFIRM = "NEED_USER_CONFIRM"
}
export declare enum ViolationType {
    REACHABILITY = "REACHABILITY",
    SAFETY = "SAFETY",
    DEM = "DEM",
    DATA_MISSING = "DATA_MISSING",
    SEASONAL = "SEASONAL",
    WEATHER = "WEATHER",
    ROAD_CLOSURE = "ROAD_CLOSURE",
    VEHICLE_CAPABILITY = "VEHICLE_CAPABILITY",
    FATIGUE = "FATIGUE"
}
export declare enum ViolationSeverity {
    HARD = "HARD",
    SOFT = "SOFT"
}
export declare enum AdjustmentAction {
    CHANGE_MODE = "CHANGE_MODE",
    CHANGE_DATES = "CHANGE_DATES",
    SHORTEN_DAY = "SHORTEN_DAY",
    REPLACE_SEGMENT = "REPLACE_SEGMENT",
    REPLACE_POI = "REPLACE_POI",
    ADD_BUFFER = "ADD_BUFFER",
    CHANGE_ROUTE = "CHANGE_ROUTE",
    ADD_REST = "ADD_REST",
    UPGRADE_VEHICLE = "UPGRADE_VEHICLE"
}
export declare enum WorkflowStep {
    INTAKE = "INTAKE",
    RESEARCH = "RESEARCH",
    GATE_EVAL = "GATE_EVAL",
    PLAN_GEN = "PLAN_GEN",
    VERIFY = "VERIFY",
    REPAIR = "REPAIR",
    NARRATE = "NARRATE",
    DONE = "DONE",
    FAILED = "FAILED"
}
export declare enum Actor {
    Orchestrator = "Orchestrator",
    Planner = "Planner",
    Gatekeeper = "Gatekeeper",
    Compliance = "Compliance",
    LocalInsight = "LocalInsight",
    CoreDecision = "CoreDecision",
    Narrator = "Narrator"
}
export interface Violation {
    type: ViolationType;
    severity: ViolationSeverity;
    detail: string;
    affectedSegment?: string;
}
export interface RequiredAdjustment {
    action: AdjustmentAction;
    why: string;
    priority?: number;
    alternatives?: string[];
}
export interface EvidenceRef {
    evidence_id: string;
    source: string;
    last_verified_at: string;
    confidence: number;
    url?: string;
    excerpt?: string;
}
export interface ToolCall {
    tool_name: string;
    input: any;
    output: any;
    output_summary?: string;
    latency_ms?: number;
    success: boolean;
    error?: string;
}
export interface GateEvaluation {
    gate_result: GateResult;
    confidence: number;
    violations: Violation[];
    required_adjustments: RequiredAdjustment[];
    alternatives?: Alternative[];
    ragChunks?: ChunkRetrievalResult[];
    toolCalls?: ToolCall[];
}
export interface Alternative {
    description: string;
    type: 'ROUTE' | 'POI' | 'DATES' | 'MODE';
    details: any;
    confidence?: number;
}
export interface DecisionLogEntry {
    request_id: string;
    step: WorkflowStep;
    actor: Actor;
    timestamp: string;
    inputs_summary: {
        route?: any;
        constraints?: any;
        query?: string;
        [key: string]: any;
    };
    outputs_summary: {
        gate_result?: GateResult;
        confidence?: number;
        violations?: Violation[];
        required_adjustments?: RequiredAdjustment[];
        alternatives?: Alternative[];
        [key: string]: any;
    };
    evidence_refs: EvidenceRef[];
    retrieval_trace?: {
        rag_chunks: Array<{
            chunk_id: string;
            similarity: number;
            text_preview: string;
            source_file?: string;
        }>;
        tool_calls: Array<{
            tool_name: string;
            input: any;
            output_summary: string;
            latency_ms?: number;
            success: boolean;
        }>;
    };
    metadata?: {
        latency_ms?: number;
        [key: string]: any;
    };
}
export declare class GateDecisionLoggerService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    logGateDecision(requestId: string, gateEval: GateEvaluation, evidenceRefs: EvidenceRef[], metadata?: {
        latency_ms?: number;
        [key: string]: any;
    }): Promise<void>;
    logWorkflowStep(requestId: string, step: WorkflowStep, actor: Actor, inputs: any, outputs: any, evidenceRefs?: EvidenceRef[], metadata?: any): Promise<void>;
    private saveDecisionLog;
    getDecisionLogs(params: {
        requestId?: string;
        step?: WorkflowStep;
        actor?: Actor;
        startDate?: Date;
        endDate?: Date;
        gateResult?: GateResult;
        limit?: number;
        offset?: number;
    }): Promise<{
        logs: DecisionLogEntry[];
        total: number;
    }>;
    getDecisionChain(requestId: string): Promise<DecisionLogEntry[]>;
    analyzeGateQuality(params?: {
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }): Promise<{
        totalDecisions: number;
        byResult: Record<GateResult, number>;
        averageConfidence: number;
        averageEvidenceCount: number;
        averageViolationsCount: number;
        topViolationTypes: Array<{
            type: ViolationType;
            count: number;
        }>;
        topAdjustmentActions: Array<{
            action: AdjustmentAction;
            count: number;
        }>;
    }>;
    createEvidenceRefsFromChunks(chunks: ChunkRetrievalResult[], confidence?: number): EvidenceRef[];
    createEvidenceRefsFromTools(toolCalls: ToolCall[], confidence?: number): EvidenceRef[];
}
