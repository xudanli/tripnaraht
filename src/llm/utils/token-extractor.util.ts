// src/llm/utils/token-extractor.util.ts

/**
 * Token使用数据提取工具
 * 
 * 从各个LLM提供商的API响应中提取Token使用数据
 */

import { LlmProvider } from '../dto/llm-request.dto';

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * 从API响应中提取Token使用数据
 */
export function extractTokenUsage(
  provider: LlmProvider,
  response: any,
  prompt: string
): TokenUsage {
  switch (provider) {
    case LlmProvider.OPENAI:
      return extractOpenAITokenUsage(response, prompt);
    case LlmProvider.ANTHROPIC:
      return extractAnthropicTokenUsage(response, prompt);
    case LlmProvider.DEEPSEEK:
      return extractDeepSeekTokenUsage(response, prompt);
    case LlmProvider.GEMINI:
      return extractGeminiTokenUsage(response, prompt);
    default:
      return estimateTokenUsage(prompt, '');
  }
}

/**
 * 提取OpenAI Token使用
 */
function extractOpenAITokenUsage(response: any, prompt: string): TokenUsage {
  // OpenAI API响应中包含usage字段
  if (response?.usage) {
    return {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
    };
  }
  
  // 如果没有usage字段，使用估算
  const completion = response?.choices?.[0]?.message?.content || '';
  return estimateTokenUsage(prompt, completion);
}

/**
 * 提取Anthropic Token使用
 */
function extractAnthropicTokenUsage(response: any, prompt: string): TokenUsage {
  // Anthropic API响应中包含usage字段
  if (response?.usage) {
    return {
      prompt_tokens: response.usage.input_tokens || 0,
      completion_tokens: response.usage.output_tokens || 0,
      total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
    };
  }
  
  // 如果没有usage字段，使用估算
  const completion = response?.content?.[0]?.text || '';
  return estimateTokenUsage(prompt, completion);
}

/**
 * 提取DeepSeek Token使用
 */
function extractDeepSeekTokenUsage(response: any, prompt: string): TokenUsage {
  // DeepSeek API响应中包含usage字段（与OpenAI格式相同）
  if (response?.usage) {
    return {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
    };
  }
  
  // 如果没有usage字段，使用估算
  const completion = response?.choices?.[0]?.message?.content || '';
  return estimateTokenUsage(prompt, completion);
}

/**
 * 提取Gemini Token使用
 */
function extractGeminiTokenUsage(response: any, prompt: string): TokenUsage {
  // Gemini API响应中包含usageMetadata字段
  if (response?.usageMetadata) {
    return {
      prompt_tokens: response.usageMetadata.promptTokenCount || 0,
      completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata.totalTokenCount || 0,
    };
  }
  
  // 如果没有usageMetadata字段，使用估算
  const completion = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return estimateTokenUsage(prompt, completion);
}

/**
 * 估算Token使用（基于字符数）
 * 
 * 简单估算：4字符 ≈ 1 token（适用于英文和中文）
 */
function estimateTokenUsage(prompt: string, completion: string): TokenUsage {
  const promptTokens = Math.ceil(prompt.length / 4);
  const completionTokens = Math.ceil(completion.length / 4);
  const totalTokens = promptTokens + completionTokens;
  
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}
