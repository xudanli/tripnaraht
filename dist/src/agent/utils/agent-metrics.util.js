"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsRecorder = exports.AgentMetrics = void 0;
exports.extractMetricsFromResponse = extractMetricsFromResponse;
exports.AgentMetrics = {
    entryPointDistribution: {
        name: 'agent_entry_point_distribution',
        labels: ['entry_point'],
        description: '不同入口来源的请求分布',
    },
    readonlyModeUsage: {
        name: 'agent_readonly_mode_usage_rate',
        description: '只读模式使用率',
    },
    redirectTriggerRate: {
        name: 'agent_redirect_trigger_rate',
        labels: ['redirect_reason', 'entry_point'],
        description: '重定向触发率',
    },
    clarificationTriggerRate: {
        name: 'agent_clarification_trigger_rate',
        labels: ['error_type'],
        description: '澄清消息触发率',
    },
    decisionLogCompleteness: {
        name: 'agent_decision_log_completeness',
        description: '决策日志完整性（包含 evidence_refs 的占比）',
    },
    orchestrationModeDistribution: {
        name: 'agent_orchestration_mode_distribution',
        labels: ['mode'],
        description: '编排模式分布',
    },
    riskDistribution: {
        name: 'agent_risk_distribution',
        labels: ['risk'],
        description: '风险级别分布',
    },
};
function extractMetricsFromResponse(response) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const metrics = {};
    if ((_a = response.observability) === null || _a === void 0 ? void 0 : _a.trace) {
        const trace = response.observability.trace;
        if ((_d = (_c = (_b = trace.orchestration) === null || _b === void 0 ? void 0 : _b.flags) === null || _c === void 0 ? void 0 : _c.options) === null || _d === void 0 ? void 0 : _d.entry_point) {
            metrics.entry_point = trace.orchestration.flags.options.entry_point;
        }
        if (((_g = (_f = (_e = trace.orchestration) === null || _e === void 0 ? void 0 : _e.flags) === null || _f === void 0 ? void 0 : _f.options) === null || _g === void 0 ? void 0 : _g.readonly_mode) !== undefined) {
            metrics.readonly_mode = trace.orchestration.flags.options.readonly_mode;
        }
        if (trace.orchestration_mode) {
            metrics.orchestration_mode = trace.orchestration_mode;
        }
        if (trace.risk) {
            metrics.risk = trace.risk;
        }
    }
    if (((_h = response.result) === null || _h === void 0 ? void 0 : _h.status) === 'REDIRECT_REQUIRED' && ((_k = (_j = response.result) === null || _j === void 0 ? void 0 : _j.payload) === null || _k === void 0 ? void 0 : _k.redirectInfo)) {
        metrics.redirect_reason = response.result.payload.redirectInfo.redirect_reason;
    }
    if ((_m = (_l = response.result) === null || _l === void 0 ? void 0 : _l.payload) === null || _m === void 0 ? void 0 : _m.errorType) {
        metrics.error_type = response.result.payload.errorType;
    }
    if ((_o = response.explain) === null || _o === void 0 ? void 0 : _o.decision_log) {
        const decisionLog = response.explain.decision_log;
        const withEvidence = decisionLog.filter((entry) => entry.evidence_refs && entry.evidence_refs.length > 0).length;
        metrics.decision_log_completeness = decisionLog.length > 0
            ? withEvidence / decisionLog.length
            : 0;
    }
    return metrics;
}
class MetricsRecorder {
    static recordEntryPoint(entryPoint) {
        if (!entryPoint)
            return;
        console.log(`[Metrics] ${exports.AgentMetrics.entryPointDistribution.name}: ${entryPoint}`);
    }
    static recordReadonlyMode(readonlyMode) {
        console.log(`[Metrics] ${exports.AgentMetrics.readonlyModeUsage.name}: ${readonlyMode}`);
    }
    static recordRedirect(redirectReason, entryPoint) {
        console.log(`[Metrics] ${exports.AgentMetrics.redirectTriggerRate.name}: ${redirectReason} (entry_point: ${entryPoint})`);
    }
    static recordClarification(errorType) {
        console.log(`[Metrics] ${exports.AgentMetrics.clarificationTriggerRate.name}: ${errorType}`);
    }
    static recordDecisionLogCompleteness(completeness) {
        console.log(`[Metrics] ${exports.AgentMetrics.decisionLogCompleteness.name}: ${completeness}`);
    }
    static recordOrchestrationMode(mode) {
        console.log(`[Metrics] ${exports.AgentMetrics.orchestrationModeDistribution.name}: ${mode}`);
    }
    static recordRisk(risk) {
        console.log(`[Metrics] ${exports.AgentMetrics.riskDistribution.name}: ${risk}`);
    }
}
exports.MetricsRecorder = MetricsRecorder;
//# sourceMappingURL=agent-metrics.util.js.map