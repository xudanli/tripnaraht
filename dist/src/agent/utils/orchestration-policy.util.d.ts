import { OrchestrationOptions } from './resolve-orchestration-mode.util';
import { RoutingSignals } from './orchestration-signals.util';
import { OrchestrationMode, ResolveModeResult } from './resolve-orchestration-mode.util';
import { CircuitBreaker, ModeLock, StabilityContext } from '../services/orchestration-stability.util';
export interface OrchestrationPolicyDecision {
    mode: OrchestrationMode;
    reason: string;
    matchedRules: string[];
    signals: RoutingSignals;
    flags: ResolveModeResult['flags'];
    recommendations?: {
        useStateMachine?: boolean;
        enableAudit?: boolean;
        requireConsent?: boolean;
        reason?: string;
    };
}
export declare function routePolicy(env: NodeJS.ProcessEnv, options: OrchestrationOptions | undefined, signals: RoutingSignals, stabilityContext?: StabilityContext, modeLock?: ModeLock, breakers?: {
    sm?: CircuitBreaker;
    dyn?: CircuitBreaker;
    legacy?: CircuitBreaker;
}): OrchestrationPolicyDecision;
