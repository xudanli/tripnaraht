// src/llm/utils/retry-with-backoff.ts
/**
 * 重试工具函数（带指数退避和抖动）
 * 
 * 用于处理网络错误（ECONNRESET、ETIMEDOUT、EAI_AGAIN 等）
 */

export interface RetryOptions {
  maxRetries?: number; // 最大重试次数，默认 3
  initialDelayMs?: number; // 初始延迟（毫秒），默认 200
  maxDelayMs?: number; // 最大延迟（毫秒），默认 2000
  factor?: number; // 指数因子，默认 2
  jitter?: boolean; // 是否添加随机抖动，默认 true
  retryableErrors?: string[]; // 可重试的错误代码/消息，默认包含常见网络错误
}

const DEFAULT_RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'no response received',
  'network',
  'timeout',
];

/**
 * 执行带重试的函数
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 200,
    maxDelayMs = 2000,
    factor = 2,
    jitter = true,
    retryableErrors = DEFAULT_RETRYABLE_ERRORS,
  } = options;

  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // 检查是否是可重试的错误
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || '';
      const isRetryable = retryableErrors.some(
        retryableError =>
          errorMessage.includes(retryableError) ||
          errorCode.includes(retryableError)
      );
      
      if (!isRetryable) {
        // 如果不是可重试的错误，直接抛出
        throw error;
      }
      
      // 计算延迟时间（指数退避）
      const baseDelay = Math.min(
        initialDelayMs * Math.pow(factor, attempt),
        maxDelayMs
      );
      
      // 添加随机抖动（±20%）
      const jitterAmount = jitter ? baseDelay * 0.2 * (Math.random() * 2 - 1) : 0;
      const delay = Math.max(0, baseDelay + jitterAmount);
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, Math.round(delay)));
    }
  }
  
  // 理论上不会到达这里，但 TypeScript 需要
  throw lastError;
}


