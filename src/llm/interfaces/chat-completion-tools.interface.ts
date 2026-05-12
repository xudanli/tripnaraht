/**
 * OpenAI-compatible chat completions with tool calling (TripNARA Agent Loop).
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatToolCall {
  id: string;
  type?: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Message shape for OpenAI / DeepSeek / vLLM chat/completions */
export interface ChatCompletionMessage {
  role: ChatRole;
  content?: string | null;
  name?: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

export interface OpenAiFunctionToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

export interface ChatCompletionsToolCallParsed {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatCompletionsWithToolsResult {
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ChatCompletionsToolCallParsed[];
  };
  finishReason?: string | null;
  rawResponse: unknown;
}
