export declare enum AgentEventType {
    ROUTER_DECISION = "router_decision",
    SYSTEM2_STEP = "system2_step",
    CRITIC_RESULT = "critic_result",
    WEBBROWSE_BLOCKED = "webbrowse_blocked",
    FALLBACK_TRIGGERED = "fallback_triggered",
    AGENT_COMPLETE = "agent_complete"
}
export interface AgentEvent {
    type: AgentEventType;
    request_id: string;
    timestamp: number;
    data: Record<string, any>;
    metadata?: {
        route?: string;
        step?: number;
        latency_ms?: number;
        [key: string]: any;
    };
}
export declare class EventTelemetryService {
    private readonly logger;
    private readonly events;
    private readonly maxEventsInMemory;
    recordEvent(event: Omit<AgentEvent, 'timestamp'>): void;
    recordRouterDecision(requestId: string, route: string, confidence: number, reasons: string[], latencyMs: number, additionalData?: Record<string, any>): void;
    recordSystem2Step(requestId: string, step: number, action: string, result: any, latencyMs?: number, additionalData?: Record<string, any>): void;
    recordCriticResult(requestId: string, violations: string[], passed: boolean, repairActions?: string[], additionalData?: Record<string, any>): void;
    recordWebbrowseBlocked(requestId: string, reason: string, additionalData?: Record<string, any>): void;
    recordFallbackTriggered(requestId: string, originalRoute: string, fallbackRoute: string, reason: string, additionalData?: Record<string, any>): void;
    recordAgentComplete(requestId: string, status: string, latencyMs: number, tokenCount?: number, costUsd?: number, additionalData?: Record<string, any>): void;
    getEvents(requestId?: string, eventType?: AgentEventType): AgentEvent[];
    clearEvents(): void;
    getStats(): {
        total: number;
        byType: Record<string, number>;
        byRequest: Record<string, number>;
    };
}
