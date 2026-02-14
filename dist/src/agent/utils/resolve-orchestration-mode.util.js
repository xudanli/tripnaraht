"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODE_DECISION_TABLE = void 0;
exports.resolveOrchestrationMode = resolveOrchestrationMode;
function resolveOrchestrationMode(env, options) {
    var _a;
    const envClaude = ((_a = env.USE_CLAUDE_ORCHESTRATION) !== null && _a !== void 0 ? _a : '').toLowerCase() === 'true';
    const optClaude = options === null || options === void 0 ? void 0 : options.use_claude_orchestration;
    const claudeEnabled = optClaude !== undefined ? optClaude : envClaude;
    if (!claudeEnabled) {
        return {
            mode: 'LEGACY',
            reason: 'Claude orchestration disabled (options.use_claude_orchestration/env USE_CLAUDE_ORCHESTRATION).',
            flags: {
                env_USE_CLAUDE_ORCHESTRATION: envClaude,
                opt_use_claude_orchestration: optClaude,
                opt_use_state_machine_orchestration: options === null || options === void 0 ? void 0 : options.use_state_machine_orchestration,
            },
        };
    }
    const derivedSM = (options === null || options === void 0 ? void 0 : options.use_state_machine_orchestration) !== false;
    const mode = derivedSM ? 'CLAUDE_SM' : 'CLAUDE_DYNAMIC';
    return {
        mode,
        reason: derivedSM
            ? 'Claude orchestration enabled + state machine enabled (default true unless explicitly false).'
            : 'Claude orchestration enabled + state machine explicitly disabled.',
        flags: {
            env_USE_CLAUDE_ORCHESTRATION: envClaude,
            opt_use_claude_orchestration: optClaude,
            opt_use_state_machine_orchestration: options === null || options === void 0 ? void 0 : options.use_state_machine_orchestration,
            derived_use_state_machine_orchestration: derivedSM,
        },
    };
}
exports.MODE_DECISION_TABLE = [
    {
        env_USE_CLAUDE_ORCHESTRATION: false,
        opt_use_claude_orchestration: undefined,
        opt_use_state_machine_orchestration: undefined,
        expected_mode: 'LEGACY',
        expected_reason: 'Claude orchestration disabled',
    },
    {
        env_USE_CLAUDE_ORCHESTRATION: true,
        opt_use_claude_orchestration: undefined,
        opt_use_state_machine_orchestration: undefined,
        expected_mode: 'CLAUDE_SM',
        expected_reason: 'state machine enabled (default true)',
    },
    {
        env_USE_CLAUDE_ORCHESTRATION: false,
        opt_use_claude_orchestration: true,
        opt_use_state_machine_orchestration: undefined,
        expected_mode: 'CLAUDE_SM',
        expected_reason: 'state machine enabled (default true)',
    },
    {
        env_USE_CLAUDE_ORCHESTRATION: false,
        opt_use_claude_orchestration: true,
        opt_use_state_machine_orchestration: true,
        expected_mode: 'CLAUDE_SM',
        expected_reason: 'state machine enabled',
    },
    {
        env_USE_CLAUDE_ORCHESTRATION: false,
        opt_use_claude_orchestration: true,
        opt_use_state_machine_orchestration: false,
        expected_mode: 'CLAUDE_DYNAMIC',
        expected_reason: 'state machine explicitly disabled',
    },
    {
        env_USE_CLAUDE_ORCHESTRATION: true,
        opt_use_claude_orchestration: false,
        opt_use_state_machine_orchestration: undefined,
        expected_mode: 'LEGACY',
        expected_reason: 'Claude orchestration disabled',
    },
    {
        env_USE_CLAUDE_ORCHESTRATION: true,
        opt_use_claude_orchestration: false,
        opt_use_state_machine_orchestration: true,
        expected_mode: 'LEGACY',
        expected_reason: 'Claude orchestration disabled',
    },
];
//# sourceMappingURL=resolve-orchestration-mode.util.js.map