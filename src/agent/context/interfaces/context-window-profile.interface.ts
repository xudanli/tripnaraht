// src/agent/context/interfaces/context-window-profile.interface.ts

export type ContextConsumerProfile =
  | 'intent_compiler'
  | 'agent_telemetry'
  | 'orchestrator_claude'
  | 'repair_executor'
  | 'request_dedup'
  | 'default';

export interface ProfileConfig {
  limit: number;
}

export const CONTEXT_PROFILES: Record<ContextConsumerProfile, ProfileConfig> = {
  intent_compiler: { limit: 3 },
  request_dedup: { limit: 3 },
  repair_executor: { limit: 5 },
  agent_telemetry: { limit: 6 },
  default: { limit: 10 },
  orchestrator_claude: { limit: 16 },
} as const;
