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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TripDetailAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripDetailAgentService = void 0;
const common_1 = require("@nestjs/common");
const detail_understand_status_skill_1 = require("../../skills/detail/detail-understand-status.skill");
const detail_analyze_health_skill_1 = require("../../skills/detail/detail-analyze-health.skill");
const detail_explain_decision_skill_1 = require("../../skills/detail/detail-explain-decision.skill");
const detail_show_evidence_skill_1 = require("../../skills/detail/detail-show-evidence.skill");
const persona_shell_service_1 = require("./persona-shell.service");
let TripDetailAgentService = TripDetailAgentService_1 = class TripDetailAgentService {
    constructor(detailUnderstandStatus, detailAnalyzeHealth, detailExplainDecision, detailShowEvidence, personaShell) {
        this.detailUnderstandStatus = detailUnderstandStatus;
        this.detailAnalyzeHealth = detailAnalyzeHealth;
        this.detailExplainDecision = detailExplainDecision;
        this.detailShowEvidence = detailShowEvidence;
        this.personaShell = personaShell;
        this.logger = new common_1.Logger(TripDetailAgentService_1.name);
    }
    async execute(request) {
        this.logger.debug(`执行行程详情页 Agent: tripId=${request.tripId}, action=${request.action}`);
        try {
            const tripData = {};
            const planState = null;
            const detailState = {
                tripId: request.tripId,
                health: {
                    overall: 'healthy',
                    dimensions: {
                        schedule: { status: 'healthy', score: 100, issues: [] },
                        budget: { status: 'healthy', score: 100, issues: [] },
                        pace: { status: 'healthy', score: 100, issues: [] },
                        feasibility: { status: 'healthy', score: 100, issues: [] },
                    },
                },
                statusUnderstanding: {
                    currentPhase: 'PLANNING',
                    progress: { completed: 0, total: 0, percentage: 0 },
                    nextSteps: [],
                    risks: [],
                    opportunities: [],
                },
                decisionExplanations: [],
                evidence: [],
                lastUpdated: new Date().toISOString(),
            };
            const uiOutput = {};
            if (request.action === 'get_status' || request.action === 'get_full') {
                if (this.detailUnderstandStatus) {
                    const statusResult = await this.detailUnderstandStatus.execute({
                        tripId: request.tripId,
                        tripData,
                    });
                    detailState.statusUnderstanding = statusResult.statusUnderstanding;
                    uiOutput.status = statusResult.statusUnderstanding;
                }
            }
            if (request.action === 'get_health' || request.action === 'get_full') {
                if (this.detailAnalyzeHealth) {
                    const healthResult = await this.detailAnalyzeHealth.execute({
                        tripId: request.tripId,
                        tripData,
                        planState,
                    });
                    detailState.health = healthResult.health;
                    uiOutput.health = healthResult.health;
                }
            }
            if (request.action === 'explain_decisions' || request.action === 'get_full') {
                if (this.detailExplainDecision) {
                    const explainResult = await this.detailExplainDecision.execute({
                        tripId: request.tripId,
                        decisionId: request.decisionId,
                    });
                    detailState.decisionExplanations = explainResult.explanations;
                    uiOutput.explanations = explainResult.explanations;
                }
            }
            if (request.action === 'show_evidence' || request.action === 'get_full') {
                if (this.detailShowEvidence) {
                    const evidenceResult = await this.detailShowEvidence.execute({
                        tripId: request.tripId,
                        evidenceRefs: request.evidenceRefs,
                        planState,
                    });
                    detailState.evidence = evidenceResult.evidence;
                    uiOutput.evidence = evidenceResult.evidence;
                }
            }
            return {
                detailState,
                uiOutput,
            };
        }
        catch (error) {
            this.logger.error(`行程详情页 Agent 执行失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.TripDetailAgentService = TripDetailAgentService;
exports.TripDetailAgentService = TripDetailAgentService = TripDetailAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [detail_understand_status_skill_1.DetailUnderstandStatusSkill,
        detail_analyze_health_skill_1.DetailAnalyzeHealthSkill,
        detail_explain_decision_skill_1.DetailExplainDecisionSkill,
        detail_show_evidence_skill_1.DetailShowEvidenceSkill,
        persona_shell_service_1.PersonaShellService])
], TripDetailAgentService);
//# sourceMappingURL=trip-detail-agent.service.js.map