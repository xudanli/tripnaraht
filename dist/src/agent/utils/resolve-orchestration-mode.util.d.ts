export type OrchestrationMode = 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
export interface OrchestrationOptions {
    use_claude_orchestration?: boolean;
    use_state_machine_orchestration?: boolean;
    dry_run?: boolean;
    allow_webbrowse?: boolean;
}
export interface ResolveModeResult {
    mode: OrchestrationMode;
    reason: string;
    flags: {
        env_USE_CLAUDE_ORCHESTRATION: boolean;
        opt_use_claude_orchestration?: boolean;
        opt_use_state_machine_orchestration?: boolean;
        derived_use_state_machine_orchestration?: boolean;
    };
}
export declare function resolveOrchestrationMode(env: NodeJS.ProcessEnv, options?: OrchestrationOptions): ResolveModeResult;
export declare const MODE_DECISION_TABLE: Array<{
    env_USE_CLAUDE_ORCHESTRATION: boolean;
    opt_use_claude_orchestration?: boolean;
    opt_use_state_machine_orchestration?: boolean;
    expected_mode: OrchestrationMode;
    expected_reason: string;
}>;
