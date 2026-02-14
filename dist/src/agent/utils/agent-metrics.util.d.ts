export type EntryPoint = 'trip_detail_page' | 'trip_list_page' | 'dashboard' | 'planning_workbench';
export type RedirectReason = 'READONLY_MODE_RESTRICTION' | 'PLANNING_REQUEST_DETECTED' | 'INSUFFICIENT_PERMISSIONS' | 'FEATURE_MIGRATED' | 'MISSING_TRIP_ID';
export declare const AgentMetrics: {
    readonly entryPointDistribution: {
        readonly name: "agent_entry_point_distribution";
        readonly labels: readonly ["entry_point"];
        readonly description: "不同入口来源的请求分布";
    };
    readonly readonlyModeUsage: {
        readonly name: "agent_readonly_mode_usage_rate";
        readonly description: "只读模式使用率";
    };
    readonly redirectTriggerRate: {
        readonly name: "agent_redirect_trigger_rate";
        readonly labels: readonly ["redirect_reason", "entry_point"];
        readonly description: "重定向触发率";
    };
    readonly clarificationTriggerRate: {
        readonly name: "agent_clarification_trigger_rate";
        readonly labels: readonly ["error_type"];
        readonly description: "澄清消息触发率";
    };
    readonly decisionLogCompleteness: {
        readonly name: "agent_decision_log_completeness";
        readonly description: "决策日志完整性（包含 evidence_refs 的占比）";
    };
    readonly orchestrationModeDistribution: {
        readonly name: "agent_orchestration_mode_distribution";
        readonly labels: readonly ["mode"];
        readonly description: "编排模式分布";
    };
    readonly riskDistribution: {
        readonly name: "agent_risk_distribution";
        readonly labels: readonly ["risk"];
        readonly description: "风险级别分布";
    };
};
export interface TraceMetrics {
    entry_point?: EntryPoint;
    readonly_mode?: boolean;
    redirect_reason?: RedirectReason;
    error_type?: string;
    orchestration_mode?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
    risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    decision_log_completeness?: number;
}
export declare function extractMetricsFromResponse(response: any): TraceMetrics;
export declare class MetricsRecorder {
    static recordEntryPoint(entryPoint: EntryPoint | undefined): void;
    static recordReadonlyMode(readonlyMode: boolean): void;
    static recordRedirect(redirectReason: RedirectReason, entryPoint?: EntryPoint): void;
    static recordClarification(errorType: string): void;
    static recordDecisionLogCompleteness(completeness: number): void;
    static recordOrchestrationMode(mode: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM'): void;
    static recordRisk(risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): void;
}
