export interface AgentRunResult {
  agent: string;
  output: unknown;
}

export interface AgentInput {
  [key: string]: unknown;
}
