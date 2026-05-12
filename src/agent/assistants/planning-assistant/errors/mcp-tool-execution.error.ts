import type { OrchestratorRobustnessMetadata } from '../../../utils/orchestrator-failure-taxonomy.util';

/**
 * MCP 工具调用失败：在 dispatcher 层打上 I5 指纹（含 JSON-RPC / HTTP 语义）。
 */
export class McpToolExecutionError extends Error {
  readonly orchestratorRobustness: OrchestratorRobustnessMetadata;
  readonly mcpService: string;
  readonly mcpTool: string;
  /** ES2022 cause；不显式 override，兼容 lib 未声明 Error.cause 的 TS 配置 */
  readonly cause?: unknown;

  constructor(
    message: string,
    opts: {
      orchestratorRobustness: OrchestratorRobustnessMetadata;
      mcpService: string;
      mcpTool: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'McpToolExecutionError';
    this.orchestratorRobustness = opts.orchestratorRobustness;
    this.mcpService = opts.mcpService;
    this.mcpTool = opts.mcpTool;
    this.cause = opts.cause;
  }
}

export function isMcpToolExecutionError(e: unknown): e is McpToolExecutionError {
  return e instanceof McpToolExecutionError;
}
