"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryOrchestrationMetrics = void 0;
const common_1 = require("@nestjs/common");
let InMemoryOrchestrationMetrics = class InMemoryOrchestrationMetrics {
    constructor() {
        this.modeCounts = new Map();
        this.riskCounts = new Map();
        this.consentTriggers = [];
        this.recommendationVsExecution = [];
    }
    recordMode(mode, requestId) {
        this.modeCounts.set(mode, (this.modeCounts.get(mode) || 0) + 1);
    }
    recordRisk(risk, requestId) {
        this.riskCounts.set(risk, (this.riskCounts.get(risk) || 0) + 1);
    }
    recordConsent(triggered, requestId, reason) {
        this.consentTriggers.push(triggered);
    }
    recordRecommendationVsExecution(recommendedSM, actualMode, requestId) {
        this.recommendationVsExecution.push({ recommendedSM, actualMode });
    }
    getMetricsSummary() {
        const total = Array.from(this.modeCounts.values()).reduce((a, b) => a + b, 0);
        const modeDistribution = {
            LEGACY: this.modeCounts.get('LEGACY') || 0,
            CLAUDE_DYNAMIC: this.modeCounts.get('CLAUDE_DYNAMIC') || 0,
            CLAUDE_SM: this.modeCounts.get('CLAUDE_SM') || 0,
        };
        const riskDistribution = {
            LOW: this.riskCounts.get('LOW') || 0,
            MEDIUM: this.riskCounts.get('MEDIUM') || 0,
            HIGH: this.riskCounts.get('HIGH') || 0,
            CRITICAL: this.riskCounts.get('CRITICAL') || 0,
        };
        const consentTriggerRate = this.consentTriggers.length > 0
            ? this.consentTriggers.filter(Boolean).length / this.consentTriggers.length
            : 0;
        const recommended = this.recommendationVsExecution.filter(r => r.recommendedSM).length;
        const executed = this.recommendationVsExecution.filter(r => r.recommendedSM && r.actualMode === 'CLAUDE_SM').length;
        const accuracy = recommended > 0 ? executed / recommended : 0;
        return {
            modeDistribution,
            riskDistribution,
            consentTriggerRate,
            smRecommendationAccuracy: {
                recommended,
                executed,
                accuracy,
            },
        };
    }
};
exports.InMemoryOrchestrationMetrics = InMemoryOrchestrationMetrics;
exports.InMemoryOrchestrationMetrics = InMemoryOrchestrationMetrics = __decorate([
    (0, common_1.Injectable)()
], InMemoryOrchestrationMetrics);
//# sourceMappingURL=orchestration-metrics.util.js.map