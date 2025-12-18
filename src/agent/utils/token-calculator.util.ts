// src/agent/utils/token-calculator.util.ts

/**
 * Token Calculator Utility
 * 
 * 用于估算 LLM token 数量
 * 
 * 注意：这是一个简化的估算方法。对于更精确的计数，可以集成 tiktoken 库
 * 
 * 估算规则（基于 OpenAI 模型）：
 * - 英文：1 token ≈ 4 个字符
 * - 中文：1 token ≈ 1.5 个字符
 * - JSON/代码：1 token ≈ 3-4 个字符
 */

export class TokenCalculator {
  /**
   * 估算文本的 token 数量
   * 
   * @param text 要计算的文本
   * @returns 估算的 token 数量
   */
  static estimateTokens(text: string | null | undefined): number {
    if (!text) {
      return 0;
    }

    const str = String(text);
    
    // 计算中文字符数量（包括 CJK 统一表意文字）
    const chineseChars = (str.match(/[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf]/g) || []).length;
    
    // 计算其他字符数量（包括英文、数字、标点等）
    const otherChars = str.length - chineseChars;
    
    // 估算：中文 1 token ≈ 1.5 字符，其他 1 token ≈ 4 字符
    const chineseTokens = Math.ceil(chineseChars / 1.5);
    const otherTokens = Math.ceil(otherChars / 4);
    
    return chineseTokens + otherTokens;
  }

  /**
   * 估算 JSON 对象的 token 数量
   * 
   * @param obj 要计算的 JSON 对象
   * @returns 估算的 token 数量
   */
  static estimateJsonTokens(obj: any): number {
    if (obj === null || obj === undefined) {
      return 0;
    }

    try {
      const jsonString = JSON.stringify(obj);
      // JSON 格式的 token 估算：结构字符（{}, [], :, ,）和字符串内容
      // 结构字符通常占用较少 token，字符串内容按普通文本估算
      return this.estimateTokens(jsonString);
    } catch (error) {
      // 如果序列化失败，使用 toString() 估算
      return this.estimateTokens(String(obj));
    }
  }

  /**
   * 估算消息数组的 token 数量（用于 Chat Completion API）
   * 
   * @param messages 消息数组
   * @returns 估算的 token 数量
   */
  static estimateMessagesTokens(messages: Array<{ role?: string; content?: string }>): number {
    if (!messages || !Array.isArray(messages)) {
      return 0;
    }

    let total = 0;
    
    // 每条消息的开销（role + content 的结构）
    const messageOverhead = 4; // 估算每条消息的结构开销
    
    for (const message of messages) {
      total += messageOverhead;
      
      if (message.role) {
        total += this.estimateTokens(message.role);
      }
      
      if (message.content) {
        total += this.estimateTokens(message.content);
      }
    }
    
    return total;
  }

  /**
   * 估算 AgentState 的 token 数量
   * 
   * @param state AgentState 对象
   * @returns 估算的 token 数量
   */
  static estimateStateTokens(state: any): number {
    if (!state) {
      return 0;
    }

    let total = 0;

    // 用户输入
    total += this.estimateTokens(state.user_input);

    // 行程信息（简化估算）
    if (state.trip) {
      total += this.estimateJsonTokens(state.trip);
    }

    // 记忆（语义事实等）
    if (state.memory) {
      total += this.estimateJsonTokens(state.memory);
    }

    // 计算中间结果
    if (state.compute) {
      total += this.estimateJsonTokens(state.compute);
    }

    // 结果状态
    if (state.result) {
      total += this.estimateJsonTokens(state.result);
    }

    return total;
  }

  /**
   * 计算请求和响应的总 token 数
   * 
   * @param requestText 请求文本
   * @param responseText 响应文本
   * @param additionalData 额外的数据（如 state、payload 等）
   * @returns 估算的总 token 数量
   */
  static estimateTotalTokens(
    requestText: string | null | undefined,
    responseText: string | null | undefined,
    additionalData?: any
  ): number {
    let total = 0;

    // 请求 token
    total += this.estimateTokens(requestText);

    // 响应 token
    total += this.estimateTokens(responseText);

    // 额外数据 token（如果提供）
    if (additionalData) {
      total += this.estimateJsonTokens(additionalData);
    }

    // API 调用开销（估算）
    const apiOverhead = 10; // 请求/响应的结构开销
    total += apiOverhead;

    return total;
  }
}

