export const INCREMENTAL_RECOMPUTE_LLM = Symbol('INCREMENTAL_RECOMPUTE_LLM');

export type IncrementalRecomputeChatMessageV1 = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** 编排器消费的 LLM 端口：由上层注入真实 Provider 或 Mock */
export interface IncrementalRecomputeLlmPort {
  chat(messages: IncrementalRecomputeChatMessageV1[]): Promise<string>;
}
