"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ExplainableOutputService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExplainableOutputService = void 0;
const common_1 = require("@nestjs/common");
let ExplainableOutputService = ExplainableOutputService_1 = class ExplainableOutputService {
    constructor() {
        this.logger = new common_1.Logger(ExplainableOutputService_1.name);
    }
    async generateExplanation(decisionLog, evidenceRefs, modelVersion, traceId) {
        this.logger.debug(`[ExplainableOutput] 生成决策解释: traceId=${traceId}, decisionLogLength=${decisionLog.length}`);
        const summary = this.generateSummary(decisionLog);
        const decisionProcess = this.generateDecisionProcess(decisionLog);
        const evidenceChain = this.buildEvidenceChain(evidenceRefs);
        const visualization = this.generateVisualization(decisionLog);
        const explanation = {
            summary,
            decision_process: decisionProcess,
            evidence_chain: evidenceChain,
            visualization,
            metadata: {
                model_version: modelVersion,
                trace_id: traceId,
                generated_at: new Date().toISOString(),
            },
        };
        this.logger.log(`[ExplainableOutput] 决策解释已生成: traceId=${traceId}`);
        return explanation;
    }
    generateSummary(decisionLog) {
        if (decisionLog.length === 0) {
            return '无决策记录';
        }
        const mainDecision = decisionLog[decisionLog.length - 1];
        const actor = mainDecision.actor || 'System';
        const step = mainDecision.step || 'unknown';
        return `${actor}在${step}步骤做出了${mainDecision.outputs_summary || '决策'}。`;
    }
    generateDecisionProcess(decisionLog) {
        const steps = decisionLog.map((entry, index) => {
            var _a;
            return ({
                step_name: entry.step || `Step ${index + 1}`,
                decision: entry.outputs_summary || 'N/A',
                reasoning: entry.inputs_summary || 'N/A',
                confidence: ((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.confidence) || 0.5,
            });
        });
        return { steps };
    }
    buildEvidenceChain(evidenceRefs) {
        return evidenceRefs.map((ref) => {
            var _a;
            return ({
                evidence_id: ref.evidence_id,
                evidence_type: ref.source || 'UNKNOWN',
                evidence_content: ref.excerpt || ((_a = ref.data) === null || _a === void 0 ? void 0 : _a.toString()) || 'N/A',
                relevance: ref.relevance || ref.confidence || 0.5,
            });
        });
    }
    generateVisualization(decisionLog) {
        const nodes = decisionLog.map((entry, index) => {
            var _a;
            return ({
                id: `node_${index}`,
                label: entry.step || `Decision ${index + 1}`,
                actor: entry.actor || 'System',
                decision: entry.outputs_summary || 'N/A',
                confidence: ((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.confidence) || 0.5,
            });
        });
        const edges = decisionLog
            .slice(1)
            .map((_, index) => ({
            from: `node_${index}`,
            to: `node_${index + 1}`,
        }));
        return {
            type: 'DECISION_TREE',
            data: {
                nodes,
                edges,
            },
        };
    }
    generateUserFriendlyExplanation(explanation) {
        const parts = [];
        parts.push(`## 决策摘要\n${explanation.summary}\n`);
        parts.push('## 决策过程');
        for (const step of explanation.decision_process.steps) {
            parts.push(`### ${step.step_name}\n- **决策**: ${step.decision}\n- **推理**: ${step.reasoning}\n- **置信度**: ${(step.confidence * 100).toFixed(0)}%\n`);
        }
        if (explanation.evidence_chain.length > 0) {
            parts.push('## 证据链');
            for (const evidence of explanation.evidence_chain.slice(0, 5)) {
                parts.push(`- **${evidence.evidence_type}**: ${evidence.evidence_content.substring(0, 100)}... (相关性: ${(evidence.relevance * 100).toFixed(0)}%)`);
            }
        }
        return parts.join('\n');
    }
};
exports.ExplainableOutputService = ExplainableOutputService;
exports.ExplainableOutputService = ExplainableOutputService = ExplainableOutputService_1 = __decorate([
    (0, common_1.Injectable)()
], ExplainableOutputService);
//# sourceMappingURL=explainable-output.service.js.map