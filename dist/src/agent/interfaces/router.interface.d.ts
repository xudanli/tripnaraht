export declare enum RouteType {
    SYSTEM1_API = "SYSTEM1_API",
    SYSTEM1_RAG = "SYSTEM1_RAG",
    SYSTEM2_REASONING = "SYSTEM2_REASONING",
    SYSTEM2_WEBBROWSE = "SYSTEM2_WEBBROWSE"
}
export declare enum RouterReason {
    MULTI_CONSTRAINT = "MULTI_CONSTRAINT",
    MISSING_INFO = "MISSING_INFO",
    NO_API = "NO_API",
    REALTIME_WEB = "REALTIME_WEB",
    HIGH_RISK_ACTION = "HIGH_RISK_ACTION",
    LLM_DECISION = "LLM_DECISION",
    REDIRECT_TO_PLANNING_WORKBENCH = "REDIRECT_TO_PLANNING_WORKBENCH"
}
export declare enum UIStatus {
    THINKING = "thinking",
    BROWSING = "browsing",
    VERIFYING = "verifying",
    REPAIRING = "repairing",
    AWAITING_CONSENT = "awaiting_consent",
    AWAITING_CONFIRMATION = "awaiting_confirmation",
    DONE = "done",
    FAILED = "failed",
    REDIRECT_REQUIRED = "redirect_required"
}
export interface RouterOutput {
    route: RouteType;
    confidence: number;
    reasons: RouterReason[];
    required_capabilities: string[];
    consent_required: boolean;
    budget: {
        max_seconds: number;
        max_steps: number;
        max_browser_steps: number;
    };
    ui_hint: {
        mode: 'fast' | 'slow';
        status: UIStatus;
        message: string;
    };
}
