"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var GateDecisionLoggerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GateDecisionLoggerService = exports.Actor = exports.WorkflowStep = exports.AdjustmentAction = exports.ViolationSeverity = exports.ViolationType = exports.GateResult = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
var GateResult;
(function (GateResult) {
    GateResult["ALLOW"] = "ALLOW";
    GateResult["ADJUST_REQUIRED"] = "ADJUST_REQUIRED";
    GateResult["BLOCK"] = "BLOCK";
    GateResult["NEED_USER_CONFIRM"] = "NEED_USER_CONFIRM";
})(GateResult || (exports.GateResult = GateResult = {}));
var ViolationType;
(function (ViolationType) {
    ViolationType["REACHABILITY"] = "REACHABILITY";
    ViolationType["SAFETY"] = "SAFETY";
    ViolationType["DEM"] = "DEM";
    ViolationType["DATA_MISSING"] = "DATA_MISSING";
    ViolationType["SEASONAL"] = "SEASONAL";
    ViolationType["WEATHER"] = "WEATHER";
    ViolationType["ROAD_CLOSURE"] = "ROAD_CLOSURE";
    ViolationType["VEHICLE_CAPABILITY"] = "VEHICLE_CAPABILITY";
    ViolationType["FATIGUE"] = "FATIGUE";
})(ViolationType || (exports.ViolationType = ViolationType = {}));
var ViolationSeverity;
(function (ViolationSeverity) {
    ViolationSeverity["HARD"] = "HARD";
    ViolationSeverity["SOFT"] = "SOFT";
})(ViolationSeverity || (exports.ViolationSeverity = ViolationSeverity = {}));
var AdjustmentAction;
(function (AdjustmentAction) {
    AdjustmentAction["CHANGE_MODE"] = "CHANGE_MODE";
    AdjustmentAction["CHANGE_DATES"] = "CHANGE_DATES";
    AdjustmentAction["SHORTEN_DAY"] = "SHORTEN_DAY";
    AdjustmentAction["REPLACE_SEGMENT"] = "REPLACE_SEGMENT";
    AdjustmentAction["REPLACE_POI"] = "REPLACE_POI";
    AdjustmentAction["ADD_BUFFER"] = "ADD_BUFFER";
    AdjustmentAction["CHANGE_ROUTE"] = "CHANGE_ROUTE";
    AdjustmentAction["ADD_REST"] = "ADD_REST";
    AdjustmentAction["UPGRADE_VEHICLE"] = "UPGRADE_VEHICLE";
})(AdjustmentAction || (exports.AdjustmentAction = AdjustmentAction = {}));
var WorkflowStep;
(function (WorkflowStep) {
    WorkflowStep["INTAKE"] = "INTAKE";
    WorkflowStep["RESEARCH"] = "RESEARCH";
    WorkflowStep["GATE_EVAL"] = "GATE_EVAL";
    WorkflowStep["PLAN_GEN"] = "PLAN_GEN";
    WorkflowStep["VERIFY"] = "VERIFY";
    WorkflowStep["REPAIR"] = "REPAIR";
    WorkflowStep["NARRATE"] = "NARRATE";
    WorkflowStep["DONE"] = "DONE";
    WorkflowStep["FAILED"] = "FAILED";
})(WorkflowStep || (exports.WorkflowStep = WorkflowStep = {}));
var Actor;
(function (Actor) {
    Actor["Orchestrator"] = "Orchestrator";
    Actor["Planner"] = "Planner";
    Actor["Gatekeeper"] = "Gatekeeper";
    Actor["Compliance"] = "Compliance";
    Actor["LocalInsight"] = "LocalInsight";
    Actor["CoreDecision"] = "CoreDecision";
    Actor["Narrator"] = "Narrator";
})(Actor || (exports.Actor = Actor = {}));
let GateDecisionLoggerService = GateDecisionLoggerService_1 = class GateDecisionLoggerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GateDecisionLoggerService_1.name);
    }
    async logGateDecision(requestId, gateEval, evidenceRefs, metadata) {
        try {
            const decisionLog = {
                request_id: requestId,
                step: WorkflowStep.GATE_EVAL,
                actor: Actor.Gatekeeper,
                timestamp: new Date().toISOString(),
                inputs_summary: {},
                outputs_summary: {
                    gate_result: gateEval.gate_result,
                    confidence: gateEval.confidence,
                    violations: gateEval.violations,
                    required_adjustments: gateEval.required_adjustments,
                    alternatives: gateEval.alternatives,
                },
                evidence_refs: evidenceRefs,
                retrieval_trace: {
                    rag_chunks: (gateEval.ragChunks || []).map((chunk) => ({
                        chunk_id: chunk.chunkId,
                        similarity: chunk.similarity,
                        text_preview: chunk.content.substring(0, 200),
                        source_file: chunk.sourceFile,
                    })),
                    tool_calls: (gateEval.toolCalls || []).map((call) => ({
                        tool_name: call.tool_name,
                        input: call.input,
                        output_summary: call.output_summary || JSON.stringify(call.output).substring(0, 500),
                        latency_ms: call.latency_ms,
                        success: call.success,
                    })),
                },
                metadata,
            };
            await this.saveDecisionLog(decisionLog);
            this.logger.log(`[GateDecisionLogger] 记录决策: requestId=${requestId}, result=${gateEval.gate_result}, confidence=${gateEval.confidence.toFixed(2)}, violations=${gateEval.violations.length}`);
        }
        catch (error) {
            this.logger.error(`[GateDecisionLogger] 记录失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async logWorkflowStep(requestId, step, actor, inputs, outputs, evidenceRefs, metadata) {
        try {
            const decisionLog = {
                request_id: requestId,
                step,
                actor,
                timestamp: new Date().toISOString(),
                inputs_summary: inputs,
                outputs_summary: outputs,
                evidence_refs: evidenceRefs || [],
                metadata,
            };
            await this.saveDecisionLog(decisionLog);
            this.logger.debug(`[DecisionLogger] 记录步骤: requestId=${requestId}, step=${step}, actor=${actor}`);
        }
        catch (error) {
            this.logger.error(`[DecisionLogger] 记录失败: ${error.message}`, error.stack);
        }
    }
    async saveDecisionLog(log) {
        var _a;
        await this.prisma.ragDecisionLog.create({
            data: {
                requestId: log.request_id,
                step: log.step,
                actor: log.actor,
                timestamp: new Date(log.timestamp),
                inputsSummary: log.inputs_summary,
                outputsSummary: log.outputs_summary,
                evidenceRefs: JSON.parse(JSON.stringify(log.evidence_refs)),
                retrievalTrace: log.retrieval_trace,
                metadata: log.metadata,
            },
        });
        this.logger.log(`[DecisionLog] ${JSON.stringify({
            request_id: log.request_id,
            step: log.step,
            actor: log.actor,
            gate_result: log.outputs_summary.gate_result,
            violations_count: ((_a = log.outputs_summary.violations) === null || _a === void 0 ? void 0 : _a.length) || 0,
            evidence_count: log.evidence_refs.length,
        })}`);
    }
    async getDecisionLogs(params) {
        return {
            logs: [],
            total: 0,
        };
    }
    async getDecisionChain(requestId) {
        return [];
    }
    async analyzeGateQuality(params) {
        return {
            totalDecisions: 0,
            byResult: {
                [GateResult.ALLOW]: 0,
                [GateResult.ADJUST_REQUIRED]: 0,
                [GateResult.BLOCK]: 0,
                [GateResult.NEED_USER_CONFIRM]: 0,
            },
            averageConfidence: 0,
            averageEvidenceCount: 0,
            averageViolationsCount: 0,
            topViolationTypes: [],
            topAdjustmentActions: [],
        };
    }
    createEvidenceRefsFromChunks(chunks, confidence) {
        return chunks.map((chunk) => ({
            evidence_id: chunk.chunkId,
            source: `RAG: ${chunk.sourceFile || 'unknown'}`,
            last_verified_at: new Date().toISOString(),
            confidence: confidence || chunk.similarity,
            excerpt: chunk.content.substring(0, 200),
        }));
    }
    createEvidenceRefsFromTools(toolCalls, confidence) {
        return toolCalls
            .filter((call) => call.success)
            .map((call) => ({
            evidence_id: `tool_${call.tool_name}_${Date.now()}`,
            source: `Tool: ${call.tool_name}`,
            last_verified_at: new Date().toISOString(),
            confidence: confidence || 0.9,
            excerpt: call.output_summary || JSON.stringify(call.output).substring(0, 200),
        }));
    }
};
exports.GateDecisionLoggerService = GateDecisionLoggerService;
exports.GateDecisionLoggerService = GateDecisionLoggerService = GateDecisionLoggerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GateDecisionLoggerService);
//# sourceMappingURL=gate-decision-logger.service.js.map