"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routePolicy = routePolicy;
const resolve_orchestration_mode_util_1 = require("./resolve-orchestration-mode.util");
function applySimpleLegacyFallbackRule(modeResult, options, signals) {
    const explicitlyEnabled = (options === null || options === void 0 ? void 0 : options.use_claude_orchestration) === true;
    if ((modeResult.mode === 'CLAUDE_SM' || modeResult.mode === 'CLAUDE_DYNAMIC') &&
        !explicitlyEnabled &&
        signals.complexity === 'SIMPLE' &&
        signals.legacyWellSupported &&
        signals.latencyBudgetMs < 3000) {
        return {
            mode: 'LEGACY',
            reason: `${modeResult.reason} → LEGACY (simple request + fast budget + legacy well supported, Claude not explicitly enabled)`,
            rule: 'rule_simple_legacy_fallback',
        };
    }
    return null;
}
function applyExplicitClaudeSimpleDynamicRule(modeResult, options, signals) {
    const explicitlyEnabled = (options === null || options === void 0 ? void 0 : options.use_claude_orchestration) === true;
    const explicitlyStateMachine = (options === null || options === void 0 ? void 0 : options.use_state_machine_orchestration) === true;
    if (explicitlyStateMachine) {
        return null;
    }
    if (explicitlyEnabled &&
        modeResult.mode === 'CLAUDE_SM' &&
        signals.complexity === 'SIMPLE' &&
        !signals.requiresStructuredOutput) {
        return {
            mode: 'CLAUDE_DYNAMIC',
            reason: `${modeResult.reason} → CLAUDE_DYNAMIC (simple task, explicit Claude enabled, no structured output required)`,
            rule: 'rule_explicit_claude_simple_dynamic',
        };
    }
    return null;
}
function applyComplexStructuredSMRule(modeResult, signals) {
    if (modeResult.mode === 'CLAUDE_DYNAMIC' &&
        signals.requiresStructuredOutput &&
        signals.expectsToolCalls &&
        (signals.taskType === 'TRIP_PLANNING' || signals.taskType === 'BOOKING_WORKFLOW') &&
        signals.complexity !== 'SIMPLE') {
        return {
            mode: 'CLAUDE_SM',
            reason: `${modeResult.reason} → CLAUDE_SM (structured output + tool calls + trip/booking + not simple)`,
            rule: 'rule_sm_for_complex_structured',
        };
    }
    return null;
}
function applySimpleDynamicRule(modeResult, options, signals) {
    const explicitlyStateMachine = (options === null || options === void 0 ? void 0 : options.use_state_machine_orchestration) === true;
    if (explicitlyStateMachine) {
        return null;
    }
    if (modeResult.mode === 'CLAUDE_SM' &&
        signals.complexity === 'SIMPLE' &&
        !signals.requiresStructuredOutput) {
        return {
            mode: 'CLAUDE_DYNAMIC',
            reason: `${modeResult.reason} → CLAUDE_DYNAMIC (simple task, no structured output required)`,
            rule: 'rule_dynamic_for_simple',
        };
    }
    return null;
}
function routePolicy(env, options, signals, stabilityContext, modeLock, breakers) {
    const matchedRules = [];
    const modeResult = (0, resolve_orchestration_mode_util_1.resolveOrchestrationMode)(env, options);
    matchedRules.push(`flag_resolution: ${modeResult.mode}`);
    let finalMode = modeResult.mode;
    let reason = modeResult.reason;
    const recommendations = {};
    if (stabilityContext && modeLock) {
        const lockedMode = modeLock.get(stabilityContext);
        if (lockedMode) {
            finalMode = lockedMode;
            reason = `${reason} → ${lockedMode} (ModeLock: 复用上次成功模式，避免抖动)`;
            matchedRules.push('rule_mode_lock_priority');
        }
    }
    if (breakers) {
        const checkBreaker = (mode) => {
            if (mode === 'CLAUDE_SM' && breakers.sm && !breakers.sm.canPass()) {
                matchedRules.push('rule_breaker_open_claude_sm');
                return 'CLAUDE_DYNAMIC';
            }
            if (mode === 'CLAUDE_DYNAMIC' && breakers.dyn && !breakers.dyn.canPass()) {
                matchedRules.push('rule_breaker_open_claude_dynamic');
                return 'LEGACY';
            }
            if (mode === 'LEGACY' && breakers.legacy && !breakers.legacy.canPass()) {
                matchedRules.push('rule_breaker_open_legacy');
                return null;
            }
            return null;
        };
        let breakerAdjustedMode = checkBreaker(finalMode);
        if (breakerAdjustedMode) {
            reason = `${reason} → ${breakerAdjustedMode} (Circuit Breaker: ${finalMode} 已熔断，自动降级)`;
            finalMode = breakerAdjustedMode;
            const secondBreakerAdjusted = checkBreaker(finalMode);
            if (secondBreakerAdjusted) {
                reason = `${reason} → ${secondBreakerAdjusted} (Circuit Breaker: ${finalMode} 也已熔断，继续降级)`;
                finalMode = secondBreakerAdjusted;
            }
        }
    }
    if (modeResult.mode === 'CLAUDE_SM' || modeResult.mode === 'CLAUDE_DYNAMIC') {
        const fallbackResult = applySimpleLegacyFallbackRule(modeResult, options, signals);
        if (fallbackResult) {
            finalMode = fallbackResult.mode;
            reason = fallbackResult.reason;
            matchedRules.push(fallbackResult.rule);
            recommendations.useStateMachine = true;
            recommendations.reason = 'signals suggest Claude SM for better structured output, but request is simple and legacy supported';
        }
        else {
            const dynamicResult = applyExplicitClaudeSimpleDynamicRule(modeResult, options, signals);
            if (dynamicResult) {
                finalMode = dynamicResult.mode;
                reason = dynamicResult.reason;
                matchedRules.push(dynamicResult.rule);
                recommendations.useStateMachine = false;
            }
            else {
                const smResult = applyComplexStructuredSMRule(modeResult, signals);
                if (smResult) {
                    finalMode = smResult.mode;
                    reason = smResult.reason;
                    matchedRules.push(smResult.rule);
                    recommendations.useStateMachine = true;
                }
                else {
                    const simpleDynamicResult = applySimpleDynamicRule(modeResult, options, signals);
                    if (simpleDynamicResult) {
                        finalMode = simpleDynamicResult.mode;
                        reason = simpleDynamicResult.reason;
                        matchedRules.push(simpleDynamicResult.rule);
                        recommendations.useStateMachine = false;
                    }
                }
            }
        }
    }
    if (finalMode === 'LEGACY') {
        if (!signals.legacyWellSupported && (signals.taskType === 'TRIP_PLANNING' || signals.taskType === 'BOOKING_WORKFLOW')) {
            recommendations.useStateMachine = true;
            recommendations.reason = `signals suggest Claude SM would be better for ${signals.taskType}, but Claude orchestration is disabled`;
            matchedRules.push('recommendation_sm_for_trip_booking');
        }
    }
    recommendations.enableAudit = signals.needsAudit;
    if (options === null || options === void 0 ? void 0 : options.dry_run) {
        recommendations.enableAudit = false;
        matchedRules.push('rule_dry_run_no_audit');
    }
    const needsWebBrowse = signals.expectsToolCalls &&
        (signals.taskType === 'BOOKING_WORKFLOW' || signals.taskType === 'TRIP_PLANNING');
    const allowWebbrowse = (options === null || options === void 0 ? void 0 : options.allow_webbrowse) === true;
    if (needsWebBrowse && !allowWebbrowse) {
        recommendations.requireConsent = true;
        recommendations.reason = 'needs webbrowse or external data access but allow_webbrowse not enabled';
        matchedRules.push('rule_consent_webbrowse_required');
    }
    else {
        recommendations.requireConsent = false;
    }
    const decision = {
        mode: finalMode,
        reason,
        matchedRules,
        signals,
        flags: modeResult.flags,
        recommendations: Object.keys(recommendations).length > 0 ? recommendations : undefined,
    };
    Object.freeze(decision);
    if (decision.recommendations) {
        Object.freeze(decision.recommendations);
    }
    Object.freeze(decision.signals);
    Object.freeze(decision.flags);
    return decision;
}
//# sourceMappingURL=orchestration-policy.util.js.map