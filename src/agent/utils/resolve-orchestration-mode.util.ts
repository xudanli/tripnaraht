// src/agent/utils/resolve-orchestration-mode.util.ts

/**
 * 编排模式类型
 */
export type OrchestrationMode = 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';

/**
 * 编排选项
 */
export interface OrchestrationOptions {
  use_claude_orchestration?: boolean;
  use_state_machine_orchestration?: boolean; // default true when claude enabled
  // 以下字段用于策略决策，但不影响模式判定
  dry_run?: boolean;
  allow_webbrowse?: boolean;
  /** 用户显式决策授权 → DECISION_AUTHORIZED（不影响编排模式判定） */
  decision_consent?: boolean;
}

/**
 * 模式判定结果
 */
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

/**
 * 解析编排模式
 * 
 * 优先级规则：
 * 1. request.options.use_claude_orchestration > env USE_CLAUDE_ORCHESTRATION > default (false)
 * 2. use_state_machine_orchestration 仅在 claude 启用时生效，默认 true
 * 
 * @param env 环境变量
 * @param options 请求选项
 * @returns 模式判定结果（包含决策原因和所有标志位，用于日志/trace）
 */
export function resolveOrchestrationMode(
  env: NodeJS.ProcessEnv,
  options?: OrchestrationOptions,
): ResolveModeResult {
  // 1. 读取环境变量
  const envClaude = (env.USE_CLAUDE_ORCHESTRATION ?? '').toLowerCase() === 'true';

  // 2. 优先级：request options > env var > default (false)
  const optClaude = options?.use_claude_orchestration;
  const claudeEnabled = optClaude !== undefined ? optClaude : envClaude;

  // 3. 如果 Claude 编排未启用，返回 LEGACY 模式
  if (!claudeEnabled) {
    return {
      mode: 'LEGACY',
      reason: 'Claude orchestration disabled (options.use_claude_orchestration/env USE_CLAUDE_ORCHESTRATION).',
      flags: {
        env_USE_CLAUDE_ORCHESTRATION: envClaude,
        opt_use_claude_orchestration: optClaude,
        opt_use_state_machine_orchestration: options?.use_state_machine_orchestration,
      },
    };
  }

  // 4. Claude 已启用，判定使用状态机还是动态编排
  // use_state_machine_orchestration 默认 true（除非显式设置为 false）
  const derivedSM = options?.use_state_machine_orchestration !== false;
  const mode: OrchestrationMode = derivedSM ? 'CLAUDE_SM' : 'CLAUDE_DYNAMIC';

  return {
    mode,
    reason: derivedSM
      ? 'Claude orchestration enabled + state machine enabled (default true unless explicitly false).'
      : 'Claude orchestration enabled + state machine explicitly disabled.',
    flags: {
      env_USE_CLAUDE_ORCHESTRATION: envClaude,
      opt_use_claude_orchestration: optClaude,
      opt_use_state_machine_orchestration: options?.use_state_machine_orchestration,
      derived_use_state_machine_orchestration: derivedSM,
    },
  };
}

/**
 * 模式判定真值表（用于文档和测试）
 */
export const MODE_DECISION_TABLE: Array<{
  env_USE_CLAUDE_ORCHESTRATION: boolean;
  opt_use_claude_orchestration?: boolean;
  opt_use_state_machine_orchestration?: boolean;
  expected_mode: OrchestrationMode;
  expected_reason: string;
}> = [
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
